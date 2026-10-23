"""Customer try-on: the customer's own photo, dressed in their finished garment.

The link goes out with a garment's photos (messaging.send_customer_garment_photos)
and opens a public page (crm_api/tryon_views.py) with no sign-in. The customer
uploads a photo of themselves; the TryOn2Buy external API puts the garment's
front photo on it. Their photo is kept only for the length of the call, the
picture made from it is kept on the order.

Each picture is a paid call, so a garment gets MAX_TRIES of them, and the link
stops once that garment is delivered.
"""
import base64
import io
import logging
import uuid
from datetime import timedelta

import requests
from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

SALT = 'crm.garment-tryon'
MAX_TRIES = 3
# The vendor cuts itself off at 90 s and asks for a client timeout of at least
# 120 s; connect, then read.
TIMEOUT = (12, 130)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# The vendor fits every image into 768 x 1024; twice that is plenty to send.
MAX_SIDE = 2048
# A try that was never finished (the worker died mid-call) stops counting
# after this long, so a crash does not use up the customer's tries.
STALE_AFTER = timedelta(minutes=5)

# Our garment template keys -> the vendor's categories. Anything else is the
# vendor's DEFAULT ("any other outfit"); leaving category out would make it a
# saree.
CATEGORIES = {
    'saree': 'SAREE',
    'lehenga': 'LEHANGA',
    'anarkali': 'ANARKALI',
    'sharara': 'SHARARA',
    'kurti': 'KURTHI',
}


class TryOnError(Exception):
    """A try-on that could not be made. `code` picks the customer's message."""

    def __init__(self, code, detail=''):
        super().__init__(detail or code)
        self.code = code


def configured():
    return bool(getattr(settings, 'TRYON_API_URL', '') and getattr(settings, 'TRYON_API_KEY', ''))


def enabled_for(tenant):
    """Is try-on on for this boutique: the key is set and its module is on."""
    from core.modules import is_enabled
    if not configured() or tenant is None:
        return False
    return is_enabled(getattr(tenant, 'plan', None), getattr(tenant, 'enabled_modules', None), 'try_on')


def build_token(order, job):
    return signing.dumps({'s': connection.schema_name, 'o': order.order_id, 'g': str(job.pk)}, salt=SALT)


def read_token(token):
    try:
        payload = signing.loads(token, salt=SALT)
        return payload['s'], payload['o'], payload['g']
    except (signing.BadSignature, KeyError, TypeError):
        return None, None, None


def tryon_url(order, job):
    base = getattr(settings, 'TRACKING_BASE_URL', '') or ''
    return f"{base.rstrip('/')}/try-on/{build_token(order, job)}/"


def category_for(job):
    key = (job.template.key if job.template_id else '') or ''
    return CATEGORIES.get(key.lower(), 'DEFAULT')


def garment_photo(job):
    """The photo the garment is taken from: its front, else the first sent."""
    sent = [image for image in job.photos.all() if image.sent_at]
    return next((i for i in sent if i.view == 'FRONT'), None) or (sent[0] if sent else None)


def delivered(order, job):
    if order.order_status == 'Delivered':
        return True
    return order.stages.filter(stage_key='delivered', garment_job=job, status='COMPLETED').exists()


def counted(job):
    """The tries this garment has had: made, timed out (maybe charged), or
    still being made."""
    from crm_api.models import GarmentTryOn
    fresh = timezone.now() - STALE_AFTER
    return job.tryons.filter(
        status__in=(GarmentTryOn.DONE, GarmentTryOn.TIMEOUT)).count() + job.tryons.filter(
        status=GarmentTryOn.PENDING, created_at__gte=fresh).count()


def tries_left(job):
    return max(MAX_TRIES - counted(job), 0)


def _as_jpeg(upload):
    """The customer's photo as an upright JPEG no larger than MAX_SIDE."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    if upload.size > MAX_UPLOAD_BYTES:
        raise TryOnError('too_big')
    try:
        image = Image.open(upload)
        image = ImageOps.exif_transpose(image).convert('RGB')
    except (UnidentifiedImageError, OSError, ValueError):
        raise TryOnError('bad_photo')
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=88)
    return out.getvalue()


def _public(url, request):
    # Cloudinary answers absolute https URLs; local storage answers /media/...
    return url if url.startswith(('http://', 'https://')) else request.build_absolute_uri(url)


def _call(garment_url, human_url, category):
    try:
        res = requests.post(
            settings.TRYON_API_URL,
            headers={'x-api-key': settings.TRYON_API_KEY},
            json={'garmentImageUrl': garment_url, 'humanImageUrl': human_url,
                  'category': category, 'returnBase64': True},
            timeout=TIMEOUT)
    except requests.Timeout:
        raise TryOnError('timeout')
    except requests.RequestException as exc:
        raise TryOnError('unavailable', str(exc))
    try:
        data = res.json()
    except ValueError:
        data = {}
    if res.status_code == 504:
        raise TryOnError('timeout', 'GATEWAY_TIMEOUT')
    if res.status_code == 429:
        raise TryOnError('busy', str(data.get('error')))
    if not res.ok or not data.get('resultBase64'):
        raise TryOnError('unavailable', f"{res.status_code}: {data.get('error')}")
    try:
        return base64.b64decode(data['resultBase64'])
    except (ValueError, TypeError):
        raise TryOnError('unavailable', 'unreadable resultBase64')


def make(order, job, upload, request):
    """One try-on for this garment from the customer's uploaded photo.

    Returns the GarmentTryOn made; raises TryOnError with a code the page
    turns into a message. The try is counted before the call and the
    customer's photo is deleted after it, whatever happens.
    """
    from apps.catalog.models import GarmentJob
    from crm_api.models import GarmentTryOn

    photo = garment_photo(job)
    if photo is None:
        raise TryOnError('no_garment')
    jpeg = _as_jpeg(upload)

    # The count and the new row under the garment's lock: two taps at once
    # must not both pass the limit.
    with transaction.atomic():
        GarmentJob.objects.select_for_update().filter(pk=job.pk).first()
        if tries_left(job) <= 0:
            raise TryOnError('no_tries')
        attempt = GarmentTryOn.objects.create(order=order, garment_job=job)

    saved = default_storage.save(f'tryon_uploads/{uuid.uuid4().hex}/photo.jpg', ContentFile(jpeg))
    try:
        result = _call(_public(photo.image.url, request), _public(default_storage.url(saved), request),
                       category_for(job))
    except TryOnError as exc:
        attempt.status = GarmentTryOn.TIMEOUT if exc.code == 'timeout' else GarmentTryOn.FAILED
        attempt.error = str(exc)[:500]
        attempt.save(update_fields=['status', 'error'])
        logger.warning('Try-on %s for order %s failed: %s', attempt.pk, order.order_id, exc)
        raise
    finally:
        try:
            default_storage.delete(saved)
        except Exception:  # noqa: BLE001 - a photo left behind is logged, not the customer's problem
            logger.warning('Try-on upload %s could not be deleted', saved, exc_info=True)

    attempt.result_image.save(f'tryon-{attempt.pk}.jpg', ContentFile(result), save=False)
    attempt.status = GarmentTryOn.DONE
    attempt.save(update_fields=['result_image', 'status'])
    return attempt
