"""A Designer may take the Design step, so the owner can hand it to one of the
boutique's designers from the stage panel. Only the role list was 'Owner',
and the owner is not on the roster, so the assign list for the stage was
empty. Every boutique's saved workflow gains the role on design where the
stage exists and the role is missing; nothing else is touched."""

from django.db import migrations

ROLE = 'Designer'
KEY = 'design'


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = settings.workflow_config or []
        changed = False
        for stage in config:
            if not isinstance(stage, dict):
                continue
            roles = stage.get('roles')
            # An empty list already means anyone; adding to it would narrow it.
            if stage.get('key') == KEY and isinstance(roles, list) and roles and ROLE not in roles:
                roles.append(ROLE)
                changed = True
        if changed:
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0069_merge_0068_customer_is_lead_0068_tailor_on_finishing'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
