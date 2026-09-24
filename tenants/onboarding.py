"""Creating a boutique: the one place it happens.

Public self-signup is closed. A boutique is created when a platform
administrator approves an access request in the console
(superadmin.api_views.LeadApproveView), which calls create_boutique() with a
temporary password. The owner must replace that password at first sign-in
(BoutiqueTenant.owner_password_temporary, enforced by core.authentication).

This used to live inline in crm_api.auth_views.SignupView. It moved here so
the console, the tests and the smoke journeys all provision a boutique the
same way.
"""

import secrets
import uuid

from django.contrib.auth.models import User
from django.db import connection, transaction
from django.utils.text import slugify

from core.modules import DEFAULT_PLAN

from .models import BoutiqueTenant, Domain
from .provision import provision_tenant


class BoutiqueExists(Exception):
    """The owner email already owns a boutique. owner_email is unique platform-wide."""


#: No 0/O, 1/l/I: the password is read off an email or a phone screen and
#: typed by hand, and a misread character is a locked-out first day.
_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
_PASSWORD_LENGTH = 12


def generate_temporary_password():
    """Twelve unambiguous characters with at least one letter and one digit.

    ~70 bits of entropy, and never all-numeric, so it always passes the
    project's AUTH_PASSWORD_VALIDATORS (NumericPasswordValidator,
    MinimumLengthValidator).
    """
    while True:
        password = ''.join(secrets.choice(_PASSWORD_ALPHABET)
                           for _ in range(_PASSWORD_LENGTH))
        if any(c.isdigit() for c in password) and any(c.isalpha() for c in password):
            return password


def schema_name_for(email):
    """A Postgres-safe, collision-proof schema name derived from the owner email."""
    base = slugify(email).replace('-', '_')[:50].strip('_') or 'boutique'
    if not base[0].isalpha():
        base = f"b_{base}"[:50]
    return f"{base}_{uuid.uuid4().hex[:8]}"


def create_boutique(*, email, first_name, last_name, password,
                    business_name='', phone='', address='',
                    plan=DEFAULT_PLAN, temporary_password=False,
                    customer_messaging_enabled=True):
    """Provision a boutique, its settings row and its owner account.

    Inputs must already be validated (core.validators); `email` must be
    lower-case. Runs in one transaction: if any step fails, no tenant row, no
    schema and no user is left behind. Always returns with the connection on
    the public schema.

    Returns (tenant, owner_user). Raises BoutiqueExists if the email already
    owns a boutique.
    """
    email = email.strip().lower()
    name = business_name or f"{first_name}'s Boutique"

    try:
        with transaction.atomic():
            connection.set_schema_to_public()
            if BoutiqueTenant.objects.filter(owner_email__iexact=email).exists():
                raise BoutiqueExists(email)

            schema_name = schema_name_for(email)
            tenant = provision_tenant(
                schema_name=schema_name,
                owner_email=email,
                name=name,
                plan=plan,
                owner_password_temporary=temporary_password,
            )
            Domain.objects.create(domain=f"{schema_name}.localhost",
                                  tenant=tenant, is_primary=True)

            from tenants.middleware import clear_tenant_cache
            clear_tenant_cache()

            connection.set_tenant(tenant)

            from crm_api.utils import seed_tenant_defaults
            seed_tenant_defaults(demo=False)

            from crm_api.models import BoutiqueSettings
            BoutiqueSettings.objects.update_or_create(
                id=1,
                defaults={
                    'name': name,
                    'email': email,
                    'customer_messaging_enabled': customer_messaging_enabled,
                    **({'phone': phone} if phone else {}),
                    **({'address': address} if address else {}),
                },
            )

            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )
    finally:
        connection.set_schema_to_public()

    return tenant, user
