"""Measurements and Fabric come off every saved workflow, and off every order.

get_default_workflow dropped both stages (the wizard measures the customer
and picks the fabric while the order is written up, so the two stages only
restated a decision already made). A boutique that registered before that
keeps its own saved copy of the workflow, and every order it has taken
carries an OrderStage and a ProductionTask row for each -- so the journey
still showed them, and an order whose Measurements row was never clicked
stayed "in progress" for ever, Delivered or not (production_status only
settles when every stage row does).

So, per tenant:
  * the two entries leave workflow_config;
  * their OrderStage and ProductionTask rows are deleted -- completed ones
    too. The record of who clicked them and when lives on in OrderActivity,
    which is the audit trail; a stage row is the live journey, and these
    stages are no longer on it;
  * the surviving stages are renumbered so `sequence` has no holes;
  * an order whose current_stage_key pointed at a removed stage points at
    'created' again -- the stage before them, which every order has.

Backwards restores the config entries only; the deleted rows are gone.
"""

from django.db import migrations

KEYS = ('measurements_completed', 'fabric_confirmed')

RESTORE = [
    {"key": "measurements_completed", "name": "Measurements", "sla_hours": 24, "roles": ["Owner", "Master"]},
    {"key": "fabric_confirmed", "name": "Fabric", "sla_hours": 24, "roles": ["Owner", "Master"]},
]


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
    Order.objects.filter(current_stage_key__in=KEYS).update(current_stage_key='created')

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
        keys = [s.get('key') for s in config]
        if all(k in keys for k in KEYS):
            continue
        at = keys.index('created') + 1 if 'created' in keys else 0
        for stage in reversed(RESTORE):
            if stage['key'] not in keys:
                config.insert(at, dict(stage))
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0053_master_stitches'),
        ('production', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
