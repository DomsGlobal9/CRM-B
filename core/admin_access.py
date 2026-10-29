"""Work the owner hands to a role.

Everyone keeps their role (Tailor, Master, Designer ...). On top of it the
owner ticks, per role, the extra work everyone in that role may do
(BoutiqueSettings.admin_access = {"roles": {role: [task, ...]}}). This module
is the catalogue of that work and the one place that answers "is this request
covered by a task the caller was handed?" -- for the permission classes
(ACTION_TASKS), the row filters (visible_orders / visible_customers) and the
login payload.

A task only ever ADDS to what the role already allows; nothing here can take
access away, so an empty or malformed setting changes nothing.

The setting used to name ONE person as Admin ({"member": ..., "tasks": ...}).
That shape grants nothing now. It is deliberately not converted onto the
person's role: that would hand one person's extra work to everyone sharing
their job title. The owner re-ticks it on the role instead, and the screen
says who held it (previous_admin in crm_api.views).
"""
from .roles import MASTER, OWNER

# Must match frontend/src/features/staff/RolePermissions.jsx (SECTIONS), in
# the same order: one section per screen of the owner's app.
ADMIN_TASKS = {
    'dashboard': ('view',),
    'orders': ('create', 'edit', 'stage', 'delivery_date', 'payments', 'discounts',
               'invoices', 'notify', 'deliver', 'cancel'),
    'workshop': ('assign', 'reassign', 'move', 'materials', 'review', 'quality',
                 'alterations', 'track'),
    'customers': ('add', 'edit', 'measurements', 'leads', 'history', 'message',
                  'import', 'delete'),
    'design': ('view', 'upload', 'approve', 'boards', 'assign'),
    'inventory': ('view', 'items', 'stock', 'transfer', 'suppliers', 'reports'),
    'team': ('view', 'manage', 'attendance', 'documents', 'reviews', 'todos', 'payroll'),
    'finance': ('view', 'expenses'),
    'invoices': ('view', 'template'),
    'analytics': ('view',),
    'settings': ('edit',),
}
ALL_TASKS = frozenset(f'{section}.{task}' for section, tasks in ADMIN_TASKS.items() for task in tasks)


def _section(name):
    return tuple(f'{name}.{task}' for task in ADMIN_TASKS[name])


#: The modules a section's work lives in. Holding any task in the section opens
#: these at the module gate (core.permissions.ModuleAccess) and in the login
#: payload's module list, so the screen and its reads load. What may be WRITTEN
#: is still ACTION_TASKS below; opening a module only stops the gate refusing.
#: A module the boutique is not entitled to stays shut: the middleware decides
#: entitlement before any of this runs.
SECTION_MODULES = {
    'design': ('design_studio', 'design_collections', 'design_designers'),
    'inventory': ('inventory', 'inventory_catalog', 'inventory_suppliers',
                  'inventory_bom', 'inventory_reports'),
    'team': ('tailors', 'staff', 'staff_attendance', 'staff_documents', 'staff_reviews', 'todos'),
    'finance': ('finance', 'finance_pl'),
}
#: A task that opens more than its section does.
TASK_MODULES = {
    'team.payroll': ('payroll',),
}

#: Never handed to anyone, whatever ACTION_TASKS says: who-may-do-what itself,
#: and other people's sign-in. Handing these over would let a role grant itself
#: everything, or sign in as somebody else.
NEVER_DELEGATED = frozenset({
    ('boutique-settings', 'admin_access'),
    ('boutique-settings', 'role_modules'),
    ('designer', 'create_login'),
    ('designer', 'reset_password'),
    ('tailor', 'reset_password'),
})

# (router basename, view action) -> the tasks, any one of which opens it.
# A plain APIView has no basename or action, so it is keyed by
# (class name, HTTP method) instead.
# Only what a role does not already have needs listing: RolePermission lets
# every staff member read, and the row filters in core.permissions widen what
# they read when they hold the matching section.
_EDIT_ORDER = ('orders.edit', 'orders.delivery_date', 'orders.discounts')
_ASSIGN = ('workshop.assign', 'workshop.reassign')
_DESIGN_BOARDS = ('design.boards',)
_INVENTORY_ANY = _section('inventory')
_TEAM_ANY = _section('team')
_FINANCE_ANY = _section('finance')


def _each(basename, actions, tasks):
    return {(basename, action): tasks for action in actions}


_CRUD_WRITES = ('create', 'update', 'partial_update', 'destroy')

