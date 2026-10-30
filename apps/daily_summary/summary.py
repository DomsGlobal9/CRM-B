"""What each person's 11 PM summary says.

Every figure is read from the record the rest of the product already keeps,
through the function that already computes it where one exists:

  money       finance.services.revenue_for / outstanding_now (dated Payment rows,
              NOT Order.amount_paid -- the dashboard's snapshot figure)
  orders      Order, and the 'delivered' step's completed_at (Order has no date
              of its own for delivery)
  floor work  OrderStage, narrowed to the work an order has reached by the work
              queue's own rule (apps.todos.services._current_stages)
  designs     DesignAssignment status and its submitted_at / reviewed_at
  to-dos      Todo

Nothing is counted twice: ProductionTask only mirrors the stages, and a to-do
made from an order step is left out because the step itself is counted.
Completed work is credited to whoever performed it (OrderStage.performed_by),
falling back to the assignee only when nobody was recorded.

Builders run inside the boutique's schema with its timezone active, and take
the boutique's own date and the reader's language (text.py). Each returns the
message text, or None when there is nothing to tell this person.
"""
from datetime import datetime, time, timedelta

from django.db.models import Count, Sum

from apps.todos.services import _current_stages
from core.admin_access import tasks_for
from core.formatting import format_money
from core.modules import is_enabled
from core.permissions import UNSETTLED_STATUSES

from . import text as tx

WORKING = ('IN_PROGRESS', 'PAUSED')
#: Pending lines listed by name in a personal summary; the rest are counted.
LISTED = 5


def day_bounds(day, tz):
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def _worker_id(stage):
    return stage.performed_by_id or stage.assigned_to_id


class Floor:
    """The boutique's order-step work, read once and shared by every summary."""

    def __init__(self, day, tz, now):
        from crm_api.models import OrderStage

        self.start, self.end = day_bounds(day, tz)
        self.now = now
        self.open = _current_stages(list(
            OrderStage.objects.filter(status__in=UNSETTLED_STATUSES)
            .select_related('order', 'garment_job__template', 'performed_by')))
        self.completed = list(OrderStage.objects.filter(
            status='COMPLETED', completed_at__gte=self.start, completed_at__lt=self.end))

    def overdue(self, stage):
        """Past the boutique's own SLA for the step -- the rule
        apps.staff.performance uses. Work not yet begun has no clock running."""
        return (stage.status in WORKING and stage.started_at is not None
                and bool(stage.sla_hours)
                and self.now - stage.started_at > timedelta(hours=stage.sla_hours))

    @staticmethod
    def returned(stage):
        # verification_note is written when a check sends the work back and
        # cleared when it is submitted again.
        return stage.status == 'IN_PROGRESS' and bool(stage.verification_note)


def _line(stage, lang):
    garment = stage.garment_job.template.name if stage.garment_job_id else ''
    return (f"• {tx.step(lang, stage.stage_name)} · {stage.order.reference}"
            + (f" ({garment})" if garment else ''))


def _section(title, rows, lang):
    """A heading and its 'label: value' rows; rows with a None value are dropped."""
    body = [f"{tx.t(lang, label)}: {value}" for label, value in rows if value is not None]
    return [tx.t(lang, title), *body] if body else []


def _compose(boutique, day, tenant, sections, lang):
    lines = [tx.t(lang, 'Daily summary · {date}', date=tx.date(lang, day, tenant)), boutique]
    for section in sections:
        if section:
            lines += ['', *section]
    return '\n'.join(lines + ['', '(Scaleezy)'])


