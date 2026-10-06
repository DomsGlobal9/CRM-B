"""Who is who on a to-do, and who may do what with it."""

from django.contrib.auth.models import User
from django.db import connection
from django.db.models import Q

from apps.design_studio.models import Designer
from core.roles import (
    ASSIGNMENT_RANK, DESIGNER, MASTER, OWNER, WORKER_RANK, assigns_work, can_assign,
    resolve_user_role,
)
from crm_api.models import Notification, Tailor

#: Roles that may give a to-do to somebody else -- core.roles decides.
ASSIGNER_ROLES = tuple(r for r, rank in ASSIGNMENT_RANK.items() if rank < WORKER_RANK)


def display_name(user):
    tailor = getattr(user, 'tailor_profile', None)
    if tailor is not None and tailor.name:
        return tailor.name
    designer = getattr(user, 'designer_profile', None)
    if designer is not None and designer.name:
        return designer.name
    return user.get_full_name() or user.username or user.email or 'Someone'


def person(user, role=None):
    return {
        'id': user.id,
        'name': display_name(user),
        'role': role if role is not None else (resolve_user_role(user) or ''),
    }


def _owner_users():
    owner_email = (getattr(connection.tenant, 'owner_email', '') or '').lower()
    if not owner_email:
        return []
    return list(User.objects.filter(email__iexact=owner_email, is_active=True))


def assignable_people(user, role):
    """The people this login may give a to-do to, themselves first.

    Everyone core.roles.can_assign lets this role reach: Owner, everyone with a
    login; Designer, the floor and the other designers; Master, the floor;
    anyone else, only themselves.
    """
    people = {user.id: person(user, role)}
    if not assigns_work(role):
        return list(people.values())

    owners = _owner_users()
    owner_ids = {u.id for u in owners}
    if can_assign(role, OWNER):
        for owner in owners:
            people.setdefault(owner.id, person(owner, OWNER))

    floor = (Tailor.objects.filter(user__isnull=False, user__is_active=True)
             .select_related('user').order_by('name'))
    for tailor in floor:
        if tailor.user_id in owner_ids or not can_assign(role, tailor.role):
            continue
        people.setdefault(tailor.user_id, {
            'id': tailor.user_id, 'name': tailor.name, 'role': tailor.role})

    if can_assign(role, DESIGNER):
        designers = (Designer.objects.filter(user__isnull=False, user__is_active=True)
                     .select_related('user').order_by('name'))
        for designer in designers:
            if designer.user_id in owner_ids:
                continue
            people.setdefault(designer.user_id, {
                'id': designer.user_id, 'name': designer.name, 'role': DESIGNER})
    return list(people.values())


def visible_todos(queryset, user, role):
    """Owner and Master see every to-do; a Designer also sees those of the
    people they can assign to; everyone else only their own."""
    if role in (OWNER, MASTER):
        return queryset
    mine = Q(assigned_to=user) | Q(created_by=user)
    if role == DESIGNER:
        team = [p['id'] for p in assignable_people(user, role)]
        return queryset.filter(mine | Q(assigned_to__in=team))
    return queryset.filter(mine)


def _current_stages(stages):
    """Only the stages an order is at now: one already begun, or one whose
    earlier work is all done -- the rule the Work queue uses
    (core.permissions.queue_order_ids). Later steps of the flow stay hidden
    until the order reaches them."""
    from crm_api.models import BoutiqueSettings, OrderStage
    from domains.orders.workflow import (
        SETTLED_STATUSES, for_order, is_per_garment, prerequisites)

    config = BoutiqueSettings.objects.values_list(
        'workflow_config', flat=True).filter(id=1).first() or []
    # Each order's own step order, as the transition gate reads it: an older
    # order keeps the sequence it was placed with even if the settings moved.
    # ponytail: one query per order with a not-started step; fine for a day's list.
    flows = {}

    def flow_of(order):
        if order.pk not in flows:
            flows[order.pk] = for_order(config, order)
        return flows[order.pk]
    unsettled = {}
    for order_id, key, garment_id in (
            OrderStage.objects.filter(order_id__in={s.order_id for s in stages})
            .exclude(status__in=SETTLED_STATUSES)
            .values_list('order_id', 'stage_key', 'garment_job_id')):
        unsettled.setdefault(order_id, []).append((key, garment_id))

    def is_current(stage):
        if stage.status != 'NOT_STARTED':
            return True
        mine = flow_of(stage.order)
        earlier = {s['key'] for s in prerequisites(mine, stage.stage_key)}
        # A garment's row waits on its own garment's earlier work and on the
        # order-level stages; an order-level row waits on everything.
        per_garment = is_per_garment(mine, stage.stage_key)
        return not any(
            key in earlier and (not per_garment or garment_id in (None, stage.garment_job_id))
            for key, garment_id in unsettled.get(stage.order_id, ()))

    return [s for s in stages if is_current(s)]


