
import logging

from django.conf import settings
from django.db import transaction
from django.utils.module_loading import import_string

from crm_api.models import BoutiqueSettings, CustomerMessage

logger = logging.getLogger(__name__)

_cache = {}


def log_backend(message):
    logger.info(
        "customer message [%s] to %s for order %s: %s",
        message.template_key, message.to_number,
        message.order.order_id, message.body,
    )
    return ''


def whatsapp_backend(message):
    """Deliver a CustomerMessage using crm_api.whatsapp_service."""
    from crm_api.whatsapp_service import send_whatsapp_message
    from django.db import connection

    tenant = getattr(connection, 'tenant', None)
    res = send_whatsapp_message(
        phone=message.to_number,
        message_text=message.body,
        tenant=tenant,
    )
    if not res.get('success'):
        err = res.get('error') or res.get('data') or 'WhatsApp delivery failed'
        raise RuntimeError(f"WhatsApp sending failed: {err}")

    data = res.get('data') or {}
    return str(data.get('messageId') or data.get('id') or 'whatsapp_sent')


def get_backend():

    path = getattr(settings, 'CUSTOMER_MESSAGE_BACKEND', '') or ''
    if not path:
        return None
    if path not in _cache:
        try:
            _cache[path] = import_string(path)
        except ImportError:
            logger.exception("CUSTOMER_MESSAGE_BACKEND %r is not importable", path)
            _cache[path] = log_backend
    return _cache[path]


def _deliver(message):
    try:
        message.provider_message_id = get_backend()(message) or ''
        message.status = 'SENT'
    except Exception as exc:  # noqa: BLE001 - any transport failure is just a failed message
        logger.exception("customer message %s failed", message.pk)
        message.status = 'FAILED'
        message.error = str(exc)

    message.save(update_fields=['provider_message_id', 'status', 'error'])


def send_customer_message(order, template_key, body, sent_by=None):
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    if not config.customer_messaging_enabled:
        return None
    # A boutique's own production run has no customer and no number.
    if order.customer_id is None:
        return None

    message = CustomerMessage.objects.create(
        order=order,
        template_key=template_key,
        to_number=order.customer.mobile_number,
        body=body,
        sent_by=sent_by,
    )
    if get_backend() is not None:
        transaction.on_commit(lambda: _deliver(message))
    return message


def send_customer_invoice(order, sent_by=None):
    """The order's invoice as a PDF on the customer's WhatsApp.

    Logged as a CustomerMessage ('invoice') like every other message, and sent
    only once the transaction commits. The file goes through whatsapp_service's
    send-media; a non-WhatsApp backend (the log one in development) gets the
    message as for any other.
    """
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    if not config.customer_messaging_enabled or order.customer_id is None:
        return None
    from core.formatting import format_money
    total = order.total_amount or 0
    paid = order.amount_paid or order.advance_paid or 0
    caption = (f"Invoice for order {order.reference}: total {format_money(total)}, "
               f"paid {format_money(paid)}, balance {format_money(max(total - paid, 0))}.")
    message = CustomerMessage.objects.create(
        order=order, template_key='invoice', to_number=order.customer.mobile_number,
        body=caption, sent_by=sent_by)
    if get_backend() is not None:
        transaction.on_commit(lambda: _deliver_invoice(message))
    return message


def _deliver_invoice(message):
    backend = get_backend()
    try:
        if backend is whatsapp_backend:
            from django.db import connection
            from crm_api.whatsapp_service import send_whatsapp_document
            from domains.orders.invoice_pdf import build_invoice_pdf, invoice_filename
            config, _ = BoutiqueSettings.objects.get_or_create(id=1)
            res = send_whatsapp_document(
                phone=message.to_number, content=build_invoice_pdf(message.order, config),
                filename=invoice_filename(message.order), caption=message.body,
                tenant=getattr(connection, 'tenant', None))
            if not res.get('success'):
                err = res.get('error') or res.get('data') or 'WhatsApp delivery failed'
                raise RuntimeError(f"WhatsApp sending failed: {err}")
            data = res.get('data') or {}
            message.provider_message_id = str(data.get('messageId') or data.get('id') or 'whatsapp_sent')
        else:
            message.provider_message_id = backend(message) or ''
        message.status = 'SENT'
    except Exception as exc:  # noqa: BLE001 - a failed invoice is a failed message, never a failed trial
        logger.exception("invoice message %s failed", message.pk)
        message.status = 'FAILED'
        message.error = str(exc)
    message.save(update_fields=['provider_message_id', 'status', 'error'])
