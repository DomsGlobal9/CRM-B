"""
The guardian: what watches this platform when nobody has the console open.

Everything else in superadmin runs when an administrator asks. This runs from
a cron (`manage.py guardian`, every few minutes) and speaks up only when
something changed: a request crashed since the last tick, a health check
turned bad, or one recovered. Nothing changed, nothing sent -- with one
exception, a single "all quiet" line each morning, so that a guardian that
has silently died is not mistaken for a platform with nothing to report.

State lives in one PlatformSetting row so the console's health page can show
when it last ran and what it last said.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from . import health, signins
from .models import ErrorEvent, PlatformSetting

logger = logging.getLogger(__name__)

STATE_KEY = 'guardian'
BAD = {'critical', 'offline', 'degraded'}
HEARTBEAT_HOUR = 9  # local server time
MAX_MESSAGE = 1500  # WhatsApp is happy with more; a phone screen is not


def state():
    row = PlatformSetting.objects.filter(key=STATE_KEY).first()
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def _save(new):
    PlatformSetting.objects.update_or_create(
        key=STATE_KEY, defaults={'value': new, 'updated_by': 'guardian',
                                 'description': 'Written by manage.py guardian. Not edited by hand.'})


def send_whatsapp(text):
    """Return None on success, else the reason it did not go."""
    from crm_api.whatsapp_service import send_whatsapp_message
    number = settings.GUARDIAN_WHATSAPP_NUMBER
    if not number:
        return 'GUARDIAN_WHATSAPP_NUMBER is not set.'
    res = send_whatsapp_message(phone=number, message_text=text,
                                session_id=settings.GUARDIAN_WHATSAPP_SESSION)
    if res.get('success'):
        return None
    return str(res.get('error') or res.get('data') or res.get('status_code') or 'unknown')


def _crash_lines(since):
    qs = ErrorEvent.objects.filter(kind='crash', status='new')
    if since:
        qs = qs.filter(last_seen__gt=since)
    lines = []
    for e in qs.order_by('-last_seen')[:5]:
        where = f' — {e.boutique}' if e.boutique else ''
        times = f' (x{e.count})' if e.count > 1 else ''
        lines.append(f'• {e.exception_type} at {e.method} {e.path}{where}{times}')
    total = qs.count()
    if total > 5:
        lines.append(f'• …and {total - 5} more')
    return total, lines


def compose(now, previous, checks):
    """Return (message or None, new_state). Pure: nothing sent, nothing saved."""
    since = previous.get('last_run')
    since = timezone.datetime.fromisoformat(since) if since else None
    bad_now = {c['key']: c for c in checks if c['status'] in BAD}
    bad_before = set(previous.get('bad_checks', []))

    crashes, crash_lines = _crash_lines(since)
    turned_bad = [bad_now[k] for k in bad_now if k not in bad_before]
    recovered = [k for k in bad_before if k not in bad_now]

    # Sign-in patterns are judged over an hour, so remember what was already
    # said and say it again only once that hour has passed.
    cutoff = (now - signins.WINDOW).isoformat()
    said = {k: t for k, t in previous.get('signins_said', {}).items() if t > cutoff}
    attacks = [(k, text) for k, text in signins.suspicious(now) if k not in said]
    said.update({k: now.isoformat() for k, _ in attacks})

    parts = []
    if crashes:
        parts.append(f'Crashed requests since last check ({crashes}):\n' + '\n'.join(crash_lines))
    if attacks:
        parts.append('Sign-in attacks:\n' + '\n'.join(f'• {text}' for _, text in attacks))
    if turned_bad:
        parts.append('Turned bad:\n' + '\n'.join(
            f'• {c["label"]}: {c["status"]} — {c["detail"]}' for c in turned_bad))
    if recovered:
        parts.append('Recovered: ' + ', '.join(sorted(recovered)))

    today = now.date().isoformat()
    heartbeat_due = previous.get('heartbeat_date') != today and now.hour >= HEARTBEAT_HOUR
    message = None
    if parts:
        message = '⚠️ Scaleezy guardian\n' + '\n\n'.join(parts)
    elif heartbeat_due:
        still_bad = ', '.join(sorted(bad_now)) or 'none'
        message = f'✅ Scaleezy guardian: all quiet overnight. Checks still bad: {still_bad}.'
    if message and len(message) > MAX_MESSAGE:
        message = message[:MAX_MESSAGE - 1] + '…'

    new = {**previous, 'last_run': now.isoformat(), 'bad_checks': sorted(bad_now),
           'signins_said': said}
    if heartbeat_due and message:
        new['heartbeat_date'] = today
    return message, new


def run(send=send_whatsapp, now=None):
    """One tick. Returns the message sent (or None) and the send error (or None)."""
    now = now or timezone.localtime()
    previous = state()
    message, new = compose(now, previous, health.checks())
    error = None
    if message:
        error = send(message)
        if error:
            logger.error('guardian: alert not delivered: %s', error)
            new['last_send_error'] = error
        else:
            new.pop('last_send_error', None)
            new['last_alert_at'] = now.isoformat()
            new['last_alert'] = message
    _save(new)
    return message, error


def check():
    """The guardian's own line on the health page: is the cron alive?"""
    s = state()
    if not settings.GUARDIAN_WHATSAPP_NUMBER:
        return 'not_configured', (
            'GUARDIAN_WHATSAPP_NUMBER is not set, so nothing is watching when '
            'this page is closed. Set it, and run `manage.py guardian` from a '
            'cron every few minutes.')
    if not s.get('last_run'):
        return 'degraded', ('Never run. Add a cron that runs `manage.py guardian` '
                            f'every {settings.GUARDIAN_INTERVAL_MINUTES} minutes.')
    last = timezone.datetime.fromisoformat(s['last_run'])
    age = timezone.localtime() - last
    limit = timedelta(minutes=settings.GUARDIAN_INTERVAL_MINUTES * 3)
    minutes = int(age.total_seconds() // 60)
    if age > limit:
        return 'degraded', (f'Last ran {minutes} min ago; the cron has stopped '
                            f'or the command is failing. Alerts are not going out.')
    if s.get('last_send_error'):
        return 'critical', (f'Running, but the last alert could not be sent: '
                            f'{s["last_send_error"]}')
    when = s.get('last_alert_at', '')[:16].replace('T', ' ')
    return 'healthy', (f'Ran {minutes} min ago. ' +
                       (f'Last alert {when}.' if when else 'No alert sent yet.'))
