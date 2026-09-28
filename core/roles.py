
OWNER = 'Owner'
DESIGNER = 'Designer'

#: Roles that come from what an account is, not from a staff row's free text.
RESERVED_ROLE_NAMES = frozenset({OWNER.lower(), DESIGNER.lower()})


def resolve_user_role(user):
    if user is None or not getattr(user, 'is_authenticated', False):
        return None

    if user.is_superuser:
        return OWNER
    try:
        from django.db import connection
        tenant_owner = getattr(connection.tenant, 'owner_email', '') or ''
        if tenant_owner and (user.email or '').lower() == tenant_owner.lower():
            return OWNER
    except Exception:
        pass

    profile = getattr(user, 'tailor_profile', None)
    if profile:
        # A staff row's role is free text. Owner and Designer are established
        # above and below from what the account IS, never from a word someone
        # typed: a roster entry saved as "Owner" (a partner, a spouse) used to
        # resolve to the boutique owner and open payroll, finance and deletes.
        # Such a row is a custom role like any other, and custom roles get the
        # floor defaults (core.modules.role_allows).
        if (profile.role or '').strip().lower() in RESERVED_ROLE_NAMES:
            return f'{profile.role.strip()} (staff)'
        return profile.role
    designer_profile = getattr(user, 'designer_profile', None)
    if designer_profile:
        return DESIGNER

    # Nothing claims this account, so it gets NOTHING.
    #
    # This answered OWNER until Phase 8, which made deleting a staff member an
    # act of promotion: Tailor.user is SET_NULL, so removing somebody from the
    # roster left their User with no profile of any kind, and their existing
    # token -- password unchanged, never revoked -- resolved to boutique owner
    # on the next request. Payroll, deposits, advances and payouts all opened.
    # Firing someone was the exploit.
    #
    # A MISSING PROFILE IS NOT PROOF OF OWNERSHIP. Owner is established
    # positively above, from BoutiqueTenant.owner_email -- the address signup
    # writes onto both the tenant and the owner's User, unique across the
    # platform, and the same field LoginView already trusts to find a boutique.
    # An account that matches nothing is unknown, and every permission class in
    # core.permissions denies on None. Denial is the safe answer; ownership is
    # not something to infer from an absence.
    #
    # The reason this was deferred through Phases 1-7 was recorded here as
    # "TenantTestCase builds ONE tenant for the whole run". That is not true of
    # this version: setUpClass constructs a fresh tenant and calls the class's
    # own setup_tenant before saving, and tearDownClass drops it. Each class
    # gets its own owner_email, so the positive check above fires for each.
    return None
