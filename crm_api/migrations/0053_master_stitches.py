"""The Master is on both stitching stages of every saved workflow.

get_default_workflow now lists Master there; a boutique that registered
before this keeps its own saved copy, so the same two lines are applied to
it here. Idempotent: a workflow that already names Master is left alone.
"""

from django.db import migrations

STAGES = ('stitching_in_progress', 'stitching_completed')


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or [])]
        changed = False
        for stage in config:
            roles = list(stage.get('roles') or [])
            if stage.get('key') in STAGES and roles and 'Master' not in roles:
                roles.insert(1 if roles[0] == 'Owner' else 0, 'Master')
                stage['roles'] = roles
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or [])]
        for stage in config:
            if stage.get('key') in STAGES:
                stage['roles'] = [r for r in (stage.get('roles') or []) if r != 'Master']
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0052_merge_0051_maggam_karigar_0051_voice_note_sender'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
