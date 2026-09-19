"""A Maggam Karigar, and the stage they work at.

The Maggam Master draws the design; the karigar then does the frame work on
it. That order is what the new stage enforces: 'Maggam handwork' sits between
'Maggam design' and its verification on the maggam path, and the workflow's
prerequisite rule means it cannot begin until the design is settled.

Every boutique's saved workflow gains the stage, right after maggam_work (or
before maggam_verification if the boutique had reordered things). Orders
already on the maggam path keep the stages they were built with -- an order
is judged only against its own rows (domains.orders.workflow.for_order), so
nothing in flight is blocked on a stage it does not carry.

The existing 'Karigar' role is untouched: it still works alongside the
Maggam Master on the design stage. This is a second, sequential role.
"""

from django.db import migrations, models

from crm_api.models import get_default_workflow

KEY = 'maggam_handwork'


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    stage = next(s for s in get_default_workflow() if s['key'] == KEY)
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if s.get('key')]
        if any(s['key'] == KEY for s in config):
            continue
        keys = [s['key'] for s in config]
        if 'maggam_work' in keys:
            at = keys.index('maggam_work') + 1
        elif 'maggam_verification' in keys:
            at = keys.index('maggam_verification')
        else:
            # A workflow with no maggam path at all (never resynced since
            # 0047) has nowhere for this to go; the path arrives with it.
            continue
        config.insert(at, dict(stage))
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Tailor = apps.get_model('crm_api', 'Tailor')
    # Nobody may hold a role the model no longer offers; the nearest job is
    # the existing handwork role.
    Tailor.objects.filter(role='Maggam Karigar').update(role='Karigar')
    for settings in BoutiqueSettings.objects.all():
        config = [s for s in (settings.workflow_config or []) if s.get('key') != KEY]
        if len(config) != len(settings.workflow_config or []):
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0050_merge_20260918_1126'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tailor',
            name='role',
            field=models.CharField(
                choices=[('Master', 'Master (generalist)'), ('Tailor', 'Tailor'),
                         ('Maggam Master', 'Maggam Master'), ('Karigar', 'Karigar'),
                         ('Maggam Karigar', 'Maggam Karigar'),
                         ('Packaging Staff', 'Packaging Staff'), ('QC Staff', 'QC Staff')],
                default='Tailor', max_length=50),
        ),
        migrations.RunPython(forwards, backwards),
    ]
