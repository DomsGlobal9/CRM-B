
import os
import tempfile
import time

from django.conf import settings
from django.db import DEFAULT_DB_ALIAS, connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Count, Q
from django_tenants.utils import get_public_schema_name, schema_context

from tenants.models import BoutiqueTenant

from .metrics import tenant_metrics

SLOW_QUERY_MS = 250
VERY_SLOW_QUERY_MS = 1000


def _boutiques():

    return BoutiqueTenant.objects.exclude(schema_name=get_public_schema_name())


def _database():
    started = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
        cursor.fetchone()
    ms = (time.perf_counter() - started) * 1000

    if ms >= VERY_SLOW_QUERY_MS:
        return 'degraded', f'Answering, but a trivial query took {ms:.0f}ms.'
    if ms >= SLOW_QUERY_MS:
        return 'warning', f'Reachable, {ms:.0f}ms for a trivial query -- slow.'
    return 'healthy', f'Answering, {ms:.0f}ms for a simple query.'


def _migrations():
    executor = MigrationExecutor(connections[DEFAULT_DB_ALIAS])
    shared = {app.rsplit('.', 1)[-1] for app in settings.SHARED_APPS}
    targets = [node for node in executor.loader.graph.leaf_nodes()
               if node[0] in shared]
    plan = executor.migration_plan(targets)

    if not plan:
        return 'healthy', 'The shared part of the database matches the code that is running.'
    names = ', '.join(f'{migration.app_label}.{migration.name}'
                      for migration, _backwards in plan[:5])
    more = f' (+{len(plan) - 5} more)' if len(plan) > 5 else ''
    return 'warning', (f'The code is ahead of the database: {len(plan)} update(s) have not been '
                       f'applied to the shared part ({names}{more}). Run migrate.')


def _tenant_schemas():
    tenants = list(_boutiques())
    if not tenants:
        return 'healthy', 'No boutiques on this platform yet.'

    healthy = sum(1 for tenant in tenants if tenant_metrics(tenant)['healthy'])
    detail = f'{healthy} of {len(tenants)} boutiques have their data in good order.'
    if healthy == len(tenants):
        return 'healthy', detail
    if healthy == 0:
        return 'critical', detail + ' None of them could be read.'
    return 'degraded', detail + ' The rest are missing tables or half set up: those boutiques will see errors.'


def _media_storage():
    if settings.CLOUDINARY_URL:
        return 'healthy', ('Photos and files are kept on Cloudinary, which outlives a '
                           'redeploy. Not probed: that would be an upload.')
    root = str(settings.MEDIA_ROOT)
    ephemeral = ('Photos are saved on this server\'s own disk, which on Render is '
                 'wiped by every deploy. Set CLOUDINARY_URL to keep them.')
    if not os.path.isdir(root):
        return 'warning', f'No uploads folder yet; it is made on the first upload. {ephemeral}'
    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix='.healthcheck-'):
            pass
    except OSError as exc:
        return 'critical', f'The uploads folder cannot be written to: {exc}'
    return 'warning', ephemeral


def _email():
    if not settings.EMAIL_HOST:
        return 'not_configured', (
            'No mail server is set (EMAIL_HOST), so password-reset emails are '
            'not sent: the link is only printed in the server log. Use the '
            'one-time sign-in link on the Staff accounts page instead.')
    return 'healthy', (
        f'Mail goes out through {settings.EMAIL_HOST}. Not probed: a test '
        f'message would land in somebody\'s inbox.')


#: The kinds that mean something went wrong, as opposed to something was
#: refused. A suspended boutique generating refusals all day is the platform
#: working; counting those here would put a permanent number next to the word
#: "unresolved" and teach whoever reads this probe to ignore it.
FAULT_KINDS = ('crash', 'handled', 'frontend')


def _errors():
    from .models import ErrorEvent

    open_events = ErrorEvent.objects.exclude(status__in=('resolved', 'ignored'))
    counts = open_events.filter(kind__in=FAULT_KINDS).aggregate(
        total=Count('id'), critical=Count('id', filter=Q(severity='critical')))
    refusals = open_events.filter(kind='refusal').count()
    aside = (f' {refusals} request(s) were refused by a platform control (suspension, '
             f'switched-off feature); those are listed separately.') if refusals else ''

    if counts['critical']:
        return 'critical', (f'{counts["critical"]} serious error(s) nobody has looked at yet, '
                            f'{counts["total"]} open in total.{aside}')
    return 'healthy', (f'No serious errors waiting. {counts["total"]} '
                       f'minor one(s) open.{aside}')


