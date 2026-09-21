"""A Payment stage goes in between Delivery prep and Delivery.

The money is settled before the garment leaves. Every saved workflow gains the
stage after Delivery prep, and every existing order gets its row there: an
order already delivered gets it COMPLETED (its journey is history, and a
fresh unfinished step on a finished order would reopen it on every screen),
anything else NOT_STARTED. Rows after it move down one sequence. No
ProductionTask: collecting a payment is not workroom work.
"""

from django.db import migrations

STAGE = {"key": "payment", "name": "Payment", "sla_hours": 24, "roles": ["Owner", "Master"]}


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Order = apps.get_model('crm_api', 'Order')
    OrderStage = apps.get_model('crm_api', 'OrderStage')

    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or [])]
        keys = [s.get('key') for s in config]
        if 'payment' in keys:
            continue
        at = keys.index('ready_for_delivery') + 1 if 'ready_for_delivery' in keys else len(config)
        config.insert(at, dict(STAGE))
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])

    for order in Order.objects.exclude(stages__stage_key='payment').distinct():
        prep = OrderStage.objects.filter(order=order, stage_key='ready_for_delivery').first()
        if prep is None:
            continue
        for row in OrderStage.objects.filter(order=order, sequence__gt=prep.sequence):
            row.sequence += 1
            row.save(update_fields=['sequence'])
        done = OrderStage.objects.filter(
            order=order, stage_key='delivered', status__in=('COMPLETED', 'SKIPPED')).exists()
        OrderStage.objects.create(
            order=order, stage_key='payment', stage_name=STAGE['name'],
            status='COMPLETED' if done else 'NOT_STARTED',
            started_at=prep.completed_at if done else None,
            completed_at=prep.completed_at if done else None,
            sequence=prep.sequence + 1, sla_hours=STAGE['sla_hours'])


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    Order = apps.get_model('crm_api', 'Order')
    for settings in BoutiqueSettings.objects.all():
        config = [s for s in (settings.workflow_config or []) if s.get('key') != 'payment']
        if len(config) != len(settings.workflow_config or []):
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])
    touched = list(OrderStage.objects.filter(stage_key='payment')
                   .values_list('order_id', flat=True).distinct())
    OrderStage.objects.filter(stage_key='payment').delete()
    Order.objects.filter(current_stage_key='payment').update(current_stage_key='ready_for_delivery')
    for order_id in touched:
        for index, row in enumerate(OrderStage.objects.filter(order_id=order_id).order_by('sequence', 'id')):
            if row.sequence != index:
                row.sequence = index
                row.save(update_fields=['sequence'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0055_drop_handover_and_stitching_check_stages'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
