"""Customer birthdays: a WhatsApp wish at 12 AM on the day, and the boutique told.

Run every 15 minutes by `manage.py send_birthday_wishes`, like the daily
summary. A boutique is due while its own clock reads 00:xx (12 AM), so every
customer is wished at midnight in their boutique's timezone, and a run that
missed or failed is made up by the next one in that hour.

For each boutique, in that hour:
  * a customer whose birthday is today gets a simple WhatsApp wish from the
    boutique's own number, and the boutique gets a "Birthday today" alert;
  * a customer whose birthday is in REMIND_DAYS days puts a "Birthday in 3
    days" alert in front of the boutique.
BirthdayGreeting keeps each of those to once per customer per year. A
29 February birthday is kept on 28 February in a year without one. Leads and
customers without a date of birth are left out; with customer messaging off,
or no mobile number, the boutique is still told but nothing is sent.
"""
import calendar
import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, tenant_context

from core.formatting import tenant_timezone

logger = logging.getLogger(__name__)

WISH_HOUR = 0          # 12 AM, the boutique's own clock
REMIND_DAYS = 3        # the boutique's advance reminder

WISH_BODY = ("Wishing you a very happy birthday! 🎂\n"
             "May the year ahead be full of joy and beautiful moments.")


def birthdays_on(day):
    """Customers (not leads) whose birthday falls on `day`."""
    from crm_api.models import Customer

    match = Q(date_of_birth__month=day.month, date_of_birth__day=day.day)
    if day.month == 2 and day.day == 28 and not calendar.isleap(day.year):
        match |= Q(date_of_birth__month=2, date_of_birth__day=29)
    return Customer.objects.filter(match, date_of_birth__isnull=False, is_lead=False)


def due(tenant, now):
    return timezone.localtime(now, tenant_timezone(tenant)).hour == WISH_HOUR


def _name(customer):
    return f"{customer.first_name} {customer.last_name}".strip() or 'A customer'


def _wish(customer, config, tenant):
    """Send the wish; returns (status, error)."""
    from apps.scheduling.notifications import compose
    from crm_api.whatsapp_service import send_whatsapp_message

    if not config.customer_messaging_enabled:
        return 'SKIPPED', 'Customer messaging is switched off.'
    number = (customer.mobile_number or '').strip()
    if not number:
        return 'SKIPPED', 'No mobile number.'
    try:
        result = send_whatsapp_message(phone=number, tenant=tenant,
                                       message_text=compose(customer.first_name, config.name, WISH_BODY))
    except Exception as exc:  # noqa: BLE001 - one failed send is not a failed run
        return 'FAILED', str(exc)
    if result.get('success'):
        return 'SENT', ''
    return 'FAILED', str(result.get('error') or result.get('data') or 'WhatsApp delivery failed')


def send_for_tenant(tenant, now):
    """This boutique's wishes for today and reminders for REMIND_DAYS ahead.
    Returns counts, e.g. {'wished': 2, 'reminded': 1, 'failed': 0}."""
    from crm_api.models import BirthdayGreeting, BoutiqueSettings, Notification

    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    today = timezone.localtime(now, tenant_timezone(tenant)).date()
    counts = {'wished': 0, 'reminded': 0, 'failed': 0}

    for customer in birthdays_on(today):
        row, created = BirthdayGreeting.objects.get_or_create(
            customer=customer, year=today.year, kind=BirthdayGreeting.KIND_WISH)
        if row.status in ('SENT', 'SKIPPED'):
            continue
        row.status, row.error = _wish(customer, config, tenant)
        row.save(update_fields=['status', 'error', 'updated_at'])
        if row.status == 'SENT':
            counts['wished'] += 1
        elif row.status == 'FAILED':
            counts['failed'] += 1
        if created:
            how = ('A birthday wish was sent to them on WhatsApp.' if row.status == 'SENT'
                   else f'No WhatsApp wish was sent: {row.error}')
            Notification.objects.create(
                recipient_role='Owner', title=f"Birthday today: {_name(customer)}",
                message=f"Today is {_name(customer)}'s birthday ({customer.mobile_number}). {how}")

    ahead = today + timedelta(days=REMIND_DAYS)
    for customer in birthdays_on(ahead):
        row, created = BirthdayGreeting.objects.get_or_create(
            customer=customer, year=ahead.year, kind=BirthdayGreeting.KIND_REMINDER,
            defaults={'status': 'SENT'})
        if created:
            Notification.objects.create(
                recipient_role='Owner', title=f"Birthday in {REMIND_DAYS} days: {_name(customer)}",
                message=(f"{_name(customer)}'s birthday is on {ahead.strftime('%d %b')} "
                         f"({customer.mobile_number}). They will get a WhatsApp wish at 12 AM that day."))
            counts['reminded'] += 1
    return counts


def run(now=None, ignore_window=False, schema=None):
    """Every active boutique that is due: [(schema, counts or the exception)]."""
    from tenants.models import BoutiqueTenant

    now = now or timezone.now()
    tenants = (BoutiqueTenant.objects.filter(is_active=True)
               .exclude(schema_name__in=(get_public_schema_name(), settings.TENANT_BASE_SCHEMA)))
    if schema:
        tenants = tenants.filter(schema_name=schema)
    results = []
    for tenant in tenants:
        if not ignore_window and not due(tenant, now):
            continue
        try:
            with tenant_context(tenant):
                results.append((tenant.schema_name, send_for_tenant(tenant, now)))
        except Exception as exc:  # noqa: BLE001 - one boutique's failure is not the others'
            logger.exception("birthday wishes for %s failed", tenant.schema_name)
            results.append((tenant.schema_name, exc))
    return results
