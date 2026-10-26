
import datetime
import logging
import threading

from django.conf import settings
from django.db import connection, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.module_loading import import_string

from crm_api.models import BoutiqueSettings, CustomerMessage

logger = logging.getLogger(__name__)

_cache = {}

# Automatic tries before a message is FAILED and left to staff (Retry, or
# Open WhatsApp and Mark sent, on the order).
MAX_ATTEMPTS = 3
# The wait before the second and the third try. The send_queued_messages cron
# (every minute) takes a message up once it is due.
RETRY_AFTER = (datetime.timedelta(minutes=1), datetime.timedelta(minutes=5))
# A try claims the message until then. One that never reports back (its
# worker restarted mid-send) is due again afterwards, and counts as a try.
CLAIM_LEASE = datetime.timedelta(minutes=5)
# A failed message whose next try is this overdue has nobody retrying it -- the
# cron is not set up, or has stopped -- so it is FAILED and goes to staff
# rather than waiting as QUEUED forever. With the cron running every minute
# a retry is never this late.
STALE_AFTER = datetime.timedelta(minutes=10)


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


def _queue(order, template_key, body, **fields):
    """Write the message and, with a sender configured, send it once the
    caller's transaction commits -- off the request, so placing an order or
    moving a stage never waits on WhatsApp. With none, it waits for staff."""
    backend = get_backend()
    message = CustomerMessage.objects.create(
        order=order, template_key=template_key, to_number=order.customer.mobile_number,
        body=body, next_attempt_at=timezone.now() if backend is not None else None, **fields)
    if backend is not None:
        transaction.on_commit(lambda: dispatch(message.pk))
    return message


def dispatch(pk):
    """Make the first try now, on a thread of its own; the cron retries."""
    if not getattr(settings, 'CUSTOMER_MESSAGES_IN_BACKGROUND', True):
        attempt(pk)
        return
    tenant = getattr(connection, 'tenant', None)
    threading.Thread(target=_attempt_in_thread, args=(tenant, pk), daemon=True).start()


def _attempt_in_thread(tenant, pk):
    from django_tenants.utils import tenant_context
    try:
        if tenant is None:
            attempt(pk)
        else:
            with tenant_context(tenant):
                attempt(pk)
    except Exception:  # noqa: BLE001 - the cron takes the message up again
        logger.exception("customer message %s: background send crashed", pk)
    finally:
        # This thread's own connection; nothing else will close it.
        connection.close()


def attempt(pk):
    """One try at sending message `pk`, if it is due. Returns the message, or
    None when it is not due (sent, given up on, or claimed by another try).

    The claim is a single conditional UPDATE, so the request's thread, the
    cron and a Retry click can race for the same message and only one sends.
    """
    now = timezone.now()
    claimed = CustomerMessage.objects.filter(
        pk=pk, status='QUEUED', attempts__lt=MAX_ATTEMPTS, next_attempt_at__lte=now,
    ).update(attempts=F('attempts') + 1, next_attempt_at=now + CLAIM_LEASE)
    if not claimed:
        return None
    message = CustomerMessage.objects.select_related('order', 'order__customer').get(pk=pk)
    try:
        message.provider_message_id = _send(message) or ''
        message.status = 'SENT'
        message.error = None
        message.next_attempt_at = None
    except Exception as exc:  # noqa: BLE001 - a failed send is a failed try, nothing more
        message.error = str(exc)
        if message.attempts >= MAX_ATTEMPTS:
            logger.exception("customer message %s failed after %s tries", pk, message.attempts)
            message.status = 'FAILED'
            message.next_attempt_at = None
        else:
            logger.warning("customer message %s: try %s failed: %s", pk, message.attempts, exc)
            message.next_attempt_at = timezone.now() + RETRY_AFTER[message.attempts - 1]
    message.save(update_fields=['provider_message_id', 'status', 'error', 'next_attempt_at'])
    return message


