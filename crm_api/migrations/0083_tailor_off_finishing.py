"""A Tailor stitches -- new garments and alterations -- but no longer does
Hemming & finishing: that is the Hemming & Pressing Staff's (crm_api 0080),
with the Owner and Masters as before.

Every boutique's saved workflow loses the Tailor on 'finishing' (undoing
0068_tailor_on_finishing). A finishing step a Tailor holds that has not been
started is handed back (unassigned) so the Master can give it to whoever
finishes now; one already started, sent for checking or done stays as it is.
Stitching and Alteration work keep the Tailor.
"""

from django.db import migrations

ROLE = 'Tailor'
KEY = 'finishing'


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            roles = stage.get('roles')
            # An empty list means anyone; it is left alone rather than guessed at.
            if stage.get('key') == KEY and isinstance(roles, list) and ROLE in roles:
                stage['roles'] = [r for r in roles if r != ROLE]
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])

    OrderStage.objects.filter(
        stage_key=KEY, status='NOT_STARTED', assigned_to__role=ROLE,
    ).update(assigned_to=None)


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            roles = stage.get('roles')
            if stage.get('key') == KEY and isinstance(roles, list) and roles and ROLE not in roles:
                stage['roles'] = roles + [ROLE]
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0082_merge_20261028_1759'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
