"""A Karigar may take the Maggam handwork step, as they already may the
Maggam design step. Every boutique's saved workflow gains the role on both
maggam steps where it is missing; nothing else in the config is touched."""

from django.db import migrations

ROLE = 'Karigar'
KEYS = ('maggam_work', 'maggam_handwork')


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = settings.workflow_config or []
        changed = False
        for stage in config:
            roles = stage.get('roles')
            # An empty list already means anyone; adding to it would narrow it.
            if stage.get('key') in KEYS and isinstance(roles, list) and roles and ROLE not in roles:
                roles.append(ROLE)
                changed = True
        if changed:
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0063_order_internal_number_order_kind_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
