"""The proof a customer portal holds that one mobile number was verified.

Same mechanism as the customer tracking link (domains/orders/tracking.py): a
signed payload, its own salt, nothing secret inside it. A signed token is
readable by whoever holds it, so it carries the three facts needed to decide
what it may reach -- which boutique, which mobile, what for -- and no customer
data whatsoever.
"""

import secrets

from django.core import signing

SALT = 'crm.customer-portal'

PURPOSE_PROFILE = 'customer_portal_profile'

#: Long enough to read a form and fill it in, short enough that a token left in
#: a browser history or a proxy log is worthless by the time anybody finds it.
MAX_AGE = 900


def issue(schema_name, mobile, purpose=PURPOSE_PROFILE):
    return signing.dumps(
        {'s': schema_name, 'm': mobile, 'p': purpose, 'j': secrets.token_hex(8)},
        salt=SALT,
    )


def read(token, *, schema_name, purpose=PURPOSE_PROFILE, max_age=None):
    """The payload, or None.

    None for every failure -- tampered, expired, wrong purpose, or minted for
    another boutique. The schema is checked HERE rather than by the caller, so
    a token from boutique A presented at boutique B's URL cannot be read at
    all, let alone acted on.
    """
    try:
        payload = signing.loads(
            token, salt=SALT, max_age=max_age if max_age is not None else MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get('p') != purpose:
        return None
    if payload.get('s') != schema_name:
        return None
    if not payload.get('m') or not payload.get('j'):
        return None
    return payload


def bearer(request):
    """The token out of `Authorization: Bearer <token>`, or ''."""
    header = request.META.get('HTTP_AUTHORIZATION', '')
    prefix = 'Bearer '
    return header[len(prefix):].strip() if header.startswith(prefix) else ''
