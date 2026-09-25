"""Keeping the payment ledger and `Order.amount_paid` in agreement.

The order screens write the snapshot (`apply_advance`, `_reconcile_payment`)
and know nothing about this table. Rather than reach into those code paths,
this module listens to the Order model: whenever the snapshot moves, the
difference is written here as a dated row. One direction only -- the snapshot
leads, the ledger follows -- so there is exactly one place an order's paid
total is decided and no second write path to disagree with it.

A payment entered HERE (finance.views.PaymentViewSet) goes the other way: the
row is written first and the snapshot is updated from the ledger's total, which
keeps the same invariant.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

ZERO = Decimal('0.00')


def ledger_total(order):
    """What the dated rows say this order has been paid."""
    from .models import Payment
    return Payment.objects.filter(order=order).aggregate(
        s=Sum('amount'))['s'] or ZERO


def sync_from_order(order, *, on=None, user=None):
    """Write the difference between the snapshot and the ledger as one row.

    Returns the Payment written, or None when the two already agree. A
    snapshot that went DOWN (a correction) writes nothing and is left for
    `reconcile` to explain -- a negative payment is not a thing that happened,
    and silently deleting history to match a typo is worse than a small
    disagreement the audit can see.
    """
    from .models import Payment

    snapshot = Decimal(order.amount_paid or 0)
    difference = snapshot - ledger_total(order)
    if difference <= ZERO:
        return None

    return Payment.objects.create(
        order=order,
        amount=difference,
        received_on=on or timezone.localdate(),
        source=Payment.Source.SNAPSHOT,
        created_by=user,
    )


@transaction.atomic
def record(order, *, amount, received_on=None, method=None, reference='',
           note='', user=None):
    """Enter a payment, then bring the order's snapshot up to the ledger.

    The ledger leads here, which is the only case where it does: somebody is
    stating the amount AND the date, which the snapshot cannot carry.
    """
    from .models import Payment

    amount = Decimal(amount)
    payment = Payment.objects.create(
        order=order,
        amount=amount,
        received_on=received_on or timezone.localdate(),
        method=method or Payment.Method.CASH,
        source=Payment.Source.RECORDED,
        reference=reference or '',
        note=note or '',
        created_by=user,
    )

    total = order.total_amount or ZERO
    paid = min(ledger_total(order), total)
    order.amount_paid = paid
    order.payment_status = ('Paid' if paid >= total > ZERO
                            else 'Partially Paid' if paid > ZERO else 'Pending')
    # update_fields, and not a full save: an order carries workroom state this
    # module has no business rewriting.
    order.save(update_fields=['amount_paid', 'payment_status'])
    return payment


def outstanding_for(orders):
    """What is billed but not collected, per order, summed. Never negative.

    Reads the snapshot rather than the ledger: "what does this customer still
    owe" is a question about the order's own books, and the snapshot is what
    every other screen shows against that order. A per-row floor of zero so an
    overpaid order cannot net off a real debt on another.
    """
    total = ZERO
    for billed, paid in orders.values_list('total_amount', 'amount_paid'):
        total += max(Decimal(billed or 0) - Decimal(paid or 0), ZERO)
    return total
