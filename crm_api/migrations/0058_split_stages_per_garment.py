"""The workroom stages go per garment.

A saree, its blouse and its petticoat are each cut and stitched, so each now
has its own Cutting, Stitching, Finishing, Pressing and QC row. Every saved
workflow gets `scope: garment` on those stages, and every order that has
garment jobs gets its single workroom rows split into one per garment,
each copy carrying what the single row said (a half-stitched order stays
half-stitched for every garment). Its ProductionTask rows split the same
way. Order-level stages (Order taken, Trial, Delivery, Payment) and orders
with no garment jobs are left as they are.
"""

from django.db import migrations

GARMENT_SCOPED = (
    'pattern_cutting', 'paper_cutting', 'maggam_work', 'maggam_handwork',
    'maggam_verification', 'fabric_cutting', 'stitching_in_progress',
    'finishing', 'pressing', 'master_quality_check',
)

COPIED = ('status', 'started_at', 'completed_at', 'duration_seconds', 'assigned_to_id',
          'performed_by_id', 'comments', 'voice_note', 'voice_note_by', 'voice_note_at',
          'verification_seen_by', 'verification_seen_at', 'attachments',
          'attachment_reviews', 'verification_note', 'sequence', 'sla_hours')


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Order = apps.get_model('crm_api', 'Order')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    ProductionTask = apps.get_model('production', 'ProductionTask')

    for settings in BoutiqueSettings.objects.all():
        config, changed = [], False
        for s in (settings.workflow_config or []):
            s = dict(s)
            if s.get('key') in GARMENT_SCOPED and s.get('scope') != 'garment':
                s['scope'] = 'garment'
                changed = True
            config.append(s)
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])

    for order in Order.objects.all():
        jobs = list(order.garment_jobs.order_by('sequence', 'created_at'))
        if not jobs:
            continue
        for row in OrderStage.objects.filter(
                order=order, stage_key__in=GARMENT_SCOPED, garment_job__isnull=True):
            task = ProductionTask.objects.filter(
                order=order, stage_key=row.stage_key, garment_job__isnull=True).first()
            for job in jobs:
                OrderStage.objects.create(
                    order=order, garment_job=job, stage_key=row.stage_key,
                    stage_name=row.stage_name, **{f: getattr(row, f) for f in COPIED})
                if task is not None:
                    name = job.template.name if job.template_id else 'Garment'
                    ProductionTask.objects.create(
                        order=order, garment_job=job, stage_key=task.stage_key,
                        title=f"{row.stage_name} · {name}", description=task.description,
                        assigned_to_id=task.assigned_to_id, status=task.status,
                        priority=task.priority, sequence=task.sequence,
                        estimated_hours=task.estimated_hours, actual_hours=task.actual_hours,
                        due_date=task.due_date, started_at=task.started_at,
                        completed_at=task.completed_at, notes=task.notes)
            if task is not None:
                task.delete()
            row.delete()


def backwards(apps, schema_editor):
    """Fold each garment's rows back to one: the least-finished row wins."""
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Order = apps.get_model('crm_api', 'Order')
    OrderStage = apps.get_model('crm_api', 'OrderStage')
    ProductionTask = apps.get_model('production', 'ProductionTask')
    rank = {'NOT_STARTED': 0, 'IN_PROGRESS': 1, 'PAUSED': 1, 'PENDING_VERIFICATION': 2,
            'SKIPPED': 3, 'COMPLETED': 4}

    for settings in BoutiqueSettings.objects.all():
        config = [{k: v for k, v in s.items() if k != 'scope'}
                  for s in (settings.workflow_config or [])]
        settings.workflow_config = config
        settings.save(update_fields=['workflow_config'])

    for order in Order.objects.all():
        rows = OrderStage.objects.filter(order=order, garment_job__isnull=False)
        for key in set(rows.values_list('stage_key', flat=True)):
            keep = min(rows.filter(stage_key=key), key=lambda r: rank.get(r.status, 0))
            rows.filter(stage_key=key).exclude(pk=keep.pk).delete()
            keep.garment_job = None
            keep.save(update_fields=['garment_job'])
            tasks = ProductionTask.objects.filter(order=order, stage_key=key, garment_job__isnull=False)
            first = tasks.first()
            if first is not None:
                tasks.exclude(pk=first.pk).delete()
                first.garment_job = None
                first.title = keep.stage_name
                first.save(update_fields=['garment_job', 'title'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0057_garment_stages'),
        ('production', '0002_garment_stages'),
        ('catalog', '0023_resync_type_of_design_label'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
