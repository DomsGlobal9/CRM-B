"""Whether a boutique may use the Customer Portal API, and the key it uses.

Two things have to be true for the portal to answer, and this module owns both
so they cannot drift apart:

  1. the `customer_portal` module is entitled for the boutique
     (BoutiqueTenant.enabled_modules), which is what crm_api/portal_views.py
     checks with core.modules.is_enabled; and
  2. there is an ACTIVE tenants.PortalCredential for it.

Enabling sets both, disabling clears both. Either alone is enough to refuse a
request, which is deliberate: a revoked key cannot be rescued by the module
being on, and a key that somehow survives revocation still meets a module gate
that says no.

No second key system. tenants.portal_credentials does the generating, hashing
and comparing; this decides who is allowed to ask for it.
"""

from django.db import transaction

from tenants import portal_credentials
from tenants.middleware import clear_tenant_cache
from tenants.models import PortalCredential

MODULE_KEY = 'customer_portal'


def active_credential(tenant):
    return (PortalCredential.objects
            .filter(tenant=tenant, is_active=True)
            .order_by('-created_at')
            .first())


def _set_module(tenant, enabled):
    """The entitlement half, written the way BoutiqueModulesView writes it.

    An explicit True rather than removing the key: `customer_portal` belongs to
    the CRM product module, so absence already reads as on, and leaving it
    absent would mean a boutique whose access was never granted still passed
    the module gate. Explicit on both sides, so the stored map says what the
    console says.
    """
    overrides = dict(tenant.enabled_modules or {})
    overrides[MODULE_KEY] = bool(enabled)
    type(tenant).objects.filter(pk=tenant.pk).update(enabled_modules=overrides)
    tenant.enabled_modules = overrides
    clear_tenant_cache()


def status(tenant):
    """What the console shows. Never the secret -- it does not exist to show."""
    credential = active_credential(tenant)
    return {
        'enabled': credential is not None,
        'api_key': None,
        'key_id': credential.key_id if credential else None,
        'allowed_origin': credential.allowed_origin if credential else '',
        'created_at': credential.created_at.isoformat() if credential else None,
        'last_used_at': (credential.last_used_at.isoformat()
                         if credential and credential.last_used_at else None),
        'module_enabled': bool((tenant.enabled_modules or {}).get(MODULE_KEY, True)),
    }


@transaction.atomic
def enable(tenant, *, allowed_origin=''):
    """Grant access with a brand-new credential. Returns (status, plaintext).

    Any credential already on the boutique is revoked first, so re-enabling
    never brings an old secret back to life -- somebody who kept a copy from
    before the access was withdrawn gains nothing from it being granted again.
    """
    for row in PortalCredential.objects.filter(tenant=tenant, is_active=True):
        portal_credentials.revoke(row)

    _, value = portal_credentials.issue(
        tenant, label='Customer Portal API', allowed_origin=allowed_origin)
    _set_module(tenant, True)
    return status(tenant), value


@transaction.atomic
def rotate(tenant, *, allowed_origin=None):
    """A new secret on the same credential. Returns (status, plaintext) or None.

    The key_id survives so the console's record of this portal does, while the
    old secret stops working immediately.
    """
    credential = active_credential(tenant)
    if credential is None:
        return None
    value = portal_credentials.rotate(credential, allowed_origin=allowed_origin)
    _set_module(tenant, True)
    return status(tenant), value


@transaction.atomic
def revoke(tenant):
    """Withdraw access. Every live credential dies and the module gate closes."""
    for row in PortalCredential.objects.filter(tenant=tenant, is_active=True):
        portal_credentials.revoke(row)
    _set_module(tenant, False)
    return status(tenant)
