"""
The outbound log: who the product has messaged, on which channel, and whether
it went. Written by crm_api.whatsapp_service and apps.email_service.backends,
read by the console's Messages sent screen.
"""
import logging
from datetime import timedelta

from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, schema_context

from .models import OutboundMessage

logger = logging.getLogger(__name__)

# What the senders pass as `purpose`, in words. An order message's purpose is its
# template key, which reads well enough with the underscores taken out.
PURPOSES = {
    'portal_code': 'Website sign-in code',
    'enquiry': 'Enquiry confirmation',
    'appointment': 'Appointment confirmation',
    'birthday': 'Birthday wish',
    'daily_summary': 'Daily summary',
    'guardian': 'Platform alert',
    'api': 'Sent through the API',
    'invoice': 'Invoice',
    'garment_photos': 'Garment photos',
}


def record(channel, recipients, status, purpose='', subject='', boutique=None, session='', error=''):
    """Add one row per recipient. Never raises, and never rolls back the
    caller's transaction: the log must not be why a message does not go."""
    try:
        schema = connection.schema_name if boutique is None else boutique
        if schema == get_public_schema_name():
            schema = ''
        rows = [
            OutboundMessage(
                channel=channel, recipient=str(recipient)[:254], status=status,
                boutique=(schema or '')[:63], purpose=(purpose or '')[:100],
                subject=(subject or '')[:255], session=(session or '')[:100],
                error=(error or '')[:300])
            for recipient in recipients if recipient
        ]
        if not rows:
            return
        with schema_context(get_public_schema_name()), transaction.atomic():
            OutboundMessage.objects.bulk_create(rows)
    except Exception:
        # No recipient in this line: the log file is not where they belong.
        logger.exception('outbound %s message not recorded', channel)


def _describe(purpose):
    return PURPOSES.get(purpose) or purpose.replace('_', ' ').capitalize()


def summary(now=None):
    day = OutboundMessage.objects.filter(at__gt=(now or timezone.now()) - timedelta(days=1))
    return {
        'whatsapp_sent': day.filter(channel=OutboundMessage.WHATSAPP, status=OutboundMessage.SENT).count(),
        'email_sent': day.filter(channel=OutboundMessage.EMAIL, status=OutboundMessage.SENT).count(),
        'failed': day.filter(status=OutboundMessage.FAILED).count(),
        'blocked': day.filter(status=OutboundMessage.BLOCKED).count(),
    }


def listing(channel='', status='', boutique='', term='', page=1, page_size=50):
    """One page of the log, newest first. Runs in the public schema."""
    from tenants.models import BoutiqueTenant

    queryset = OutboundMessage.objects.all()
    if channel:
        queryset = queryset.filter(channel=channel)
    if status:
        queryset = queryset.filter(status=status)
    if boutique:
        queryset = queryset.filter(boutique=boutique)
    if term:
        queryset = queryset.filter(Q(recipient__icontains=term) | Q(subject__icontains=term))

    total = queryset.count()
    start = (page - 1) * page_size
    rows = list(queryset[start:start + page_size])
    names = dict(BoutiqueTenant.objects
                 .filter(schema_name__in={row.boutique for row in rows if row.boutique})
                 .values_list('schema_name', 'name'))
    return {
        'entries': [{
            'id': row.id, 'at': row.at, 'channel': row.channel, 'recipient': row.recipient,
            'status': row.status, 'boutique': row.boutique,
            'boutique_name': names.get(row.boutique, ''),
            # An email says what it was in its subject; a WhatsApp has none.
            'what': row.subject or _describe(row.purpose),
            'error': row.error,
        } for row in rows],
        'count': total,
        'page': page,
        'page_size': page_size,
        'pages': max(1, -(-total // page_size)),
        'summary': summary(),
    }
