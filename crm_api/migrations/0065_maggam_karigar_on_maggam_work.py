"""A Maggam Karigar may take the Maggam work step too, so a Master can hand
it to them from the work sheet. Every boutique's saved workflow gains the
role on maggam_work where it is missing; nothing else is touched."""

from django.db import migrations

ROLE = 'Maggam Karigar'
KEY = 'maggam_work'


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = settings.workflow_config or []
        changed = False
        for stage in config:
            roles = stage.get('roles')
            # An empty list already means anyone; adding to it would narrow it.
            if stage.get('key') == KEY and isinstance(roles, list) and roles and ROLE not in roles:
                roles.append(ROLE)
                changed = True
        if changed:
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0064_karigar_on_maggam_handwork'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
