
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


def send_customer_garment_photos(order, garment_name, images, sent_by=None):
    """One garment's finished photos on the customer's WhatsApp: a message
    with the tracking link (where they approve or ask for changes), then each
    photo. Logged as a CustomerMessage ('garment_photos'); sent on commit."""
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    if not config.customer_messaging_enabled or order.customer_id is None:
        return None
    from domains.orders.tracking import tracking_url
    body = (f"Dear {order.customer.first_name}, your {garment_name} for order {order.reference} is ready! "
            f"Here are its photos. Please tell us if it looks good, or what you would like changed: "
            f"{tracking_url(order)}")
    message = CustomerMessage.objects.create(
        order=order, template_key='garment_photos', to_number=order.customer.mobile_number,
        body=body, sent_by=sent_by)
    image_ids = [image.pk for image in images]
    if get_backend() is not None:
        transaction.on_commit(lambda: _deliver_photos(message, image_ids))
    return message


def _deliver_photos(message, image_ids):
    import mimetypes
    backend = get_backend()
    try:
        if backend is whatsapp_backend:
            from django.db import connection
            from crm_api.models import GarmentImage
            from crm_api.whatsapp_service import send_whatsapp_document, send_whatsapp_message
            tenant = getattr(connection, 'tenant', None)
            sent = send_whatsapp_message(phone=message.to_number, message_text=message.body, tenant=tenant)
            if not sent.get('success'):
                raise RuntimeError(f"WhatsApp sending failed: {sent.get('error') or sent.get('data')}")
            for image in GarmentImage.objects.filter(pk__in=image_ids):
                with image.image.open('rb') as handle:
                    content = handle.read()
                mime = mimetypes.guess_type(image.image.name)[0] or 'image/jpeg'
                res = send_whatsapp_document(
                    phone=message.to_number, content=content, filename=image.image.name.rsplit('/', 1)[-1],
                    caption=image.get_view_display(), mime_type=mime, media_type='image', tenant=tenant)
                if not res.get('success'):
                    raise RuntimeError(f"WhatsApp photo failed: {res.get('error') or res.get('data')}")
            message.provider_message_id = 'whatsapp_sent'
        else:
            message.provider_message_id = backend(message) or ''
        message.status = 'SENT'
    except Exception as exc:  # noqa: BLE001 - a failed send is a failed message, nothing more
        logger.exception("garment photos message %s failed", message.pk)
        message.status = 'FAILED'
        message.error = str(exc)
    message.save(update_fields=['provider_message_id', 'status', 'error'])
