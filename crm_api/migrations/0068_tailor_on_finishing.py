"""A Tailor may take Hemming & finishing, so a Master can hand it to them
after stitching. Every boutique's saved workflow gains the role on finishing
where it is missing; nothing else is touched."""

from django.db import migrations

ROLE = 'Tailor'
KEY = 'finishing'


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
        ('crm_api', '0067_designpreference_reference_parts'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
