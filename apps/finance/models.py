"""Manual business costs, and the one thing this app is really for: a place to
enter the money the boutique spends that nothing else records.

Inventory spend and staff salaries are NOT stored here -- they already live in
apps.inventory (PurchaseOrder) and apps.payroll (Payout), and the P&L service
reads them straight from those. Duplicating them here would double-count the
moment someone entered a purchase both as a PO and as an expense. So the
categories below are exactly the recurring costs that had no home before: rent,
utilities, and the rest.
"""

import uuid

from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.db import models

from crm_api.models import IMAGE_PATH_MAX_LENGTH, _unguessable_path


def _receipt_storage():
    """Raw storage under Cloudinary -- a receipt is usually a PDF or a photo.

    Same reasoning as apps.staff.StaffDocument: the image-only Cloudinary
    endpoint rejects a PDF, so read the resolved default backend and fall back
    to raw when it is Cloudinary. Local checkouts and tests keep the disk.
    """
    from django.conf import settings
    if 'cloudinary' in settings.STORAGES['default']['BACKEND']:
        from cloudinary_storage.storage import RawMediaCloudinaryStorage
        return RawMediaCloudinaryStorage()
    from django.core.files.storage import default_storage
    return default_storage


def upload_to_receipts(instance, filename):
    return _unguessable_path('expense_receipts', filename)


class Expense(models.Model):
    """One cost the owner paid that no other part of the system records.

    `incurred_on` is the date the cost belongs to -- the month it lands in on
    the P&L -- which is not always the day it was typed in. Windowing is done
    on it, not on created_at, so a rent bill entered late still counts in the
    month it was for.
    """

    class Category(models.TextChoices):
        RENT = 'RENT', 'Rent'
        UTILITIES = 'UTILITIES', 'Utilities'
        MARKETING = 'MARKETING', 'Marketing'
        MAINTENANCE = 'MAINTENANCE', 'Maintenance & repairs'
        SUPPLIES = 'SUPPLIES', 'Shop supplies'
        PROFESSIONAL = 'PROFESSIONAL', 'Professional fees'
        OTHER = 'OTHER', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=20, choices=Category.choices,
                                default=Category.OTHER, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2,
                                 validators=[MinValueValidator(0)])
    incurred_on = models.DateField(db_index=True)
    paid_to = models.CharField(max_length=150, blank=True, default='')
    note = models.TextField(blank=True, default='')
    receipt = models.FileField(upload_to=upload_to_receipts,
                               storage=_receipt_storage,
                               max_length=IMAGE_PATH_MAX_LENGTH,
                               blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name='expenses_created')

    class Meta:
        ordering = ['-incurred_on', '-created_at']
        indexes = [models.Index(fields=['incurred_on', 'category'])]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gte=0),
                                   name='finance_expense_amount_not_negative'),
        ]

    def __str__(self):
        return f"{self.get_category_display()} · {self.amount} · {self.incurred_on}"


class Payment(models.Model):
    """One instalment of money actually received against an order, with its date.

    WHY THIS EXISTS
    ===============
    `Order.amount_paid` is a SNAPSHOT, not a ledger: every write path
    (`domains.orders.services.apply_advance`, `OrderViewSet._reconcile_payment`)
    SETS it to the new running total and keeps no record of when the money
    arrived. So "revenue in September" could only ever be computed by windowing
    on `Order.order_date` -- which attributes a March payment to the January the
    order was written in, and silently moves the whole figure if an old order is
    settled today.

    Each row here is one receipt: an amount, and the day it was received. The
    snapshot stays authoritative for "how much has this order been paid"; these
    rows are authoritative for "how much came in during this period". Both must
    agree in total, which is what `finance.payments.sync_from_order` keeps true.

    `received_on` is a date, not a timestamp: a boutique books takings by the
    day, and a date is what every window in this app compares against
    (Expense.incurred_on does the same).
    """

    class Method(models.TextChoices):
        CASH = 'CASH', 'Cash'
        UPI = 'UPI', 'UPI'
        CARD = 'CARD', 'Card'
        BANK = 'BANK', 'Bank transfer'
        OTHER = 'OTHER', 'Other'

    class Source(models.TextChoices):
        #: Entered as a payment, with its own date.
        RECORDED = 'RECORDED', 'Recorded at the counter'
        #: Derived from a change to Order.amount_paid, because the order screens
        #: still write the snapshot. Dated the day the change was seen.
        SNAPSHOT = 'SNAPSHOT', 'Derived from the order total'
        #: Written by the backfill for money taken before this table existed.
        #: Dated the order's own date, which is the best attribution available
        #: for it -- see the migration.
        BACKFILL = 'BACKFILL', 'Recorded before payments were dated'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey('crm_api.Order', on_delete=models.CASCADE,
                              related_name='payments', db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2,
                                 validators=[MinValueValidator(0)])
    received_on = models.DateField(db_index=True)
    method = models.CharField(max_length=10, choices=Method.choices,
                              default=Method.CASH)
    source = models.CharField(max_length=10, choices=Source.choices,
                              default=Source.RECORDED, db_index=True)
    reference = models.CharField(max_length=100, blank=True, default='')
    note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name='payments_recorded')

    class Meta:
        ordering = ['-received_on', '-created_at']
        indexes = [models.Index(fields=['received_on', 'order'])]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gte=0),
                                   name='finance_payment_amount_not_negative'),
        ]

    def __str__(self):
        return f"{self.amount} on {self.received_on} for {self.order_id}"
