"""
Sign-in attempts: recording them, and the handful of patterns worth waking
someone for. Rules run over the last hour, not since the last guardian tick,
because a credential-stuffing run at four a minute is invisible in any
five-minute slice and obvious in sixty.
"""
import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, schema_context

from tenants.views import _client_ip

from .models import LoginAttempt

logger = logging.getLogger(__name__)

WINDOW = timedelta(hours=1)
IP_FAILURES = 20          # one address, many wrong passwords
ACCOUNT_FAILURES = 10     # one account, many wrong passwords
IP_BOUTIQUES = 3          # one address trying accounts at several boutiques
CONSOLE_FAILURES = 5      # anyone guessing at the platform console


def record(request, kind, username, ok, boutique=''):
    try:
        with schema_context(get_public_schema_name()), transaction.atomic():
            LoginAttempt.objects.create(
                kind=kind, username=(username or '')[:150], boutique=boutique[:63],
                ip=_client_ip(request), ok=ok,
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:300])
    except Exception:
        # Recording must never be the reason a sign-in fails.
        logger.exception('login attempt not recorded: kind=%s user=%r', kind, username)


def suspicious(now=None):
    """[(key, sentence)]. The key is what the guardian remembers so one run
    is reported once, not every five minutes for an hour."""
    now = now or timezone.now()
    failed = LoginAttempt.objects.filter(ok=False, at__gt=now - WINDOW)
    found = []

    by_ip = (failed.exclude(ip=None).values('ip')
             .annotate(n=Count('id'), users=Count('username', distinct=True),
                       shops=Count('boutique', distinct=True)))
    for row in by_ip:
        if row['n'] >= IP_FAILURES:
            found.append((f'ip:{row["ip"]}',
                          f'{row["n"]} failed sign-ins from {row["ip"]} in the last hour '
                          f'across {row["users"]} account(s)'))
        elif row['shops'] >= IP_BOUTIQUES:
            found.append((f'probe:{row["ip"]}',
                          f'{row["ip"]} tried accounts at {row["shops"]} different boutiques'))

    by_user = (failed.filter(kind='login').exclude(username='').values('username', 'boutique')
               .annotate(n=Count('id')).filter(n__gte=ACCOUNT_FAILURES))
    for row in by_user:
        found.append((f'user:{row["boutique"]}:{row["username"]}',
                      f'{row["n"]} wrong passwords for {row["username"]}'
                      + (f' at {row["boutique"]}' if row['boutique'] else '')))

    console = failed.filter(kind='console').count()
    if console >= CONSOLE_FAILURES:
        found.append(('console', f'{console} failed console sign-ins in the last hour'))
    return found


def summary(now=None):
    now = now or timezone.now()
    day = LoginAttempt.objects.filter(at__gt=now - timedelta(days=1))
    return {
        'last_24h': {
            'total': day.count(),
            'failed': day.filter(ok=False).count(),
            'reset_requests': day.filter(kind='reset').count(),
            'distinct_ips': day.exclude(ip=None).values('ip').distinct().count(),
        },
        'suspicious': [text for _, text in suspicious(now)],
        'recent': [
            {'at': a.at, 'kind': a.kind, 'username': a.username, 'boutique': a.boutique,
             'ip': a.ip, 'ok': a.ok, 'user_agent': a.user_agent[:80]}
            for a in LoginAttempt.objects.all()[:200]
        ],
    }
