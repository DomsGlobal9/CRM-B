"""Handover to tailor and Stitching check come off every saved workflow and order.

Both stages only restated something the record already held. Whoever
stitches is named on the order or the Stitching stage, so "hand it to them"
was a click; and a tailor's completion already goes to the owner/Master as
PENDING_VERIFICATION, so a second "check" stage after Stitching was the same
sign-off twice. Fabric consumption, staff availability and the customer's
"Quality Check" status now hang off Stitching completing.

Same treatment as 0054: config entries removed, stage and task rows deleted
(OrderActivity keeps the history), sequences renumbered, and an order whose
current_stage_key pointed at a removed stage points at Stitching -- the
stage the two of them bracketed.
"""

from django.db import migrations

KEYS = ('assigned_to_tailor', 'stitching_completed')

RESTORE = {
    'assigned_to_tailor': ('pattern_cutting', 'fabric_cutting'),   # after whichever cutting the flow has
    'stitching_completed': ('stitching_in_progress',),
}
RESTORE_STAGES = {
    'assigned_to_tailor': {"key": "assigned_to_tailor", "name": "Handover to tailor", "sla_hours": 12, "roles": ["Owner", "Master", "Tailor"]},
    'stitching_completed': {"key": "stitching_completed", "name": "Stitching check", "sla_hours": 12, "roles": ["Owner", "Master", "Tailor"]},
}


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Order = apps.get_model('crm_api', 'Order')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    ProductionTask = apps.get_model('production', 'ProductionTask')

    for settings in BoutiqueSettings.objects.all():
        config = [s for s in (settings.workflow_config or []) if s.get('key') not in KEYS]
        if len(config) != len(settings.workflow_config or []):
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])

    touched = list(OrderStage.objects.filter(stage_key__in=KEYS)
                   .values_list('order_id', flat=True).distinct())
    OrderStage.objects.filter(stage_key__in=KEYS).delete()
    ProductionTask.objects.filter(stage_key__in=KEYS).delete()
    Order.objects.filter(current_stage_key__in=KEYS).update(current_stage_key='stitching_in_progress')

    for order_id in touched:
        rows = OrderStage.objects.filter(order_id=order_id).order_by('sequence', 'id')
        for index, row in enumerate(rows):
            if row.sequence != index:
                row.sequence = index
                row.save(update_fields=['sequence'])


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or [])]
        changed = False
        for key, after in RESTORE.items():
            keys = [s.get('key') for s in config]
            if key in keys:
                continue
            anchors = [keys.index(a) for a in after if a in keys]
            if not anchors:
                continue
            config.insert(max(anchors) + 1, dict(RESTORE_STAGES[key]))
            changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0054_drop_measurement_and_fabric_stages'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
