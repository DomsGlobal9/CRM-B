"""Who gets a summary, by which channel, and the record that it went once.

Run every 15 minutes by `manage.py send_daily_summaries`. A boutique is due
while its own clock reads 23:xx, so every boutique hears at 11 PM in its own
timezone, and a run that was missed or failed is made up by the next one in
that hour. After midnight the day is over and nothing is sent late
(`--ignore-window` sends by hand).

Channel: WhatsApp when the boutique has the WhatsApp add-on, its session is
connected and the person has a mobile number; otherwise, or if that send
fails, email. The session is the boutique's own, or the shared 'default' one
when it has none -- the same rule appointment confirmations and order messages
follow (crm_api.whatsapp_service). The owner is email only: the WhatsApp number
is the sender, not the owner's own phone.
"""
import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, tenant_context

from core.formatting import tenant_timezone
from core.modules import is_enabled
from core.roles import DESIGNER, MASTER, OWNER

from . import summary
from . import text as tx
from .models import DailySummaryLog, SummaryPreference

logger = logging.getLogger(__name__)

SEND_HOUR = 23
#: Failed sends are tried again by later runs in the same hour, this many times.
MAX_ATTEMPTS = 3


def due(tenant, now):
    return now.astimezone(tenant_timezone(tenant)).hour == SEND_HOUR


def whatsapp_session(tenant):
    """The connected session to send from, or None for email only.

    The boutique's own account, else the shared 'default' session, exactly as
    crm_api.whatsapp_service resolves it for every other boutique message.
    """
    from crm_api import whatsapp_service
    from tenants.models import WhatsAppAccount

    if not is_enabled(tenant.plan, tenant.enabled_modules, 'whatsapp'):
        return None
    account = WhatsAppAccount.objects.filter(tenant=tenant).first()
    session = account.session_id if account else 'default'
    status = whatsapp_service.get_whatsapp_status(session_id=session)
    return session if status.get('connected') else None


def recipients(tenant):
    """(user, role, name, mobile, email, profile) for everyone with a login.

    Built from the owner address and the roster rather than from User, so a
    platform superuser (whom resolve_user_role also calls Owner) is never
    mistaken for the boutique's owner.
    """
    from apps.design_studio.models import Designer
    from apps.todos.services import _owner_users
    from crm_api.models import Tailor

    seen = set()
    for user in _owner_users():
        seen.add(user.id)
        yield user, OWNER, user.get_full_name() or 'Owner', '', tenant.owner_email, None
    for tailor in Tailor.objects.filter(user__is_active=True).select_related('user'):
        if tailor.user_id in seen:
            continue
        seen.add(tailor.user_id)
        terms = getattr(tailor, 'staff_profile', None)
        yield (tailor.user, tailor.role, tailor.name, terms.phone if terms else '',
               tailor.email or tailor.user.email, tailor)
    for designer in Designer.objects.filter(is_active=True, user__is_active=True).select_related('user'):
        if designer.user_id in seen:
            continue
        seen.add(designer.user_id)
        yield (designer.user, DESIGNER, designer.name, designer.phone,
               designer.email or designer.user.email, designer)


def compose(tenant, boutique, day, floor, user, role, profile, lang=tx.DEFAULT):
    if role == OWNER:
        return summary.owner_summary(tenant, boutique, day, floor, lang)
    if role == DESIGNER:
        text = summary.designer_summary(tenant, boutique, day, floor, profile, lang)
    elif role == MASTER:
        text = summary.master_summary(tenant, boutique, day, floor, user, profile, lang)
    else:
        text = summary.staff_summary(tenant, boutique, day, floor, user, profile, lang)
    return summary.with_leads(text, tenant, boutique, day, floor, user, lang)


def claim(user, day, name, role):
    """The log row to send under, or None if this person is done for the day."""
    try:
        with transaction.atomic():
            return DailySummaryLog.objects.create(
                user=user, local_date=day, recipient_name=name, role=role)
    except IntegrityError:
        pass
    # Taken back only from FAILED, and only by one run: the conditional update
    # is the lock.
    taken = (DailySummaryLog.objects
             .filter(user=user, local_date=day, status=DailySummaryLog.STATUS_FAILED,
                     attempts__lt=MAX_ATTEMPTS)
             .update(status=DailySummaryLog.STATUS_SENDING))
    return DailySummaryLog.objects.get(user=user, local_date=day) if taken else None