def order_work(user, role):
    """Order work given to people -- a stage of an order (Cutting, Stitching,
    Maggam work...) or a design to draw -- that is not finished yet. Read-only
    here; it is done from the Work and Design screens. Who sees whose follows
    visible_todos."""
    from apps.design_studio.models import DesignAssignment
    from crm_api.models import OrderStage

    stages = (OrderStage.objects
              .filter(assigned_to__user__isnull=False)
              .exclude(status__in=('COMPLETED', 'SKIPPED'))
              .select_related('order', 'order__customer', 'assigned_to',
                              'garment_job__template'))
    designs = (DesignAssignment.objects
               .filter(designer__user__isnull=False,
                       status__in=DesignAssignment.OPEN_STATUSES)
               .select_related('designer', 'garment_job__order',
                               'garment_job__order__customer', 'garment_job__template'))
    if role not in (OWNER, MASTER):
        team = [user.id]
        if role == DESIGNER:
            team = [p['id'] for p in assignable_people(user, role)]
        stages = stages.filter(assigned_to__user_id__in=team)
        designs = designs.filter(designer__user_id__in=team)

    stages = _current_stages(list(stages))

    def customer(order):
        c = order.customer
        return f"{c.first_name} {c.last_name}".strip() if c else ''

    rows = [{
        'id': f'stage-{s.id}',
        'kind': 'STAGE',
        'stage_id': s.id,
        'task': s.stage_name,
        'status': s.status,
        'order_id': s.order_id,
        'order_ref': s.order.reference,
        'customer': customer(s.order),
        'garment': s.garment_job.template.name if s.garment_job_id else '',
        'due_date': s.order.estimated_delivery,
        'assigned_to': s.assigned_to.user_id,
        'assigned_to_name': s.assigned_to.name,
        'assigned_to_role': s.assigned_to.role,
    } for s in stages]
    rows += [{
        'id': f'design-{d.id}',
        'kind': 'DESIGN',
        'task': 'Design',
        'status': d.status,
        'order_id': d.garment_job.order_id,
        'order_ref': d.garment_job.order.reference,
        'customer': customer(d.garment_job.order),
        'garment': d.garment_job.template.name,
        'due_date': d.due_date,
        'assigned_to': d.designer.user_id,
        'assigned_to_name': d.designer.name,
        'assigned_to_role': DESIGNER,
    } for d in designs]
    return rows


def can_edit(todo, user, role):
    return role in (OWNER, MASTER) or todo.created_by_id == user.id


def can_change_status(todo, user, role):
    return can_edit(todo, user, role) or todo.assigned_to_id == user.id


def can_delete(todo, user, role):
    return role == OWNER or todo.created_by_id == user.id


def notify(user, title, message):
    """Put a line on this person's bell. Designers have no bell, so skipped."""
    if user is None:
        return
    role = resolve_user_role(user)
    if role == OWNER:
        Notification.objects.create(title=title, message=message, recipient_role='Owner')
        return
    profile = getattr(user, 'tailor_profile', None)
    if profile is None:
        return
    email = profile.email or user.email
    if email:
        Notification.objects.create(
            title=title, message=message,
            recipient_role=profile.role, recipient_email=email)
