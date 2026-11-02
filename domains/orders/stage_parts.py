"""A step split between several people (crm_api.models.StagePart).

A rush blouse's Stitching goes to three tailors at once: Front, Back, Sleeve.
Each part is one person's, started and sent for checking on its own. The step
itself stays the row everything else reads -- prerequisites, the order's
status, the tracking page -- and is moved from here:

  * the first part started starts the step (through the ordinary
    transition, so the timer, the attendance check-in and the materials
    behave as they always have);
  * when every part has been sent, the step goes for checking;
  * the step approved (or skipped) completes every part; the step sent back
    sends back every part that was waiting; one part can also be sent back on
    its own, and the step goes back with it.

Only working steps split -- a step some role other than the Owner, a Master or
a Designer may hold -- and parts go only to that staff, never to a Master or a
Designer. One person may hold several parts. A step with no parts is
untouched by any of this.
"""
from django.db import transaction
from django.utils import timezone

from core.roles import DESIGNER, MASTER, OWNER, can_assign, resolve_user_role

MAX_PARTS = 10
LABEL_MAX = 60
#: Who decides on a split, and never holds a part.
NOT_A_PART_HOLDER = (OWNER, MASTER, DESIGNER)
SPLITTABLE = ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED')
SENT = ('PENDING_VERIFICATION', 'COMPLETED')


def _supervisor(role):
    from core.permissions import SUPERVISOR_ROLES
    return role == OWNER or role in SUPERVISOR_ROLES


def stage_roles(order, stage):
    """The roles the boutique's workflow lets hold this step."""
    from crm_api.models import BoutiqueSettings
    from domains.orders import workflow
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    declared = next((s for s in workflow.ordered_stages(workflow.for_order(config.workflow_config, order))
                     if s['key'] == stage.stage_key), None)
    return list((declared or {}).get('roles') or [])


def part_roles(order, stage):
    """The staff roles a part of this step may go to: the step's own roles less
    the Owner, Masters and Designers, narrowed where the step is handed only to
    one kind of worker (Hemming & finishing)."""
    from domains.orders.workflow import ASSIGN_ONLY_TO
    roles = [r for r in stage_roles(order, stage) if r not in NOT_A_PART_HOLDER]
    only = ASSIGN_ONLY_TO.get(stage.stage_key)
    return [r for r in roles if r in only] if only else roles


def _tailor_for(order, stage, tailor_id, assigner):
    from crm_api.models import Tailor
    try:
        tailor = Tailor.objects.filter(id=int(tailor_id)).first()
    except (TypeError, ValueError):
        tailor = None
    if tailor is None:
        raise ValueError('Choose who does each part.')
    allowed = part_roles(order, stage)
    if tailor.role not in allowed:
        raise ValueError(f'{tailor.name} is a {tailor.role} and cannot take a part of '
                         f'{stage.stage_name}. It goes to: {", ".join(allowed) or "nobody"}.')
    if not can_assign(assigner, tailor.role):
        raise PermissionError(f'A {assigner} cannot assign work to a {tailor.role}.')
    return tailor


def _notify(order, stage, part, tailor):
    from crm_api.models import Notification
    Notification.objects.create(
        recipient_role=tailor.role,
        recipient_email=tailor.email or (tailor.user.email if tailor.user_id else ''),
        title=f"New assignment on {order.reference}",
        message=f"You have been assigned {stage.stage_name} · {part.label} on order {order.reference}.",
    )


def _log(order, user, event, metadata):
    from crm_api.models import OrderActivity
    OrderActivity.objects.create(
        order=order, event_type=event,
        user=user if (user and user.is_authenticated) else None, metadata=metadata)


def split(order, stage, parts, *, user, assigner):
    """Split `stage` into `parts` ([{label, tailor_id}]), replacing a split no
    part of which has started."""
    from crm_api.models import StagePart

    if not part_roles(order, stage):
        raise ValueError(f'{stage.stage_name} is not a step staff work on, so it cannot be split.')
    if stage.status not in SPLITTABLE:
        raise ValueError(f'{stage.stage_name} is {stage.status.replace("_", " ").lower()}; '
                         'only a step not yet sent for checking can be split.')
    existing = list(stage.parts.all())
    if any(p.status != 'NOT_STARTED' for p in existing):
        raise ValueError('A part has already started. Change who does a part instead.')
    if not isinstance(parts, list) or len(parts) < 2:
        raise ValueError('Split into at least two parts.')
    if len(parts) > MAX_PARTS:
        raise ValueError(f'Split into at most {MAX_PARTS} parts.')

    rows, seen = [], set()
    for entry in parts:
        label = str((entry or {}).get('label') or '').strip()
        if not label:
            raise ValueError('Name every part (Front, Back, Sleeve...).')
        if len(label) > LABEL_MAX:
            raise ValueError(f'A part name is limited to {LABEL_MAX} characters.')
        if label.lower() in seen:
            raise ValueError(f'"{label}" is in the list twice.')
        seen.add(label.lower())
        rows.append((label, _tailor_for(order, stage, (entry or {}).get('tailor_id'), assigner)))

    with transaction.atomic():
        stage.parts.all().delete()
        made = [StagePart.objects.create(stage=stage, label=label, assigned_to=tailor, sequence=i)
                for i, (label, tailor) in enumerate(rows)]
        for part in made:
            _notify(order, stage, part, part.assigned_to)
        _log(order, user, 'STAGE_SPLIT', {
            'stage_key': stage.stage_key, 'stage_name': stage.stage_name,
            'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None,
            'parts': [{'label': p.label, 'assigned_to': p.assigned_to.name,
                       'assigned_to_id': p.assigned_to_id} for p in made],
        })
    return made


