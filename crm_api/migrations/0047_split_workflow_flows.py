"""The workroom gets two paths: plain stitching, and maggam.

Orders placed before this keep the single line they were created with, marked
'legacy'. Every boutique's saved workflow gains the maggam stages (paper
cutting, assignment, the work, its verification, fabric cutting) after the
shared Fabric stage, and the existing cutting/maggam stages learn which path
they belong to. A boutique's own stage names are kept; only names still equal
to the old default are refreshed.
"""

from django.db import migrations

from crm_api.models import get_default_workflow


def forwards(apps, schema_editor):
    Order = apps.get_model('crm_api', 'Order')
    Order.objects.update(flow='legacy')

    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    default = {s['key']: s for s in get_default_workflow()}
    maggam_keys = ['paper_cutting', 'maggam_work',
                   'maggam_verification', 'fabric_cutting']
    renames = {'pattern_cutting': ('Pattern cutting', 'Cutting'),
               'maggam_work': ('Maggam work', 'Maggam design')}

    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if s.get('key')]
        present = {s['key'] for s in config}
        for s in config:
            if s['key'] in default and 'flows' in default[s['key']]:
                s['flows'] = default[s['key']]['flows']
            if s['key'] == 'maggam_work':
                s.pop('optional', None)
            old, new = renames.get(s['key'], (None, None))
            if old is not None and s.get('name') == old:
                s['name'] = new
        # The maggam path slots in after Fabric, keeping the boutique's order
        # for everything it already had.
        insert_at = next((i + 1 for i, s in enumerate(config) if s['key'] == 'fabric_confirmed'), 3)
        # An existing maggam_work stage is moved into the path rather than
        # duplicated.
        existing_maggam = next((s for s in config if s['key'] == 'maggam_work'), None)
        config = [s for s in config if s['key'] != 'maggam_work']
        new_block = []
        for key in maggam_keys:
            if key == 'maggam_work' and existing_maggam is not None:
                new_block.append(existing_maggam)
            elif key not in present or key == 'maggam_work':
                new_block.append(dict(default[key]))
        # pattern_cutting (plain path) stays where it was; the block goes right
        # after Fabric, before it.
        config = config[:insert_at] + new_block + config[insert_at:]
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0046_order_flow'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