def personal_work(floor, user, tailor, lang):
    """Rows for one person's own work: theirs to do, theirs waiting, theirs done."""
    from apps.todos.models import Todo

    mine = [s for s in floor.open if s.assigned_to_id == tailor.id] if tailor else []
    pending = [s for s in mine if s.status != 'PENDING_VERIFICATION']
    waiting = [s for s in floor.open
               if s.status == 'PENDING_VERIFICATION' and tailor and _worker_id(s) == tailor.id]
    done = [s for s in floor.completed if tailor and _worker_id(s) == tailor.id]
    todos = Todo.objects.filter(assigned_to=user, order_stage__isnull=True)
    open_todos = todos.exclude(status=Todo.STATUS_CLOSED).count()
    closed_todos = todos.filter(status=Todo.STATUS_CLOSED, closed_at__gte=floor.start,
                                closed_at__lt=floor.end).count()

    rows = [
        ('Completed today (checked)', len(done)),
        ('Waiting for a check', len(waiting)),
        ('Sent back to redo', sum(1 for s in mine if floor.returned(s))),
        ('Overdue', sum(1 for s in mine if floor.overdue(s))),
        ('Pending', len(pending)),
        ('Open to-dos', open_todos),
        ('To-dos closed today', closed_todos),
    ]
    listed = [_line(s, lang) for s in pending[:LISTED]]
    if len(pending) > LISTED:
        listed.append(tx.t(lang, '• +{count} more', count=len(pending) - LISTED))
    return rows, listed


def _has_any(rows):
    return any(value for _, value in rows)


def lead_rows(floor):
    from crm_api.models import Customer
    return [
        ('New leads today', Customer.objects.filter(
            is_lead=True, created_at__gte=floor.start, created_at__lt=floor.end).count()),
        # The leads screen's own rule (App.jsx isLead): flagged and no order yet.
        # No follow-up date exists, so nothing here is called overdue.
        ('Leads awaiting contact', Customer.objects.filter(
            is_lead=True, orders__isnull=True).distinct().count()),
    ]


def owner_summary(tenant, boutique, day, floor, lang=tx.DEFAULT):
    from apps.design_studio.models import DesignAssignment
    from apps.finance.services import outstanding_now, revenue_for
    from crm_api.models import Customer, Order, OrderStage

    plan, overrides = tenant.plan, tenant.enabled_modules
    sales = Order.objects.exclude(kind=Order.KIND_INTERNAL)
    booked = (sales.exclude(order_status='Cancelled')
              .filter(order_date__gte=floor.start, order_date__lt=floor.end)
              .aggregate(value=Sum('total_amount'), count=Count('id')))
    delivered = (OrderStage.objects
                 .filter(stage_key='delivered', status='COMPLETED',
                         completed_at__gte=floor.start, completed_at__lt=floor.end)
                 .exclude(order__kind=Order.KIND_INTERNAL)
                 .values('order').distinct().count())
    overdue = (sales.exclude(order_status__in=('Delivered', 'Cancelled'))
               .filter(estimated_delivery__lt=day).count())

    sections = [
        _section('Money', [
            ('Collected today', format_money(revenue_for(day, day)['total'])),
            ('New orders booked today',
             tx.t(lang, '{amount} ({count} orders)', amount=format_money(booked['value']),
                  count=booked['count'])),
            ('Outstanding from customers', format_money(outstanding_now())),
        ], lang),
        _section('Orders', [('Delivered today', delivered), ('Overdue', overdue)], lang),
        _section('Waiting for you', [
            ('Work to check', sum(1 for s in floor.open if s.status == 'PENDING_VERIFICATION')),
            ('Designs to review', DesignAssignment.objects.filter(
                status=DesignAssignment.Status.SUBMITTED).count()),
        ], lang),
        _section('Customers', [
            ('New customers today', Customer.objects.filter(
                is_lead=False, created_at__gte=floor.start, created_at__lt=floor.end).count()),
            *lead_rows(floor),
        ], lang),
    ]
    if is_enabled(plan, overrides, 'staff_attendance'):
        from apps.staff.models import AttendanceSession, DayMark
        # Present and on leave only: who was EXPECTED is not recorded, so
        # nobody is reported absent.
        sections.append(_section('Team', [
            ('Present today', AttendanceSession.objects.filter(date=day)
             .values('staff').distinct().count()),
            ('On leave', DayMark.objects.filter(date=day, kind=DayMark.Kind.LEAVE).count()),
        ], lang))
    if is_enabled(plan, overrides, 'scheduling'):
        from apps.scheduling.models import Appointment
        sections.append(_section('Tomorrow', [('Appointments', Appointment.objects.filter(
            scheduled_time__gte=floor.end, scheduled_time__lt=floor.end + timedelta(days=1),
        ).exclude(status='CANCELLED').count())], lang))
    if is_enabled(plan, overrides, 'inventory'):
        from apps.inventory import reports
        sections.append(_section('Stock', [('Items low on stock',
                                            len(reports.low_stock(limit=100)))], lang))
    return _compose(boutique, day, tenant, sections, lang)


