"""The plain-stitching cutting step reads "Pattern cutting" again.

Its key has always been pattern_cutting; migration 0047 renamed what it shows
to "Cutting", which sat beside "Paper cutting" and "Fabric cutting" and read
as a fourth, different step. Every boutique's saved workflow and every order
step still showing the old default name now shows "Pattern cutting". A name a
boutique chose itself is left as it is.
"""

from django.db import migrations

OLD, NEW = 'Cutting', 'Pattern cutting'


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = settings.workflow_config or []
        changed = False
        for step in config:
            if isinstance(step, dict) and step.get('key') == 'pattern_cutting' and step.get('name') == OLD:
                step['name'] = NEW
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])

    OrderStage = apps.get_model('crm_api', 'OrderStage')
    OrderStage.objects.filter(stage_key='pattern_cutting', stage_name=OLD).update(stage_name=NEW)


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = settings.workflow_config or []
        changed = False
        for step in config:
            if isinstance(step, dict) and step.get('key') == 'pattern_cutting' and step.get('name') == NEW:
                step['name'] = OLD
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])

    OrderStage = apps.get_model('crm_api', 'OrderStage')
    OrderStage.objects.filter(stage_key='pattern_cutting', stage_name=NEW).update(stage_name=OLD)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0080_boutiquesettings_tier_names'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
