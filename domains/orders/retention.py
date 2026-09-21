"""Removing the workroom's photos and voice notes once a delivered order
has settled.

What the tailor photographed at each stage and what the owner or Master
dictated over it are working material: they exist so the piece can be
verified and corrected while it is being made. Once the customer has taken
it home they are storage cost and, for a boutique's customers, someone
else's pictures still sitting on a server. So a few days after Delivery
(PURGE_AFTER_DAYS) they go.

A few days, not immediately, because Delivery can be reopened
(reopen_order_stage) and a reopened order should have everything it had.
Inside the window nothing has been touched, so recovery is free; after it
the order reopens with empty attachments and the tailor photographs the
rework as they would any stage.

Deletion is file first, record second: a URL is blanked only once its file
is confirmed gone, and Order.media_purged_at is stamped only once every URL
is. A Cloudinary outage halfway through leaves the remaining URLs in place
and the stamp empty, so the next night's run finishes the job instead of
orphaning files nobody can find again.

Left alone, deliberately: GarmentImage (the finished-garment photographs
the customer sees on their tracking page), design references, fabric
photographs and alteration intake photos -- none of them are workroom
material.
"""

import logging
import re
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from crm_api.models import Order, OrderActivity, OrderStage, OrderStageHistory

logger = logging.getLogger(__name__)

PURGE_AFTER_DAYS = 3

# `https://res.cloudinary.com/<cloud>/<image|video|raw>/upload/v1/<public_id>`
# -- the form cloudinary_storage's url() produces. The version segment is
# optional; Cloudinary also accepts URLs without it.
_CLOUDINARY_URL = re.compile(
    r'^https?://res\.cloudinary\.com/[^/]+/(?P<type>image|video|raw)/upload/(?:v\d+/)?(?P<id>.+)$',
    re.I)


def _delete_url(url):
    """Remove the file behind `url` from storage. True once it is gone --
    including when it already was; False when storage refused, so the
    caller keeps the URL and tries again next run."""
    url = (url or '').strip()
    if not url:
        return True
    m = _CLOUDINARY_URL.match(url)
    if m:
        import cloudinary.uploader
        try:
            result = cloudinary.uploader.destroy(
                m.group('id'), resource_type=m.group('type').lower(), invalidate=True)
        except Exception:
            logger.exception('Could not delete %s', url)
            return False
        return result.get('result') in ('ok', 'not found')
    # Local disk (development, tests): the name is whatever follows MEDIA_URL.
    marker = settings.MEDIA_URL
    if marker in url:
        try:
            default_storage.delete(url.split(marker, 1)[1])
        except Exception:
            logger.exception('Could not delete %s', url)
            return False
        return True
    # Not something we stored (an external link pasted into a note). Leave
    # the file alone; the reference still gets dropped.
    return True


def _delete_field_file(field_file):
    """An ImageField's file. True once gone."""
    if not field_file:
        return True
    try:
        field_file.delete(save=False)
    except Exception:
        logger.exception('Could not delete %s', field_file.name)
        return False
    return True


def purge_order_media(order):
    """Delete this order's workroom media and blank every reference to it.

    Returns True when everything is gone and the order is stamped; False
    when something was left for the next run. Safe to call again.
    """
    clean = True
    now = timezone.now()

    for stage in OrderStage.objects.filter(order=order):
        fields = []
        kept = [u for u in (stage.attachments or []) if not _delete_url(u)]
        if kept != list(stage.attachments or []):
            stage.attachments = kept
            stage.attachment_reviews = {u: r for u, r in (stage.attachment_reviews or {}).items()
                                        if u in kept}
            fields += ['attachments', 'attachment_reviews']
        if stage.voice_note:
            if _delete_url(stage.voice_note):
                stage.voice_note, stage.voice_note_by, stage.voice_note_at = '', '', None
                fields += ['voice_note', 'voice_note_by', 'voice_note_at']
            else:
                clean = False
        clean = clean and not kept
        if fields:
            stage.save(update_fields=fields)

    # Every note ever left keeps its recording's URL in the activity thread,
    # including recordings a later note replaced on the stage row.
    for activity in OrderActivity.objects.filter(order=order, metadata__has_key='voice_note'):
        url = activity.metadata.get('voice_note')
        if not url:
            continue
        if _delete_url(url):
            activity.metadata['voice_note'] = ''
            activity.save(update_fields=['metadata'])
        else:
            clean = False

    for history in OrderStageHistory.objects.filter(order=order):
        if not history.image:
            continue
        if _delete_field_file(history.image):
            history.image = None
            history.save(update_fields=['image'])
        else:
            clean = False

    fields = []
    if order.completed_garment_image:
        if _delete_field_file(order.completed_garment_image):
            order.completed_garment_image = None
            fields.append('completed_garment_image')
        else:
            clean = False
    if order.instructions_voice_note:
        if _delete_url(order.instructions_voice_note):
            order.instructions_voice_note = ''
            order.instructions_voice_note_by = ''
            order.instructions_voice_note_at = None
            fields += ['instructions_voice_note', 'instructions_voice_note_by',
                       'instructions_voice_note_at']
        else:
            clean = False
    if clean:
        order.media_purged_at = now
        fields.append('media_purged_at')
    if fields:
        order.save(update_fields=fields)
    if clean:
        OrderActivity.objects.create(
            order=order, event_type='MEDIA_PURGED',
            metadata={'after_days': PURGE_AFTER_DAYS})
    return clean


def orders_due_for_purge(days=PURGE_AFTER_DAYS, now=None):
    """Delivered orders whose Delivery completed at least `days` ago and
    whose media is still there."""
    cutoff = (now or timezone.now()) - timedelta(days=days)
    return Order.objects.filter(
        order_status='Delivered', media_purged_at__isnull=True,
        stages__stage_key='delivered', stages__status='COMPLETED',
        stages__completed_at__lte=cutoff,
    ).distinct()


def purge_due_orders(days=PURGE_AFTER_DAYS):
    """One pass over the current schema. Returns (purged, left_for_retry)."""
    purged = left = 0
    for order in orders_due_for_purge(days):
        with transaction.atomic():
            if purge_order_media(order):
                purged += 1
            else:
                left += 1
    return purged, left
