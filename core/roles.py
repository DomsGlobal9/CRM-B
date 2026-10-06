
OWNER = 'Owner'
DESIGNER = 'Designer'
MASTER = 'Master'

#: Who may hand work to whom: Owner above Designer above Master above every
#: other production role. A role not listed here is a worker.
#:
#: Assignment ONLY. Nothing here grants access to an order, a customer or a
#: payment -- core.permissions.SUPERVISOR_ROLES still decides that, and
#: Designer is deliberately absent from it.
ASSIGNMENT_RANK = {OWNER: 0, DESIGNER: 1, MASTER: 2}
WORKER_RANK = 3


def assignment_rank(role):
    if not role:
        return None
    return ASSIGNMENT_RANK.get(role, WORKER_RANK)


def assigns_work(role):
    """Whether this role may hand work to anybody at all."""
    rank = assignment_rank(role)
    return rank is not None and rank < WORKER_RANK


def can_assign(assigner_role, assignee_role):
    """May someone in `assigner_role` hand work to someone in `assignee_role`?

    The one rule every assignment surface asks: your own level or below, never
    above, and workers hand work to nobody.

    "Or below", not "strictly below", on purpose. Eight of the seventeen
    default workflow stages may only be held by a Master, so a Master who could
    not assign a Master would leave half the floor unassignable by the people
    running it. And a design assignment's assignee is always a Designer, so a
    Designer who could not assign a Designer could not hand design work on at
    all. Neither is "assigning upward", which is what the hierarchy forbids.

    An unknown role on either side is a refusal.
    """
    assigner = assignment_rank(assigner_role)
    assignee = assignment_rank(assignee_role)
    if assigner is None or assignee is None or assigner >= WORKER_RANK:
        return False
    return assigner <= assignee


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
