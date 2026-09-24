"""The bridge from `Order.amount_paid` to the dated payment ledger.

Connected in FinanceConfig.ready. A receiver rather than an edit to the order
code on purpose: the order book has several write paths for the snapshot
(`apply_advance`, `_reconcile_payment`, the draft confirm), and one receiver on
the model catches all of them -- including any added later -- without this app
reaching into another's services.
"""
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='crm_api.Order', dispatch_uid='finance_payment_ledger')
def mirror_order_payment(sender, instance, created, **kwargs):
    update_fields = kwargs.get('update_fields')
    # A save that did not touch the money columns cannot have moved the total,
    # and most saves on an order are workroom state.
    if update_fields is not None and 'amount_paid' not in update_fields:
        return

    from . import payments

    # After commit: the snapshot the ledger is being squared against must be
    # the one that actually landed, and a rolled-back order must not leave a
    # payment behind.
    transaction.on_commit(lambda: payments.sync_from_order(instance))