ACTION_TASKS = {
    # ---- Orders --------------------------------------------------------------
    ('order', 'create'): ('orders.create',),
    ('order', 'update'): _EDIT_ORDER,
    ('order', 'partial_update'): _EDIT_ORDER,
    ('order', 'customer_messages'): ('orders.notify',),
    ('order', 'mark_message_sent'): ('orders.notify',),
    ('order', 'retry_message'): ('orders.notify',),
    ('order', 'send_invoice'): ('orders.invoices',),
    # An order is placed through its draft.
    ('order-draft', 'create'): ('orders.create',),
    ('order-draft', 'partial_update'): ('orders.create',),
    ('order-draft', 'destroy'): ('orders.create',),
    ('order-draft', 'confirm'): ('orders.create',),
    ('finance-payment', 'list'): ('orders.payments',) + _FINANCE_ANY,
    ('finance-payment', 'retrieve'): ('orders.payments',) + _FINANCE_ANY,
    ('finance-payment', 'create'): ('orders.payments',),

    # ---- Workshop ------------------------------------------------------------
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
    **_each('material-plan', ('plan', 'reserve', 'release_unused', 'consume', 'gather',
                              'line_photo', 'deduct_packaging', 'close', 'cancel', 'reconcile'),
            ('workshop.materials',)),

    # ---- Customers -----------------------------------------------------------
    ('customer', 'create'): ('customers.add',),
    ('customer', 'update'): ('customers.edit', 'customers.measurements', 'customers.leads'),
    ('customer', 'partial_update'): ('customers.edit', 'customers.measurements', 'customers.leads'),
    ('customer', 'referrals'): ('customers.edit',),
    ('customer', 'save_design_preferences'): ('customers.edit',),
    ('customer', 'approve_design'): ('customers.edit',),
    ('customer', 'import_customers'): ('customers.import',),
    ('customer', 'destroy'): ('customers.delete',),
    ('customer', 'delete_all'): ('customers.delete',),

    # ---- Design Studio -------------------------------------------------------
    **_each('design-asset', ('update', 'partial_update', 'destroy'), ('design.upload',)),
    **_each('boutique-design', _CRUD_WRITES + ('upload_image',), ('design.upload',)),
    ('design-asset', 'review'): ('design.approve',),
    **_each('design-board', _CRUD_WRITES + ('add_item', 'remove_item', 'select_item',
                                            'customise_item', 'save_to_order', 'approve',
                                            'production_notes'), _DESIGN_BOARDS),
    **_each('collection', _CRUD_WRITES, _DESIGN_BOARDS),
    **_each('design-assignment', _CRUD_WRITES + ('review',), ('design.assign',)),

    # ---- Inventory -----------------------------------------------------------
    **_each('inventory-item', ('list', 'retrieve', 'options_metadata', 'summary',
                               'locations', 'movements'), _INVENTORY_ANY),
    **_each('inventory-item', _CRUD_WRITES + ('upload_images',), ('inventory.items',)),
    **_each('unit-conversion', _CRUD_WRITES, ('inventory.items',)),
    **_each('bom', _CRUD_WRITES + ('new_version',), ('inventory.items',)),
    **_each('bom-line', _CRUD_WRITES, ('inventory.items',)),
    **_each('inventory-item', ('stock_in', 'goods_receipt', 'issue', 'adjust', 'consume',
                               'return_material', 'reserve', 'release', 'damage', 'scrap',
                               'waste', 'customer_return', 'supplier_return'),
            ('inventory.stock',)),
    **_each('customer-material', _CRUD_WRITES + ('damage', 'return_to_customer', 'use'),
            ('inventory.stock',)),
    **_each('order-purchase', _CRUD_WRITES + ('cancel', 'purchased', 'received', 'use'),
            ('inventory.stock',)),
    ('inventory-item', 'transfer'): ('inventory.transfer',),
    **_each('stock-location', _CRUD_WRITES, ('inventory.transfer',)),
    **_each('supplier', ('list', 'retrieve') + _CRUD_WRITES, ('inventory.suppliers',)),
    **_each('purchase-order', ('list', 'retrieve', 'receive') + _CRUD_WRITES,
            ('inventory.suppliers',)),
    **_each('inventory-report', ('consumption', 'cost_per_order', 'dashboard', 'loss_rates',
                                 'low_stock', 'movement_summary', 'movements', 'order_usage',
                                 'stock_position', 'suppliers'), ('inventory.reports',)),

    # ---- Team ----------------------------------------------------------------
    **_each('tailor', _CRUD_WRITES, ('team.manage',)),
    **_each('staff-profile', _CRUD_WRITES, ('team.manage',)),
    **_each('designer', _CRUD_WRITES, ('team.manage',)),
    **_each('staff-attendance', ('record', 'correct'), ('team.attendance',)),
    **_each('staff-day-mark', ('list', 'retrieve') + _CRUD_WRITES, ('team.attendance',)),
    **_each('staff-document', _CRUD_WRITES, ('team.documents',)),
    **_each('staff-review', _CRUD_WRITES + ('finalise',), ('team.reviews',)),
    **_each('payroll-period', ('list', 'retrieve', 'generate', 'approve'), ('team.payroll',)),
    ('payroll-record', 'payout'): ('team.payroll',),
    **_each('payroll-deposit', ('list', 'retrieve'), ('team.payroll',)),
    **_each('payroll-advance', _CRUD_WRITES + ('cancel',), ('team.payroll',)),

    # ---- Finance -------------------------------------------------------------
    ('ProfitLossView', 'GET'): _FINANCE_ANY,
    ('TrendView', 'GET'): _FINANCE_ANY,
    **_each('expense', ('list', 'retrieve'), _FINANCE_ANY),
    **_each('expense', _CRUD_WRITES, ('finance.expenses',)),

    # ---- Invoices ------------------------------------------------------------
    ('InvoiceTemplateView', 'GET'): ('invoices.template',),
    ('InvoiceTemplateView', 'PATCH'): ('invoices.template',),

    # ---- Settings ------------------------------------------------------------
    ('boutique-settings', 'create'): ('settings.edit',),
    ('boutique-settings', 'tier_names'): ('settings.edit',),
}


