"""Stage names are tasks now, not statuses.

"Stitching Completed" with a status of "not started" read as nonsense, so each
default stage is named for the work done at it and the status alone says how
far it is. Only names still equal to the old default are touched: a boutique
that renamed a stage keeps its own word. Keys never change, so nothing keyed
on them (the status map, the task mirror, the icons) moves.
"""

from django.db import migrations

RENAMES = {'created': ('Created', 'Order taken'), 'measurements_completed': ('Measurements Completed', 'Measurements'), 'fabric_confirmed': ('Fabric Confirmed', 'Fabric'), 'pattern_cutting': ('Pattern Cutting', 'Pattern cutting'), 'maggam_work': ('Maggam Work', 'Maggam work'), 'assigned_to_tailor': ('Assigned to Tailor', 'Handover to tailor'), 'stitching_in_progress': ('Stitching In Progress', 'Stitching'), 'stitching_completed': ('Stitching Completed', 'Stitching check'), 'finishing': ('Hemming & Finishing', 'Hemming & finishing'), 'pressing': ('Pressing & Packaging', 'Pressing & packaging'), 'master_quality_check': ('Master Quality Check', 'Master quality check'), 'trial_scheduled': ('Trial Scheduled', 'Trial booking'), 'trial_completed': ('Trial Completed', 'Trial'), 'ready_for_delivery': ('Ready for Delivery', 'Delivery prep'), 'delivered': ('Delivered', 'Delivery')}


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    for settings in BoutiqueSettings.objects.all():
        changed = False
        config = list(settings.workflow_config or [])
        for stage in config:
            old, new = RENAMES.get(stage.get('key'), (None, None))
            if old is not None and stage.get('name') == old:
                stage['name'] = new
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])
    for key, (old, new) in RENAMES.items():
        OrderStage.objects.filter(stage_key=key, stage_name=old).update(stage_name=new)


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    for settings in BoutiqueSettings.objects.all():
        changed = False
        config = list(settings.workflow_config or [])
        for stage in config:
            old, new = RENAMES.get(stage.get('key'), (None, None))
            if old is not None and stage.get('name') == new:
                stage['name'] = old
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])
    for key, (old, new) in RENAMES.items():
        OrderStage.objects.filter(stage_key=key, stage_name=new).update(stage_name=old)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0043_retire_fabric_catalogue'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
