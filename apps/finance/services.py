"""Profit & loss: the one place revenue and every cost meet.

Revenue is read from finance.Payment -- dated rows of money actually received
-- NOT from Order.amount_paid. The snapshot cannot answer "what came in during
September": it carries no date, so the only window available to it was the
order's own date, which files a March payment under the January the order was
written in. See apps.finance.models.Payment.

Costs come from three sources, and only ONE of them is this app's own:

  * salaries  -- read from apps.payroll Payout rows (cash actually paid out)
  * inventory -- read from apps.inventory PurchaseOrder totals (committed POs)
  * manual    -- apps.finance Expense rows (rent, utilities, everything else)

Reading salaries and inventory from their own tables rather than copying them
into Expense is the whole point of "auto-feed": the number the owner sees here
is the same number payroll and purchasing already computed, so the three can
never drift, and nobody has to enter a cost twice.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

TWO_DP = Decimal('0.01')
ZERO = Decimal('0.00')

#: Purchase orders that represent real committed spend. A DRAFT is a basket
#: nobody has placed and a CANCELLED order never happened; counting either as
#: money spent would overstate what left the business.
_COMMITTED_PO = ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')


def _money(value):
    return (Decimal(value or 0)).quantize(TWO_DP)


#: The named periods the report offers, resolved against the boutique's own
#: today. 'custom' is the absence of a name: whatever since/until were sent.
PERIODS = ('day', 'week', 'month', 'year', 'custom')


def resolve_window(period=None, since=None, until=None):
    """The dates a report actually runs over, and the name of the period.

    One place, so the frontend cannot compute a window the backend disagrees
    with -- the selector sends a name, this decides the dates. An unknown name
    falls back to the month, which is what the report defaulted to before
    periods existed.

    A named period wins over since/until. Both ends are inclusive, and a
    window given backwards is swapped rather than refused: it is a picker
    mistake, not a reason to show nothing.
    """
    today = timezone.localdate()
    name = (period or '').strip().lower()

    if name == 'day':
        return today, today, 'day'
    if name == 'week':
        start = today - timedelta(days=today.weekday())
        return start, today, 'week'
    if name == 'year':
        return today.replace(month=1, day=1), today, 'year'
    if name == 'month':
        return today.replace(day=1), today, 'month'

    if since is None and until is None:
        return today.replace(day=1), today, 'month'

    since = since or today.replace(day=1)
    until = until or today
    if until < since:
        since, until = until, since
    return since, until, 'custom'


def _window(since, until):
    """Kept for callers that pass explicit dates and want the old default."""
    start, end, _ = resolve_window(None, since, until)
    return start, end


def _revenue_rows(since, until):
    from crm_api.models import Order
    from .models import Payment

    rows = Payment.objects.filter(received_on__gte=since, received_on__lte=until)
    rows = rows.exclude(order__order_status='Cancelled')
    # A boutique's own production run is a cost, never a sale.
    return rows.exclude(order__kind=Order.KIND_INTERNAL)


def _payout_rows(since, until):
    from apps.payroll.models import Payout
    return Payout.objects.filter(paid_at__date__gte=since, paid_at__date__lte=until)


def _committed_pos(since, until):
    from apps.inventory.models import PurchaseOrder
    return PurchaseOrder.objects.filter(
        status__in=_COMMITTED_PO,
        # PurchaseOrder.order_date is a DateField (Order.order_date is a
        # DateTimeField -- same name, different type), so no __date transform.
        order_date__gte=since, order_date__lte=until,
    ).prefetch_related('lines')


def _expense_rows(since, until):
    from .models import Expense
    return Expense.objects.filter(incurred_on__gte=since, incurred_on__lte=until)


def revenue_for(since, until):
    """Money received in the window, by the date it was received.

    Cancelled orders are excluded: money taken against an order that was then
    cancelled has been refunded or is owed back, and counting it as revenue
    overstates what the boutique earned. Everything else counts, whether the
    order is finished or not -- an advance is money in the till.
    """
    from .models import Payment

    agg = _revenue_rows(since, until).aggregate(
        total=Sum('amount'),
        dated=Sum('amount', filter=~Q(source=Payment.Source.BACKFILL)),
        estimated=Sum('amount', filter=Q(source=Payment.Source.BACKFILL)),
    )
    return {
        'total': _money(agg['total']),
        # What part of the figure is real dated money and what part was
        # inferred from an order's date by the backfill. A report that cannot
        # say which is which invites the owner to trust an approximation.
        'dated': _money(agg['dated']),
        'estimated': _money(agg['estimated']),
    }


def outstanding_now():
    """What customers still owe on orders that are not closed.

    Deliberately NOT windowed: a debt is a position at a moment, not a flow
    over a period. Delivered and Cancelled orders drop out -- the same two
    statuses the order book treats as closed.
    """
    from crm_api.models import Order
    from . import payments

    live = Order.objects.exclude(
        order_status__in=('Delivered', 'Cancelled')).exclude(kind=Order.KIND_INTERNAL)
    return _money(payments.outstanding_for(live))


def salaries_for(since, until):
    """Cash paid to staff in the window -- Payout rows, not accrued payroll.

    'Spent' means money that left, so this counts what was actually paid out,
    which is also what the owner watched happen on the payout screen. An
    approved-but-unpaid week has not been spent yet and is deliberately absent.
    """
    total = _payout_rows(since, until).aggregate(s=Sum('amount'))['s']
    return _money(total)


def inventory_for(since, until):
    """Committed purchase-order spend in the window.

    PurchaseOrder.total is a Python property (subtotal + tax, and subtotal sums
    a per-line property), so it cannot be a SQL Sum. The set of POs in a month
    is small, so iterating is fine; if purchasing volume ever makes this bite,
    the fix is a stored total column, not a cleverer query.
    """
    pos = _committed_pos(since, until)
    return _money(sum((Decimal(po.total) for po in pos), ZERO))


def manual_costs_for(since, until):
    from .models import Expense
    rows = (_expense_rows(since, until)
            .values('category')
            .annotate(amount=Sum('amount'))
            .order_by('category'))
    labels = dict(Expense.Category.choices)
    breakdown = [{'category': r['category'],
                  'label': labels.get(r['category'], r['category']),
                  'amount': _money(r['amount'])} for r in rows]
    return breakdown, sum((b['amount'] for b in breakdown), ZERO)


def profit_and_loss(period=None, since=None, until=None):
    since, until, name = resolve_window(period, since, until)
    revenue = revenue_for(since, until)
    salaries = salaries_for(since, until)
    inventory = inventory_for(since, until)
    manual, manual_total = manual_costs_for(since, until)

    total_costs = salaries + inventory + manual_total
    profit = revenue['total'] - total_costs
    return {
        'window': {'since': since.isoformat(), 'until': until.isoformat(),
                   'period': name},
        'revenue': revenue,
        'costs': {
            'salaries': salaries,
            'inventory': inventory,
            'manual': manual,
            'manual_total': manual_total,
            'total': total_costs,
        },
        'profit': profit,
        # Margin against revenue, in percent. None rather than zero when
        # nothing came in: a period with no revenue has no margin, and 0%
        # would read as "sold at cost".
        'margin_percent': (_money(profit / revenue['total'] * 100)
                           if revenue['total'] > ZERO else None),
        'outstanding': outstanding_now(),
    }


def trend(period=None, since=None, until=None, points=12):
    """The same report, one bucket at a time, oldest first.

    Buckets follow the period the report is on -- a year of months, a month of
    days -- so the series and the headline figure are always the same question
    asked at two resolutions.
    """
    since, until, name = resolve_window(period, since, until)
    step = {'day': 'day', 'week': 'day', 'month': 'day'}.get(name, 'month')

    buckets = []
    if step == 'day':
        cursor = since
        while cursor <= until and len(buckets) < 366:
            buckets.append((cursor, cursor))
            cursor += timedelta(days=1)
    else:
        cursor = since.replace(day=1)
        while cursor <= until and len(buckets) < points:
            nxt = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
            buckets.append((max(cursor, since), min(nxt - timedelta(days=1), until)))
            cursor = nxt

    if not buckets:
        return {'step': step, 'series': []}

    # Each source is read ONCE for the whole window, a day at a time, and the
    # days are added up into buckets here. Asking every bucket separately was
    # four queries a bucket -- 89 for a month of days, 178 round trips with
    # django-tenants' SET search_path in front of each -- to draw one chart.
    # The figures are the ones the per-bucket functions above produce: the
    # same rows, the same filters, rounded at the same point.
    revenue_by_day, salaries_by_day, inventory_by_day, manual_by_day = _daily_figures(
        buckets[0][0], buckets[-1][1])

    def within(by_day, start, end):
        return (amount for day, amount in by_day.items() if start <= day <= end)

    series = []
    for start, end in buckets:
        revenue = _money(sum(within(revenue_by_day, start, end), ZERO))
        # manual_costs_for rounds each category's total before adding them up.
        by_category = {}
        for (day, category), amount in manual_by_day.items():
            if start <= day <= end:
                by_category[category] = by_category.get(category, ZERO) + amount
        manual = sum((_money(amount) for amount in by_category.values()), ZERO)
        costs = (_money(sum(within(salaries_by_day, start, end), ZERO))
                 + _money(sum(within(inventory_by_day, start, end), ZERO))
                 + manual)
        series.append({'since': start.isoformat(), 'until': end.isoformat(),
                       'revenue': revenue, 'costs': costs,
                       'profit': revenue - costs})
    return {'step': step, 'series': series}


def _daily_figures(since, until):
    """Revenue and each cost in the window, summed per day (manual per day and category)."""
    revenue = {day: amount or ZERO for day, amount in
               _revenue_rows(since, until).order_by().values('received_on')
               .annotate(amount=Sum('amount')).values_list('received_on', 'amount')}
    # TruncDate converts to the current time zone, the same day __date filters on.
    salaries = {day: amount or ZERO for day, amount in
                _payout_rows(since, until).order_by().annotate(day=TruncDate('paid_at'))
                .values('day').annotate(amount=Sum('amount')).values_list('day', 'amount')}
    # PurchaseOrder.total is a Python property; see inventory_for.
    inventory = {}
    for po in _committed_pos(since, until):
        inventory[po.order_date] = inventory.get(po.order_date, ZERO) + Decimal(po.total)
    manual = {(day, category): amount or ZERO for day, category, amount in
              _expense_rows(since, until).order_by().values('incurred_on', 'category')
              .annotate(amount=Sum('amount')).values_list('incurred_on', 'category', 'amount')}
    return revenue, salaries, inventory, manual
