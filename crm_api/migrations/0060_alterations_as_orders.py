"""Alterations become orders on the short 'alteration' path.

Two things: every saved workflow gains the 'Alteration work' stage (before
Stitching, tagged for the alteration flow only, so no stitching or maggam
order picks it up), and every AlterationRequest already on the books
becomes an Order with flow='alteration', numbered under the order it came
from (#12-A1), its stages set to where the alteration had reached. The old
rows stay: they are the record of payments and inspection notes; the order
is what every screen reads from now on.
"""
import datetime
import secrets

from django.db import migrations

STAGE = {"key": "alteration_work", "name": "Alteration work", "sla_hours": 48,
         "roles": ["Owner", "Master", "Tailor"], "flows": ["alteration"]}
ALTERATION_STAGES = ('created', 'alteration_work', 'master_quality_check',
                     'ready_for_delivery', 'payment', 'delivered')

#: How far along each old status is, as the index of the last stage done.
#: -1: nothing after 'created'; 5: everything.
REACHED = {
    'RECEIVED': 0, 'INSPECTION': 0, 'PENDING_APPROVAL': 0, 'APPROVED': 0, 'ASSIGNED': 0,
    'IN_PROGRESS': 0, 'QC': 1, 'CUSTOMER_REVIEW': 2, 'PRESSING': 2, 'PACKAGING': 2,
    'READY_FOR_PICKUP': 3, 'COMPLETED': 5, 'CANCELLED': 0,
}


def add_stage(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or [])]
        keys = [s.get('key') for s in config]
        if 'alteration_work' in keys:
            continue
        at = keys.index('stitching_in_progress') if 'stitching_in_progress' in keys else len(config)
        config.insert(at, dict(STAGE))
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])


def carry_over(apps, schema_editor):
    try:
        AlterationRequest = apps.get_model('alterations', 'AlterationRequest')
    except LookupError:
        return
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Order = apps.get_model('crm_api', 'Order')
    OrderStage = apps.get_model('crm_api', 'OrderStage')

    settings = BoutiqueSettings.objects.filter(id=1).first()
    config = [s for s in (settings.workflow_config if settings else []) if s.get('key') in ALTERATION_STAGES]
    if not config:
        return
    number = Order.objects.order_by('-order_number').values_list('order_number', flat=True).first() or 0
    today = datetime.date.today().strftime('%y%m%d')

    for alt in AlterationRequest.objects.order_by('received_at'):
        if alt.customer_id is None:
            continue
        parent = alt.original_order if alt.original_order_id else None
        if parent is not None and Order.objects.filter(alteration_of=parent, special_instructions=alt.issue_description or '',
                                                       order_date=alt.received_at.date()).exists():
            continue
        number += 1
        reached = REACHED.get(alt.status, 0)
        done = alt.status == 'COMPLETED'
        cancelled = alt.status == 'CANCELLED'
        charge = float(alt.charge_amount or 0)
        paid = min(float(alt.amount_paid or 0), charge)
        task = alt.tasks.order_by('sequence').first() if hasattr(alt, 'tasks') else None
        order = Order.objects.create(
            order_id=f"T2B-{today}-{secrets.token_hex(4)}",
            order_number=number,
            customer_id=alt.customer_id,
            tailor_id=(task.assigned_to_id if task else None) or (parent.tailor_id if parent else None),
            master_id=parent.master_id if parent else None,
            payment_status='Paid' if charge and paid >= charge else ('Partially Paid' if paid else 'Pending'),
            order_status='Delivered' if done else ('Cancelled' if cancelled else ('Received' if reached < 0 else 'Design & Creation')),
            tailoring_charges=charge, total_amount=charge, advance_paid=paid, amount_paid=paid,
            order_date=alt.received_at.date(),
            estimated_delivery=(alt.completed_at or alt.received_at).date(),
            special_instructions=alt.issue_description or '',
            current_stage_key=ALTERATION_STAGES[min(reached + 1, 5)] if not done else 'delivered',
            production_status='COMPLETED' if done else 'IN_PROGRESS',
            flow='alteration',
            alteration_of=parent,
            alteration_seq=(Order.objects.filter(alteration_of=parent).count() + 1) if parent else None,
            alteration_garment_id=alt.garment_job_id,
            alteration_garment_name=(alt.garment_job.template.name if alt.garment_job_id and alt.garment_job.template_id
                                     else (alt.garment_note or 'Garment'))[:100],
        )
        when = alt.completed_at or alt.received_at
        for index, s_conf in enumerate(config):
            i = ALTERATION_STAGES.index(s_conf['key'])
            settled = done or i == 0 or i <= reached
            skipped = s_conf['key'] == 'payment' and charge <= 0 and not done
            OrderStage.objects.create(
                order=order, stage_key=s_conf['key'], stage_name=s_conf['name'],
                status='SKIPPED' if skipped else ('COMPLETED' if settled else ('IN_PROGRESS' if i == reached + 1 and not cancelled else 'NOT_STARTED')),
                started_at=when if settled else None, completed_at=when if settled else None,
                sequence=index, sla_hours=s_conf.get('sla_hours', 24))


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('crm_api', '0059_alteration_orders'),
        ('alterations', '0005_outside_garment'),
    ]

    operations = [
        migrations.RunPython(add_stage, noop),
        migrations.RunPython(carry_over, noop),
    ]