def designer_summary(tenant, boutique, day, floor, designer, lang=tx.DEFAULT):
    """Their own design work only. Unassigned design work is left out: designs
    are handed out at order entry or by the owner, and a designer may only pass
    on work that is already theirs (DesignAssignmentViewSet.create)."""
    from apps.design_studio.models import DesignAssignment

    Status = DesignAssignment.Status
    mine = DesignAssignment.objects.filter(designer=designer)
    reviewed = mine.filter(reviewed_at__gte=floor.start, reviewed_at__lt=floor.end)
    rows_today = [
        ('Submitted today', mine.filter(submitted_at__gte=floor.start,
                                        submitted_at__lt=floor.end).count()),
        # Only the latest review is kept on the row, so a design sent back and
        # approved on the same day counts once, as approved.
        ('Approved today', reviewed.filter(status=Status.APPROVED).count()),
        ('Sent back today', reviewed.filter(status=Status.CHANGES_REQUESTED).count()),
    ]
    rows_queue = [
        ('Waiting for review', mine.filter(status=Status.SUBMITTED).count()),
        ('To rework', mine.filter(status=Status.CHANGES_REQUESTED).count()),
        ('Assigned, not yet submitted', mine.filter(status=Status.ASSIGNED).count()),
        ('Overdue', mine.filter(status__in=(Status.ASSIGNED, Status.CHANGES_REQUESTED),
                                due_date__lt=day).count()),
    ]
    if not _has_any(rows_today + rows_queue):
        return None
    return _compose(boutique, day, tenant, [
        _section('Today', rows_today, lang), _section('Your designs', rows_queue, lang)], lang)


def master_summary(tenant, boutique, day, floor, user, tailor, lang=tx.DEFAULT):
    unassigned = {}
    for s in floor.open:
        if s.assigned_to_id is None and s.status != 'PENDING_VERIFICATION':
            unassigned[s.stage_name] = unassigned.get(s.stage_name, 0) + 1
    from domains.orders.workflow import may_sign_off
    rows_floor = [
        # A Master's own submissions wait for the Owner or Designer, not them.
        ('Waiting for your check', sum(1 for s in floor.open if s.status == 'PENDING_VERIFICATION'
                                       and may_sign_off('Master', s))),
        ('Ready to assign', sum(unassigned.values())),
        ('Completed today', len(floor.completed)),
        ('Sent back to redo', sum(1 for s in floor.open if floor.returned(s))),
        ('Overdue', sum(1 for s in floor.open if floor.overdue(s))),
    ]
    rows_mine, listed = personal_work(floor, user, tailor, lang)
    if not _has_any(rows_floor + rows_mine):
        return None
    to_assign = [f"• {tx.step(lang, name)}: {count}" for name, count in sorted(unassigned.items())]
    return _compose(boutique, day, tenant, [
        _section('Production floor', rows_floor, lang) + to_assign,
        _section('Your own work', rows_mine, lang) + listed,
    ], lang)


def staff_summary(tenant, boutique, day, floor, user, tailor, lang=tx.DEFAULT):
    rows, listed = personal_work(floor, user, tailor, lang)
    if not _has_any(rows):
        return None
    return _compose(boutique, day, tenant, [_section('Your work', rows, lang) + listed], lang)


def with_leads(text, tenant, boutique, day, floor, user, lang=tx.DEFAULT):
    """The Admin the owner handed lead work to also hears about leads."""
    if 'customers.leads' not in tasks_for(user):
        return text
    rows = lead_rows(floor)
    if text is None:
        return (_compose(boutique, day, tenant, [_section('Leads', rows, lang)], lang)
                if _has_any(rows) else None)
    head = text.rpartition('\n\n(Scaleezy)')[0]
    return '\n'.join([head, '', *_section('Leads', rows, lang), '', '(Scaleezy)'])
