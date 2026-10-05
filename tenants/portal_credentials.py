"""Issuing and checking a customer portal's credential.

The value handed to a portal is `<key_id>.<secret>`. Only the hash of the
secret is stored, so a leak of the registry table does not hand anybody a
working credential -- and the secret is shown exactly once, at creation.

Read tenants.models.PortalCredential before using this: for a browser portal
the value is public by construction, so this identifies a caller and must
never be the thing that authorises reading a customer.
"""

import hashlib
import hmac
import secrets

from django.conf import settings
from django.utils import timezone

from .models import PortalCredential

KEY_ID_BYTES = 8
SECRET_BYTES = 24


def _hash(secret):
    """SECRET_KEY as the pepper, so the stored hash is useless off this server.

    sha256 rather than a password hasher on purpose: this is a 192-bit random
    value, not a human-chosen password, so there is nothing to slow an attacker
    down about -- there is no dictionary to walk. A per-request password hash
    would only cost every portal call the same work.
    """
    return hmac.new(
        settings.SECRET_KEY.encode(), secret.encode(), hashlib.sha256
    ).hexdigest()


def issue(tenant, *, label='', allowed_origin=''):
    """Create a credential and return (row, value). The value is never recoverable."""
    key_id = secrets.token_hex(KEY_ID_BYTES)
    secret = secrets.token_urlsafe(SECRET_BYTES)
    row = PortalCredential.objects.create(
        tenant=tenant, label=label, key_id=key_id,
        secret_hash=_hash(secret), allowed_origin=allowed_origin,
    )
    return row, f'{key_id}.{secret}'


def rotate(row, *, allowed_origin=None):
    """A new secret on the same row, so revoking is not the only way to change it."""
    secret = secrets.token_urlsafe(SECRET_BYTES)
    row.secret_hash = _hash(secret)
    row.is_active = True
    row.revoked_at = None
    if allowed_origin is not None:
        row.allowed_origin = allowed_origin
    row.save(update_fields=['secret_hash', 'is_active', 'revoked_at', 'allowed_origin'])
    return f'{row.key_id}.{secret}'


def revoke(row):
    row.is_active = False
    row.revoked_at = timezone.now()
    row.save(update_fields=['is_active', 'revoked_at'])


def resolve(value, tenant):
    """The active credential `value` names, but only if it belongs to `tenant`.

    Returns None for anything else -- malformed, unknown, revoked, or issued to
    a different boutique. One return value for every failure on purpose: the
    caller answers them all identically, so a probe cannot tell a revoked
    credential from a wrong one, nor learn that some other boutique owns it.

    Never logs, raises with, or echoes `value`.
    """
    if not value or '.' not in value:
        return None
    key_id, _, secret = value.partition('.')
    if not key_id or not secret:
        return None

    row = (PortalCredential.objects
           .select_related('tenant')
           .filter(key_id=key_id, is_active=True)
           .first())
    if row is None:
        return None
    # compare_digest, so a wrong secret takes the same time whatever it shares
    # with the right one.
    if not hmac.compare_digest(row.secret_hash, _hash(secret)):
        return None
    # The whole point of the model: a credential names one boutique, and the
    # slug in the URL names one boutique. If they disagree, somebody is
    # replaying boutique A's portal against boutique B.
    if row.tenant_id != tenant.pk:
        return None
    return row


def touch(row):
    """Record use without failing the request if the write does not land."""
    try:
        PortalCredential.objects.filter(pk=row.pk).update(last_used_at=timezone.now())
    except Exception:  # noqa: BLE001 - a bookkeeping write never fails a portal call
        pass