def assignable_roles():
    """Every role the owner can hand work to: all of them but the Owner, who
    already has everything."""
    from .modules import ALL_ROLES
    return tuple(role for role in ALL_ROLES if role != OWNER)


def clean_admin_access(payload):
    """The owner's PUT body, checked. Raises ValueError with what is wrong.

    PUT replaces the whole map, so a role left out of it is handed nothing.
    """
    if not isinstance(payload, dict) or not isinstance(payload.get('roles', {}), dict):
        raise ValueError('Send {"roles": {"<role>": ["<task>", ...]}}.')
    allowed = assignable_roles()
    cleaned = {}
    for role, tasks in payload.get('roles', {}).items():
        if role not in allowed:
            raise ValueError(f'Unknown role: {role}.')
        if not isinstance(tasks, list) or not all(isinstance(t, str) for t in tasks):
            raise ValueError(f'Tasks for {role} must be a list of task names.')
        unknown = sorted(set(tasks) - ALL_TASKS)
        if unknown:
            raise ValueError(f'Unknown task: {", ".join(unknown)}.')
        if tasks:
            cleaned[role] = sorted(set(tasks))
    return {'roles': cleaned}


def role_tasks(access):
    """{role: [task, ...]} from a stored setting, ignoring anything malformed."""
    roles = access.get('roles') if isinstance(access, dict) else None
    if not isinstance(roles, dict):
        return {}
    return {role: sorted(t for t in tasks if isinstance(t, str) and t in ALL_TASKS)
            for role, tasks in roles.items() if isinstance(tasks, list)}


def _stored():
    from crm_api.models import BoutiqueSettings
    try:
        value = BoutiqueSettings.objects.values_list('admin_access', flat=True).filter(id=1).first()
    except Exception:   # no tenant schema (management commands, public schema)
        value = None
    return value if isinstance(value, dict) else {}


def tasks_for(user, access=None):
    """The tasks handed to this user's role: a frozenset, empty for the Owner
    (who needs none) and for an account no role claims."""
    from .roles import resolve_user_role
    role = resolve_user_role(user)
    if role is None or role == OWNER:
        return frozenset()
    access = _stored() if access is None else access
    return frozenset(role_tasks(access).get(role, ()))


def request_tasks(request):
    """tasks_for(request.user), read once per request (permission classes ask repeatedly)."""
    cached = getattr(request, '_admin_tasks', None)
    if cached is None:
        cached = tasks_for(request.user)
        request._admin_tasks = cached
    return cached


def action_key(request, view):
    """How ACTION_TASKS names this request: (basename, action) on a viewset,
    (class name, HTTP method) on a plain APIView."""
    basename = getattr(view, 'basename', None)
    if basename:
        return (basename, getattr(view, 'action', None))
    return (type(view).__name__, request.method)


def admin_may(request, view):
    """Whether one of the caller's handed tasks opens this view action."""
    key = action_key(request, view)
    if key in NEVER_DELEGATED:
        return False
    wanted = ACTION_TASKS.get(key)
    return bool(wanted) and bool(request_tasks(request) & set(wanted))


def holds(user, *tasks):
    """The owner, or someone whose role was handed any of these tasks."""
    from .roles import resolve_user_role
    if resolve_user_role(user) == OWNER:
        return True
    return bool(tasks_for(user) & set(tasks))


def modules_opened(tasks):
    """The modules these handed tasks open (SECTION_MODULES, TASK_MODULES)."""
    opened = set()
    for task in tasks:
        opened.update(SECTION_MODULES.get(task.split('.', 1)[0], ()))
        opened.update(TASK_MODULES.get(task, ()))
    return opened


def has_section(tasks, *sections):
    return any(t.split('.', 1)[0] in sections for t in tasks)


def assigner_role(role, tasks):
    """The role an assignment is judged as. An Admin handed assigning work
    assigns as a Master would, however junior their own role."""
    from .roles import assigns_work
    if not assigns_work(role) and set(tasks) & {'workshop.assign', 'workshop.reassign'}:
        return MASTER
    return role
