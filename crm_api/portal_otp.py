"""The WhatsApp one-time code behind the customer portal, and its rate limits.

Everything here lives in Redis, and FAILS CLOSED. Django's cache is not
configured in this project, so it falls back to per-process LocMemCache --
LoginThrottle already documents what that costs ("the effective ceiling is the
rate times WEB_CONCURRENCY"). A limit one worker enforces and the next does not
is not a limit, and a code one worker remembers and the next does not is worse
than no code at all. So if Redis is unreachable the portal refuses to verify
anybody rather than quietly becoming an open door.

The plaintext code is never stored and never logged: Redis holds a peppered
hash of it, which is enough to check an answer and useless for producing one.
"""

import hashlib
import hmac
import logging
import secrets

from django.conf import settings

logger = logging.getLogger(__name__)

CODE_DIGITS = 6

#: Seconds a code stays usable.
TTL = 300
#: Wrong answers allowed against one code before it is destroyed.
MAX_ATTEMPTS = 5
#: Seconds between sends to the same mobile, so "resend" cannot be a loop.
RESEND_COOLDOWN = 60

#: (limit, window seconds), each counted separately so one noisy caller cannot
#: consume another's allowance. Generous enough that a customer who mistypes
#: their number twice and waits for a slow message is never locked out.
PER_MOBILE = (5, 3600)
PER_IP = (20, 3600)
PER_BOUTIQUE = (300, 3600)
PER_CREDENTIAL = (300, 3600)


def _setting(name, default):
    return getattr(settings, f'PORTAL_OTP_{name}', default)


class RedisUnavailable(RuntimeError):
    """Redis could not be reached, so nothing here can be trusted."""


def _client():
    from apps.email_service.services.redis_service import get_redis_client
    try:
        return get_redis_client()
    except Exception as exc:  # noqa: BLE001 - not configured, or unreachable
        raise RedisUnavailable(str(exc)) from exc


def _digest(value):
    """Peppered with SECRET_KEY, so a Redis dump yields no usable codes."""
    return hmac.new(
        settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def _otp_key(schema_name, mobile):
    # The mobile is hashed into the key as well: Redis keys turn up in
    # dashboards and slow-log output, and a customer's number is not something
    # to leave lying there.
    return f'portal:otp:{schema_name}:{_digest(mobile)[:32]}'


def _rate_key(bucket, schema_name, subject):
    return f'portal:rate:{bucket}:{schema_name}:{_digest(str(subject))[:32]}'


def new_code():
    """A cryptographically secure six digits.

    secrets, not random: random is seeded predictably enough that observing a
    few codes narrows the next one, and this is the only thing standing between
    a stranger and a customer's address.
    """
    upper = 10 ** CODE_DIGITS
    return str(secrets.randbelow(upper)).zfill(CODE_DIGITS)


def _incr(client, key, window):
    try:
        count = client.incr(key)
        if count == 1:
            client.expire(key, window)
        return int(count)
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc


def check_limits(*, schema_name, mobile, ip, credential_id):
    """Count this attempt against every bucket. False once any is spent.

    Counted before the code is sent, and deliberately not refunded when a send
    fails: a caller who can make sending fail would otherwise have an
    unlimited allowance.
    """
    client = _client()
    buckets = [
        ('mobile', mobile, _setting('PER_MOBILE', PER_MOBILE)),
        ('ip', ip or 'unknown', _setting('PER_IP', PER_IP)),
        ('boutique', schema_name, _setting('PER_BOUTIQUE', PER_BOUTIQUE)),
    ]
    if credential_id:
        buckets.append(('cred', credential_id, _setting('PER_CREDENTIAL', PER_CREDENTIAL)))

    allowed = True
    for bucket, subject, (limit, window) in buckets:
        count = _incr(client, _rate_key(bucket, schema_name, subject), window)
        if count > limit:
            # Every bucket is still counted, so a caller cannot discover which
            # one they tripped by varying one input at a time.
            allowed = False
    return allowed


def cooling_down(schema_name, mobile):
    client = _client()
    try:
        return client.get(f'{_otp_key(schema_name, mobile)}:cooldown') is not None
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc


def issue(schema_name, mobile):
    """Replace any live code for this mobile with a fresh one. Returns the code.

    The old code is overwritten rather than left to expire, so a second request
    cannot leave two valid codes in the air -- which would double an
    attacker's guesses per send.
    """
    client = _client()
    code = new_code()
    key = _otp_key(schema_name, mobile)
    ttl = int(_setting('TTL', TTL))
    try:
        client.set(key, f'{_digest(code)}:0', ex=ttl)
        client.set(f'{key}:cooldown', '1', ex=int(_setting('RESEND_COOLDOWN', RESEND_COOLDOWN)))
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc
    return code


def verify(schema_name, mobile, code):
    """True once, for the right code. Destroys the code either way it ends.

    Wrong answers are counted, and the code is destroyed at the limit rather
    than left for the next guess. A correct answer deletes it too, so it cannot
    be replayed -- which matters because the reply to a correct answer is a
    token that reads a customer's details.
    """
    client = _client()
    key = _otp_key(schema_name, mobile)
    try:
        stored = client.get(key)
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc

    if not stored:
        return False

    digest, _, attempts = str(stored).partition(':')
    try:
        attempts = int(attempts or 0)
    except ValueError:
        attempts = 0

    max_attempts = int(_setting('MAX_ATTEMPTS', MAX_ATTEMPTS))
    if attempts >= max_attempts:
        client.delete(key)
        return False

    if hmac.compare_digest(digest, _digest(str(code or ''))):
        client.delete(key)
        return True

    attempts += 1
    try:
        if attempts >= max_attempts:
            client.delete(key)
        else:
            # Keeps whatever life the code had left; a wrong guess must not
            # extend it.
            ttl = client.ttl(key)
            client.set(key, f'{digest}:{attempts}',
                       ex=ttl if isinstance(ttl, int) and ttl > 0 else int(_setting('TTL', TTL)))
    except Exception:  # noqa: BLE001 - the answer was already wrong
        logger.warning('portal OTP attempt counter could not be updated')
    return False


def consume_token_id(schema_name, token_id, ttl):
    """Claim a one-time token id. False if it has been claimed already.

    SET NX is the whole mechanism: whichever of two concurrent requests gets
    the key wins, and the other is told the token is spent.
    """
    client = _client()
    try:
        created = client.set(f'portal:jti:{schema_name}:{token_id}', '1',
                             nx=True, ex=int(ttl))
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc
    return bool(created)
