"""The WhatsApp the customer gets when their appointment is booked.

Deliberately NOT domains.orders.messaging.send_customer_message: that logs a
CustomerMessage, whose `order` is a required FK, and an appointment has no
order. Rather than make that column nullable for a message that is not about an
order, this calls the same transport the order messages end up in
(crm_api.whatsapp_service) and leaves the booking itself as the record --
UniversalActivity already carries one, written by the viewset.

Never raises. A boutique whose WhatsApp session has dropped must still be able
to write appointments in its book.
"""
import logging
import time

from django.db import connection, transaction

from core.formatting import format_datetime
from crm_api.models import BoutiqueSettings

logger = logging.getLogger(__name__)


#: Every WhatsApp the boutique sends reads the same way: who it is for, who it
#: is from, what it says, and the product's own sign-off. One template, so a
#: second kind of message cannot drift into its own shape.
MESSAGE_TEMPLATE = """Hello {customer},

This is from {boutique}.

{body}

(Scaleezy)"""


def compose(customer_name, boutique_name, body):
    """The house shape, filled in. `body` is the part each message decides."""
    return MESSAGE_TEMPLATE.format(
        customer=(customer_name or '').strip() or 'there',
        boutique=(boutique_name or '').strip() or 'your boutique',
        body=body.strip(),
    )


def appointment_body(appointment):
    """What this particular message has to say, without the wrapper."""
    when = format_datetime(appointment.scheduled_time)
    what = appointment.get_appointment_type_display()
    lines = [f"Your {what.lower()} is booked for {when}."]
    if appointment.assigned_staff_id:
        lines.append(f"You will be seen by boutique owner.")
    return '\n'.join(lines)


def appointment_message(appointment, boutique_name=''):
    """The words sent. One place, so a test can read them without a network."""
    return compose(appointment.customer.first_name, boutique_name,
                   appointment_body(appointment))


def send_appointment_booked(appointment):
    """Tell the customer, once the booking has actually committed.

    Returns None. Queued with transaction.on_commit so a message is never sent
    for an appointment that a later error rolled back -- the same rule
    domains.orders.messaging follows.
    """
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    if not config.customer_messaging_enabled:
        return None

    number = (appointment.customer.mobile_number or '').strip()
    if not number:
        return None

    body = appointment_message(appointment, boutique_name=config.name or '')
    tenant = getattr(connection, 'tenant', None)

    def deliver():
        from crm_api.whatsapp_service import send_whatsapp_message

        # Three tries, widening. The WhatsApp session drops and re-dials on its
        # own, and a booking that landed inside one of those windows used to
        # lose its message outright: one attempt, a warning in the log, and
        # nobody told the customer. The gaps are long enough for the service's
        # own reconnect (it retries after 3s) and short enough that a
        # confirmation still reads as immediate.
        for attempt, wait in enumerate((4, 10, 0), start=1):
            try:
                result = send_whatsapp_message(phone=number, message_text=body, tenant=tenant)
                if result.get('success'):
                    return
                reason = result.get('error') or result.get('message') or result.get('data')
            except Exception as exc:  # noqa: BLE001 - a dropped session is not a failed booking
                logger.exception("appointment %s: WhatsApp send raised", appointment.pk)
                reason = exc
            if wait:
                logger.info("appointment %s: WhatsApp attempt %s failed (%s), retrying in %ss",
                            appointment.pk, attempt, reason, wait)
                time.sleep(wait)
            else:
                logger.warning("appointment %s: WhatsApp not sent after %s attempts (%s)",
                               appointment.pk, attempt, reason)

    transaction.on_commit(deliver)
    return None