def deliver(text, subject, mobile, email, session):
    """(channel, address, note). channel is '' when nothing went."""
    from apps.email_service.services.email_service import EmailService
    from crm_api import whatsapp_service
    from crm_api.models import whatsapp_number

    notes = []
    number = whatsapp_number(mobile)
    if session and number:
        result = whatsapp_service.send_whatsapp_message(
            phone=number, message_text=text, session_id=session)
        if result.get('success'):
            return 'whatsapp', number, ''
        data = result.get('data') or {}
        notes.append(f"WhatsApp failed: {result.get('error') or data.get('message') or data}")
    elif session and mobile:
        notes.append('Mobile number on file is not a valid WhatsApp number.')
    if email:
        if EmailService.send_email(subject=subject, recipient_list=[email], body=text):
            return 'email', email, '; '.join(notes)
        notes.append('Email failed.')
    else:
        notes.append('No email on file.')
    return '', '', '; '.join(notes)


def send_for_tenant(tenant, now, dedup=True):
    """Send today's summaries for the boutique the connection is set to.

    dedup=False is the testing mode (`--test-every`): everyone is sent again on
    every run and nothing is written to DailySummaryLog.
    """
    from crm_api.models import BoutiqueSettings

    tz = tenant_timezone(tenant)
    day = now.astimezone(tz).date()
    boutique = (BoutiqueSettings.objects.values_list('name', flat=True).filter(id=1).first()
                or tenant.name)
    floor = summary.Floor(day, tz, now)
    session = whatsapp_session(tenant)
    preferences = {p.user_id: p for p in SummaryPreference.objects.all()}
    counts = {}

    for user, role, name, mobile, email, profile in recipients(tenant):
        preference = preferences.get(user.id)
        # Switched off by the owner: nothing is sent and nothing is logged, so
        # switching back on the same evening still sends that day's summary.
        if preference is not None and not preference.enabled:
            continue
        lang = preference.language if preference else tx.DEFAULT
        subject = tx.t(lang, '{boutique} · daily summary', boutique=boutique)
        log = (claim(user, day, name, role) if dedup else
               DailySummaryLog(user=user, local_date=day, recipient_name=name, role=role))
        if log is None:
            continue
        log.attempts += 1
        try:
            text = compose(tenant, boutique, day, floor, user, role, profile, lang)
            if text is None:
                log.status, log.error = DailySummaryLog.STATUS_SKIPPED, 'Nothing to report.'
            else:
                log.channel, log.address, log.error = deliver(
                    text, subject, '' if role == OWNER else mobile, email, session)
                log.status = (DailySummaryLog.STATUS_SENT if log.channel
                              else DailySummaryLog.STATUS_FAILED)
        except Exception as exc:  # noqa: BLE001 - one person's failure is not the next person's
            logger.exception("daily summary for user %s in %s failed", user.pk, tenant.schema_name)
            log.status, log.error = DailySummaryLog.STATUS_FAILED, str(exc)
        if dedup:
            log.save(update_fields=['status', 'channel', 'address', 'error', 'attempts', 'updated_at'])
        else:
            logger.info("daily summary (test) %s -> %s %s %s", name, log.status, log.channel, log.error)
        counts[log.status] = counts.get(log.status, 0) + 1
    return counts


def run(now=None, ignore_window=False, schema=None, dedup=True):
    """Every active boutique that is due: [(schema, counts or the exception)]."""
    from tenants.models import BoutiqueTenant

    now = now or timezone.now()
    # The signup template is a registry row too, and is not a boutique.
    tenants = (BoutiqueTenant.objects.filter(is_active=True)
               .exclude(schema_name__in=(get_public_schema_name(), settings.TENANT_BASE_SCHEMA)))
    if schema:
        tenants = tenants.filter(schema_name=schema)
    results = []
    for tenant in tenants:
        if not ignore_window and not due(tenant, now):
            continue
        try:
            # tenant_context, not schema_context: the owner and role lookups
            # read connection.tenant.owner_email, which a bare schema lacks.
            with tenant_context(tenant):
                timezone.activate(tenant_timezone(tenant))
                try:
                    results.append((tenant.schema_name, send_for_tenant(tenant, now, dedup)))
                finally:
                    timezone.deactivate()
        except Exception as exc:  # noqa: BLE001 - one boutique's failure is not the others'
            logger.exception("daily summaries for %s failed", tenant.schema_name)
            results.append((tenant.schema_name, exc))
    return results