def retry(message):
    """Staff's Retry on a FAILED message: one more try, made now."""
    CustomerMessage.objects.filter(pk=message.pk, status='FAILED').update(
        status='QUEUED', attempts=MAX_ATTEMPTS - 1, next_attempt_at=timezone.now())
    attempt(message.pk)
    message.refresh_from_db()
    return message


def give_up_stale():
    """FAILED for every message that failed a try and whose retry never came."""
    return CustomerMessage.objects.filter(
        status='QUEUED', attempts__gte=1,
        next_attempt_at__lt=timezone.now() - STALE_AFTER,
    ).update(status='FAILED', next_attempt_at=None)


def send_due(limit=100):
    """Every message in this schema whose next try is due: {'SENT': n, ...}."""
    if get_backend() is None:
        return {}
    due = list(CustomerMessage.objects.filter(
        status='QUEUED', attempts__lt=MAX_ATTEMPTS, next_attempt_at__lte=timezone.now(),
    ).order_by('next_attempt_at').values_list('pk', flat=True)[:limit])
    counts = {}
    for pk in due:
        message = attempt(pk)
        if message is not None:
            outcome = message.status if message.status != 'QUEUED' else 'RETRYING'
            counts[outcome] = counts.get(outcome, 0) + 1
    return counts


def _send(message):
    """Hand the message to the configured sender; raises when it is not sent."""
    backend = get_backend()
    if backend is None:
        raise RuntimeError('No WhatsApp sender is set up for this boutique.')
    if backend is whatsapp_backend:
        if message.template_key == 'invoice':
            return _whatsapp_invoice(message)
        if message.template_key == 'garment_photos':
            return _whatsapp_photos(message)
    return backend(message)


def send_customer_message(order, template_key, body, sent_by=None, garment_job=None):
    config, _ = BoutiqueSettings.objects.get_or_create(id=1)
    if not config.customer_messaging_enabled:
        return None
    # A boutique's own production run has no customer and no number.
    if order.customer_id is None:
        return None

    return _queue(order, template_key, body, sent_by=sent_by, garment_job=garment_job)


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
    return _queue(order, 'invoice', caption, sent_by=sent_by)


def _whatsapp_invoice(message):
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
    return str(data.get('messageId') or data.get('id') or 'whatsapp_sent')


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
    # With the boutique's Try-On on, the customer can also see the garment on
    # a photo of themselves.
    from domains.orders import tryon
    job = next((image.garment_job for image in images if image.garment_job_id), None)
    if job is not None and tryon.enabled_for(getattr(connection, 'tenant', None)):
        body += f"\n\nSee yourself in it -- upload your photo here: {tryon.tryon_url(order, job)}"
    return _queue(order, 'garment_photos', body, sent_by=sent_by,
                  image_ids=[image.pk for image in images])


def _whatsapp_photos(message):
    # A retry after a photo failed sends the message and every photo again:
    # the customer may see some twice, which beats missing them.
    import mimetypes
    from crm_api.models import GarmentImage
    from crm_api.whatsapp_service import send_whatsapp_document, send_whatsapp_message
    tenant = getattr(connection, 'tenant', None)
    sent = send_whatsapp_message(phone=message.to_number, message_text=message.body, tenant=tenant)
    if not sent.get('success'):
        raise RuntimeError(f"WhatsApp sending failed: {sent.get('error') or sent.get('data')}")
    for image in GarmentImage.objects.filter(pk__in=message.image_ids):
        with image.image.open('rb') as handle:
            content = handle.read()
        mime = mimetypes.guess_type(image.image.name)[0] or 'image/jpeg'
        res = send_whatsapp_document(
            phone=message.to_number, content=content, filename=image.image.name.rsplit('/', 1)[-1],
            caption=image.get_view_display(), mime_type=mime, media_type='image', tenant=tenant)
        if not res.get('success'):
            raise RuntimeError(f"WhatsApp photo failed: {res.get('error') or res.get('data')}")
    return 'whatsapp_sent'