def _whatsapp():
    from crm_api.models import CustomerMessage

    queued = 0
    unreadable = 0
    for tenant in _boutiques():
        try:
            with schema_context(tenant.schema_name):
                queued += CustomerMessage.objects.filter(status='QUEUED').count()
        except Exception:
            unreadable += 1

    unread_note = (f' {unreadable} boutique(s) could not be read, so the real '
                   f'backlog may be higher.' if unreadable else '')
    backend = getattr(settings, 'CUSTOMER_MESSAGE_BACKEND', '')
    if backend:
        return 'healthy', (f'Customer WhatsApp messages are sent automatically. '
                           f'{queued} waiting to go.{unread_note}')
    return 'not_configured', (
        f'Automatic sending is off: each message is a WhatsApp link the boutique '
        f'opens on their own phone. {queued} message(s) waiting to be sent by hand.'
        f'{unread_note}')


def _payments():
    return 'not_configured', (
        'The product takes no payments itself. What an order shows as paid is '
        'what staff typed in.')


def _background_jobs():
    return 'not_configured', (
        'Nothing runs in the background: every action finishes while the person '
        'waits, so there is no queue to fall behind.')


def _sms():
    return 'not_configured', 'The product does not send SMS.'


def _configuration():
    """Settings that are fine on a laptop and a hole in production."""
    from boutique_crm.settings import _DEV_SECRET_KEY

    findings = []
    if settings.DEBUG:
        findings.append('DEBUG is on: tracebacks and settings are shown to anyone who triggers a 500')
    if settings.SECRET_KEY == _DEV_SECRET_KEY or len(settings.SECRET_KEY) < 32:
        findings.append('DJANGO_SECRET_KEY is the published development key or too short')
    if '*' in settings.ALLOWED_HOSTS:
        findings.append('DJANGO_ALLOWED_HOSTS is *')
    if getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False):
        findings.append('CORS_ALLOWED_ORIGINS is unset, so every origin is allowed')
    if settings.PASSWORD_RESET_BASE_URL.startswith('http://localhost'):
        findings.append('PASSWORD_RESET_BASE_URL points at localhost: reset and sign-in links are dead')
    if settings.INTERNAL_API_SECRET == 'scaleezy_internal_secret_key_2026':
        findings.append('INTERNAL_API_SECRET is the default from settings.py')
    if (getattr(settings, 'CUSTOMER_MESSAGE_BACKEND', '')
            and ('127.0.0.1' in settings.WHATSAPP_SERVICE_URL
                 or 'localhost' in settings.WHATSAPP_SERVICE_URL)):
        findings.append('WHATSAPP_SERVICE_URL is localhost while the WhatsApp backend is on: every customer message fails')

    if not findings:
        return 'healthy', 'Nothing is running on a development default.'
    production = bool(os.environ.get('RENDER'))
    return ('critical' if production else 'warning'), (
        f'{len(findings)} setting(s) still on a development default'
        + ('' if production else ' (this is not the live server, so noted rather than raised)')
        + ': ' + '; '.join(findings) + '.')


def _guardian():
    from . import guardian
    return guardian.check()


def _backups():
    from . import backups
    return backups.check()


_CHECKS = (
    ('database', 'Database', _database),
    ('migrations', 'Database matches the code', _migrations),
    ('tenant_schemas', 'Every boutique\'s data', _tenant_schemas),
    ('media_storage', 'Photo storage', _media_storage),
    ('email', 'Email sending', _email),
    ('errors', 'Open errors', _errors),
    ('whatsapp', 'Customer WhatsApp', _whatsapp),
    ('payments', 'Payments', _payments),
    ('background_jobs', 'Background work', _background_jobs),
    ('sms', 'SMS', _sms),
    ('configuration', 'Live-server settings', _configuration),
    ('guardian', 'Watchdog (WhatsApp alerts)', _guardian),
    ('backups', 'Backups', _backups),
)


def checks():
    results = []
    for key, label, probe in _CHECKS:
        try:
            status, detail = probe()
        except Exception as exc:
            status, detail = 'degraded', f'This check could not run: {exc}'
        results.append({'key': key, 'label': label, 'status': status,
                        'detail': detail})
    return results
