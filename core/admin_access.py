"""The boutique's Admin: one staff member the owner hands chosen work to.

Everyone keeps their role (Tailor, Master, Designer ...). On top of it the
owner may pick ONE person as Admin and tick, per section, the work that
person may do (BoutiqueSettings.admin_access). This module is the catalogue
of that work and the one place that answers "is this request covered by a
task the caller was handed?" -- for the permission classes (ACTION_TASKS),
the row filters (visible_orders / visible_customers) and the login payload.

A task only ever ADDS to what the role already allows; nothing here can take
access away, so an empty or malformed setting changes nothing.
"""
from .roles import MASTER

# Must match frontend/src/features/staff/RolePermissions.jsx (SECTIONS).
ADMIN_TASKS = {
    'orders': ('create', 'edit', 'stage', 'delivery_date', 'payments', 'discounts',
               'invoices', 'notify', 'deliver', 'cancel'),
    'workshop': ('assign', 'reassign', 'move', 'materials', 'review', 'quality',
                 'alterations', 'track'),
    'customers': ('add', 'edit', 'measurements', 'leads', 'history', 'message',
                  'import', 'delete'),
}
ALL_TASKS = frozenset(f'{section}.{task}' for section, tasks in ADMIN_TASKS.items() for task in tasks)

# (router basename, view action) -> the tasks, any one of which opens it.
# Only writes need listing: every staff member already reads (RolePermission),
# and the row filters below widen what they read to the whole book.
_EDIT_ORDER = ('orders.edit', 'orders.delivery_date', 'orders.discounts')
_ASSIGN = ('workshop.assign', 'workshop.reassign')
ACTION_TASKS = {
    ('order', 'create'): ('orders.create',),
    ('order', 'update'): _EDIT_ORDER,
    ('order', 'partial_update'): _EDIT_ORDER,
    ('order', 'customer_messages'): ('orders.notify',),
    ('order', 'mark_message_sent'): ('orders.notify',),
    ('order', 'retry_message'): ('orders.notify',),
    ('order', 'assignable_staff'): _ASSIGN,
    ('order', 'assign_stage'): _ASSIGN,
    ('order', 'send_to_workshop'): _ASSIGN + ('workshop.move',),
    ('order', 'set_flow'): ('workshop.move',),
    ('order', 'review_photo'): ('workshop.review',),
    ('order', 'master_verification'): ('workshop.review',),
    ('order', 'stage_seen'): ('workshop.review',),
    ('order', 'upload_garment_image'): ('workshop.quality',),
    ('order', 'delete_garment_image'): ('workshop.quality',),
    ('order', 'publish_garment_images'): ('workshop.quality',),
    ('order', 'create_alteration'): ('workshop.alterations',),
    ('order', 'outside_alteration'): ('workshop.alterations',),
    # An order is placed through its draft.
    ('order-draft', 'create'): ('orders.create',),
    ('order-draft', 'partial_update'): ('orders.create',),
    ('order-draft', 'destroy'): ('orders.create',),
    ('order-draft', 'confirm'): ('orders.create',),
    ('finance-payment', 'list'): ('orders.payments',),
    ('finance-payment', 'retrieve'): ('orders.payments',),
    ('finance-payment', 'create'): ('orders.payments',),
    ('customer', 'create'): ('customers.add',),
    ('customer', 'update'): ('customers.edit', 'customers.measurements', 'customers.leads'),
    ('customer', 'partial_update'): ('customers.edit', 'customers.measurements', 'customers.leads'),
    ('customer', 'referrals'): ('customers.edit',),
    ('customer', 'save_design_preferences'): ('customers.edit',),
    ('customer', 'approve_design'): ('customers.edit',),
    ('customer', 'import_customers'): ('customers.import',),
    ('customer', 'destroy'): ('customers.delete',),
    ('customer', 'delete_all'): ('customers.delete',),
}


def clean_admin_access(payload):
    """The owner's PUT body, checked. Raises ValueError with what is wrong."""
    if not isinstance(payload, dict):
        raise ValueError('Send {"member": ..., "tasks": [...]}.')
    member = payload.get('member')
    if member is not None:
        # A staff id is a number, a designer's a UUID; both are kept as text.
        member_id = member.get('id') if isinstance(member, dict) else None
        if (not isinstance(member, dict) or member.get('kind') not in ('staff', 'designer')
                or isinstance(member_id, bool) or not isinstance(member_id, (int, str))
                or not str(member_id).strip()):
            raise ValueError('member must be null or {"kind": "staff" | "designer", "id": ...}.')
        member = {'kind': member['kind'], 'id': str(member_id).strip()}
    tasks = payload.get('tasks', [])
    if not isinstance(tasks, list) or not all(isinstance(t, str) for t in tasks):
        raise ValueError('tasks must be a list of task names.')
    unknown = sorted(set(tasks) - ALL_TASKS)
    if unknown:
        raise ValueError(f'Unknown task: {", ".join(unknown)}.')
    return {'member': member, 'tasks': sorted(set(tasks))}


def _stored():
    from crm_api.models import BoutiqueSettings
    try:
        value = BoutiqueSettings.objects.values_list('admin_access', flat=True).filter(id=1).first()
    except Exception:   # no tenant schema (management commands, public schema)
        value = None
    return value if isinstance(value, dict) else {}


def is_member(user, member):
    """Whether `user` is the staff member or designer `member` names."""
    if not isinstance(member, dict) or not getattr(user, 'is_authenticated', False):
        return False
    profile = getattr(user, 'tailor_profile' if member.get('kind') == 'staff' else 'designer_profile', None)
    return profile is not None and str(profile.pk) == str(member.get('id'))


def tasks_for(user, access=None):
    """The tasks this user was handed: a frozenset, empty unless they are the Admin."""
    access = _stored() if access is None else access
    if not is_member(user, access.get('member')):
        return frozenset()
    return frozenset(t for t in access.get('tasks') or () if t in ALL_TASKS)


def request_tasks(request):
    """tasks_for(request.user), read once per request (permission classes ask repeatedly)."""
    cached = getattr(request, '_admin_tasks', None)
    if cached is None:
        cached = tasks_for(request.user)
        request._admin_tasks = cached
    return cached


def admin_may(request, view):
    """Whether one of the caller's handed tasks opens this view action."""
    wanted = ACTION_TASKS.get((getattr(view, 'basename', None), getattr(view, 'action', None)))
    return bool(wanted) and bool(request_tasks(request) & set(wanted))


def has_section(tasks, *sections):
    return any(t.split('.', 1)[0] in sections for t in tasks)


def assigner_role(role, tasks):
    """The role an assignment is judged as. An Admin handed assigning work
    assigns as a Master would, however junior their own role."""
    from .roles import assigns_work
    if not assigns_work(role) and set(tasks) & {'workshop.assign', 'workshop.reassign'}:
        return MASTER
    return role