def unsplit(order, stage, *, user):
    """Back to one step, while no part has started."""
    parts = list(stage.parts.all())
    if not parts:
        return
    if any(p.status != 'NOT_STARTED' for p in parts):
        raise ValueError('A part has already started, so the split stays.')
    with transaction.atomic():
        stage.parts.all().delete()
        _log(order, user, 'STAGE_UNSPLIT', {
            'stage_key': stage.stage_key, 'stage_name': stage.stage_name,
            'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None})


def assign_part(order, part, tailor_id, *, user, assigner):
    """Hand one part to somebody else, while it is not yet sent."""
    stage = part.stage
    if part.status in SENT:
        raise ValueError(f'{part.label} has already been sent for checking.')
    tailor = _tailor_for(order, stage, tailor_id, assigner)
    if tailor.id == part.assigned_to_id:
        return part
    part.assigned_to = tailor
    part.save(update_fields=['assigned_to'])
    _notify(order, stage, part, tailor)
    _log(order, user, 'ASSIGNMENT', {
        'stage_key': stage.stage_key, 'stage_name': stage.stage_name, 'part': part.label,
        'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None,
        'assigned_to': tailor.name, 'assigned_to_id': tailor.id})
    return part


def _attach(order, stage, part, files, request):
    """The part's photos, kept on the part and on the step (where checking reads them)."""
    from domains.orders.services import OrderService
    if not files:
        return
    before = list(stage.attachments or [])
    OrderService._attach_stage_photos(order, stage, files, request)
    added = [u for u in (stage.attachments or []) if u not in before]
    stage.save(update_fields=['attachments'])
    part.attachments = [*(part.attachments or []), *added]


def _close(part, now):
    part.status = 'COMPLETED'
    if not part.started_at:
        part.started_at = now
    part.completed_at = now
    part.duration_seconds = int((now - part.started_at).total_seconds())


def _step_to_check(order, stage, user):
    """Every part sent: the step goes for checking, as one worker's would."""
    from domains.orders.notifications import notify_verification
    from domains.orders.services import _sync_task_status
    old = stage.status
    stage.status = 'PENDING_VERIFICATION'
    stage.verification_note = ''
    stage.verification_seen_by = ''
    stage.verification_seen_at = None
    stage.attachment_reviews = {}
    stage.save(update_fields=['status', 'verification_note', 'verification_seen_by',
                              'verification_seen_at', 'attachment_reviews'])
    _sync_task_status(order, stage.stage_key, stage.status, stage.garment_job_id)
    _log(order, user, 'STAGE_TRANSITION', {
        'stage_key': stage.stage_key, 'stage_name': stage.stage_name,
        'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None,
        'old_status': old, 'new_status': stage.status, 'comments': 'Every part sent for checking.'})
    notify_verification(order, stage, submitted=True)


def _step_back(order, stage, user, note):
    """A part sent back while its step waited for checking: the step goes back too."""
    from domains.orders.services import _sync_task_status
    if stage.status != 'PENDING_VERIFICATION':
        return
    stage.status = 'IN_PROGRESS'
    stage.verification_note = note
    stage.save(update_fields=['status', 'verification_note'])
    _sync_task_status(order, stage.stage_key, stage.status, stage.garment_job_id)


def transition_part(order, part, new_status, *, user, comments='', voice_note='', files=None, request=None):
    """Move one part. The part's own person starts it and sends it (photo
    attached); the Owner, a Master or a Designer may also mark it done, or send
    it back with a note."""
    from domains.orders.services import OrderService

    role = resolve_user_role(user)
    if role is None:
        raise ValueError('Sign in to update this order.')
    supervisor = _supervisor(role)
    profile = getattr(user, 'tailor_profile', None)
    mine = profile is not None and part.assigned_to_id == profile.id
    if not supervisor and not mine:
        raise PermissionError('This part is assigned to someone else.')

    stage = part.stage
    if stage.status in ('COMPLETED', 'SKIPPED'):
        raise ValueError(f'{stage.stage_name} is already finished.')
    comments = (comments or '').strip()
    now = timezone.now()

    with transaction.atomic():
        if new_status == 'IN_PROGRESS' and part.status in SENT:
            # Sending one part back: a supervisor's, with what to redo.
            if not supervisor:
                raise PermissionError('Only the owner or a Master can send a part back.')
            if not comments:
                raise ValueError('Say what needs to be redone before sending this back.')
            part.status = 'IN_PROGRESS'
            part.completed_at = None
            part.verification_note = comments
            part.save(update_fields=['status', 'completed_at', 'verification_note'])
            _step_back(order, stage, user, f'{part.label}: {comments}')
            if part.assigned_to_id:
                from crm_api.models import Notification
                tailor = part.assigned_to
                Notification.objects.create(
                    recipient_role=tailor.role,
                    recipient_email=tailor.email or (tailor.user.email if tailor.user_id else ''),
                    title=f"Sent back on {order.reference}",
                    message=f"{stage.stage_name} · {part.label}: {comments}")
            _log(order, user, 'PART_SENT_BACK', {
                'stage_key': stage.stage_key, 'part': part.label, 'comments': comments,
                'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None})
            return order

        if new_status == 'IN_PROGRESS':
            if part.status != 'NOT_STARTED':
                return order
            if stage.status in ('NOT_STARTED', 'PAUSED'):
                # The first part started starts the step, the ordinary way.
                OrderService.transition_order_stage(
                    order, stage.stage_key, 'IN_PROGRESS', user=user,
                    garment_job=stage.garment_job_id, request=request, _from_part=True)
                stage.refresh_from_db()
            elif profile is not None:
                from apps.staff import attendance
                attendance.check_in_from_work(
                    profile, user=user, started_at=now,
                    note=f'Auto check-in: started {stage.stage_key} · {part.label} on {order.order_id}')
            part.status = 'IN_PROGRESS'
            part.started_at = now
            part.verification_note = ''
            part.save(update_fields=['status', 'started_at', 'verification_note'])
            _log(order, user, 'PART_STARTED', {
                'stage_key': stage.stage_key, 'part': part.label,
                'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None})
            return order

        if new_status in SENT:
            if part.status in SENT:
                return order
            if part.status == 'NOT_STARTED' and not supervisor:
                raise ValueError('Start this part before sending it.')
            if not supervisor and not files:
                raise ValueError('Add a photo of the finished work before submitting it for verification.')
            _attach(order, stage, part, files, request)
            if comments:
                part.comments = comments
            if voice_note:
                part.voice_note = voice_note
            if supervisor and new_status == 'COMPLETED':
                _close(part, now)
            else:
                part.status = 'PENDING_VERIFICATION'
                if not part.started_at:
                    part.started_at = now
                part.duration_seconds = int((now - part.started_at).total_seconds())
            part.verification_note = ''
            part.save()
            _log(order, user, 'PART_SENT', {
                'stage_key': stage.stage_key, 'part': part.label, 'comments': comments,
                'voice_note': voice_note or '', 'status': part.status,
                'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None})

            parts = list(stage.parts.all())
            if all(p.status == 'COMPLETED' for p in parts):
                # Every part marked done by a supervisor: the step is done.
                OrderService.transition_order_stage(
                    order, stage.stage_key, 'COMPLETED', user=user,
                    garment_job=stage.garment_job_id, request=request, _from_part=True)
            elif all(p.status in SENT for p in parts) and stage.status == 'IN_PROGRESS':
                _step_to_check(order, stage, user)
            return order

    raise ValueError(f'A part cannot be moved to "{new_status}".')


def follow_step(stage, old_status, new_status, comments=''):
    """The step moved as a whole (approved, skipped, sent back): its parts follow."""
    parts = list(stage.parts.all())
    if not parts:
        return
    now = timezone.now()
    for part in parts:
        if new_status in ('COMPLETED', 'SKIPPED') and part.status != 'COMPLETED':
            _close(part, now)
            part.save()
        elif (new_status == 'IN_PROGRESS' and old_status == 'PENDING_VERIFICATION'
              and part.status == 'PENDING_VERIFICATION'):
            part.status = 'IN_PROGRESS'
            part.verification_note = comments or ''
            part.save(update_fields=['status', 'verification_note'])


def follow_reopen(stage, previous):
    """A settled step reopened: its parts are worked again (a skipped one from scratch)."""
    for part in stage.parts.all():
        part.status = 'IN_PROGRESS' if previous == 'COMPLETED' else 'NOT_STARTED'
        part.completed_at = None
        part.duration_seconds = 0
        if part.status == 'NOT_STARTED':
            part.started_at = None
        part.save(update_fields=['status', 'completed_at', 'duration_seconds', 'started_at'])


def reset(stage):
    """A later step put back to the start: its parts with it."""
    stage.parts.update(status='NOT_STARTED', started_at=None, completed_at=None,
                       duration_seconds=0, verification_note='')
