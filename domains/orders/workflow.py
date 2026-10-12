"""The order workflow as a state machine, rather than a pile of special cases.

Every rule about what an order may do next used to live as an `if stage_key ==`
block inside transition_order_stage -- five of them, each guarding one stage
somebody had been burned by. Everything nobody had been burned by yet was
allowed. So `POST /transition/ {"stage_key": "ready_for_delivery",
"status": "COMPLETED"}` from an order sitting in pattern cutting returned 200
and moved the customer's tracking page to "Ready for Dispatch", with stitching,
finishing, pressing and quality check all still NOT_STARTED.

Hiding the buttons does not fix that. The rule has to live where the request
lands.

ONE SOURCE OF ORDERING
======================
BoutiqueSettings.workflow_config is already an ordered list, so position in it
*is* the order. Nothing here stores an `allowed_next_stages` beside it: two
declarations of the same fact drift, and the drift is silent.

WHAT `optional` MEANS
=====================
`optional: true` says *this stage may not apply to this order* -- most garments
have no maggam work. It is the only thing that licenses a SKIPPED status.

It does NOT mean "anyone may jump over this stage". Those are different ideas,
and collapsing them recreates the bug: a workflow where every stage can be
skipped at will is a workflow with no order at all. A non-optional stage cannot
be skipped, and must be COMPLETED before anything after it starts.

GOING BACKWARDS
===============
A COMPLETED stage stays completed -- through transition_order_stage. The two
sanctioned ways back both live here, and both are explicit and audited:

* check_reopen / OrderService.reopen_order_stage: a supervisor (Owner or
  Master) undoes a mistaken completion, with a mandatory reason. Only the
  FRONTIER settled stage can be reopened -- the latest one with nothing
  started after it -- so the record rolls back one honest step at a time
  instead of leaving completed work stranded on top of a reopened hole.

* OrderService.fail_quality_check: the one legitimate loop in tailoring.
  QC rejecting a garment is not a rollback, it is a transition of its own:
  the stitching band reopens for rework, the reason lands in the record,
  and the customer-facing status drops to match what is now true.

Anything else that moves a settled stage backwards is still refused.

PER-GARMENT STAGES
==================
A stage declared `scope: garment` has one OrderStage row per garment job on
the order (the saree's Cutting, the blouse's Cutting), so an order's stage
list carries several rows with the same key. Every rule here reasons about a
ROW, scoped to its garment: the blouse's Stitching needs the blouse's Cutting
done, not the saree's. An order-level stage (Trial, Delivery) needs every
garment's earlier work done. `rollup` folds the rows back to one status per
key for readers that only care where the order as a whole stands.
"""


from core.permissions import SUPERVISOR_ROLES
from core.roles import DESIGNER, MASTER


def holds_stage_role(role, allowed_roles):
    """Whether `role` may act on a stage that lists `allowed_roles`.

    A Designer ranks above the Master (core.roles.ASSIGNMENT_RANK), so a stage
    open to the Master -- trial, payment, delivery -- is open to them too.
    Nobody else gains anything: every other role still has to be listed.
    """
    return role in allowed_roles or (role == DESIGNER and MASTER in allowed_roles)

VALID_STATUSES = ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'PAUSED',
                  'PENDING_VERIFICATION')

SETTLED_STATUSES = ('COMPLETED', 'SKIPPED')

ENTERING_STATUSES = ('IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'PAUSED',
                     'PENDING_VERIFICATION')


class TransitionError(ValueError):
    pass


def _requires_measurements(order, stage, *, supervisor):

    from domains.orders.services import (
        customer_has_measurements, order_needs_measurements)
    
    if order.customer_id is None:
        return None
    if customer_has_measurements(order.customer):
        return None

    jobs = list(order.garment_jobs.all())
    
    if any(job.measurements for job in jobs):
        return None
    
    if jobs and not order_needs_measurements(order):
        return None
    return 'Measurements are not completed for this customer.'


def _requires_a_tailor(order, stage, *, supervisor):
   
    if supervisor or order.tailor_id or stage.assigned_to_id:
        return None
    return 'No tailor is assigned to this order.'



REQUIRED_DATA = {
    'stitching_in_progress': (_requires_measurements, _requires_a_tailor),
}


def ordered_stages(config):

    return [s for s in (config or []) if s.get('key')]


def is_per_garment(config, stage_key):
    return any(s['key'] == stage_key and s.get('scope') == 'garment'
               for s in ordered_stages(config))


def rollup(order):
    """One status per stage key across all of its rows: COMPLETED or SKIPPED
    once every row is settled, IN_PROGRESS while any row has begun, else
    NOT_STARTED. The order-level view of a per-garment stage."""
    rows = {}
    for key, status in order.stages.values_list('stage_key', 'status'):
        rows.setdefault(key, []).append(status)
    out = {}
    for key, statuses in rows.items():
        if all(st in SETTLED_STATUSES for st in statuses):
            out[key] = 'COMPLETED' if 'COMPLETED' in statuses else 'SKIPPED'
        elif any(st != 'NOT_STARTED' for st in statuses):
            out[key] = 'IN_PROGRESS'
        else:
            out[key] = 'NOT_STARTED'
    return out


def outstanding_before(order, config, stage_key, garment_job_id=None):
    """The prerequisite stages of `stage_key` that are not settled, as seen
    from one row: for a garment's row, its own garment's earlier rows plus the
    order-level ones; for an order-level row, every earlier row on the order."""
    earlier = {s['key']: s for s in prerequisites(config, stage_key)}
    rows = order.stages.filter(stage_key__in=earlier).exclude(status__in=SETTLED_STATUSES)
    if garment_job_id is not None:
        from django.db.models import Q
        rows = rows.filter(Q(garment_job_id=garment_job_id) | Q(garment_job__isnull=True))
    seen, out = set(), []
    for key in rows.values_list('stage_key', flat=True):
        if key not in seen:
            seen.add(key)
            out.append(earlier[key])
    return sorted(out, key=lambda s: stage_position(config, s['key']))



ALTERATION_STAGES = ('created', 'alteration_work', 'master_quality_check',
                     'ready_for_delivery', 'payment', 'delivered')


def stages_for_flow(config, flow):
    """The stages an order on `flow` is built from. A stage that names no
    `flows` is on every path; 'legacy' is the whole list, as it always was.
    The alteration path is the short list above, in the configured order."""
    if flow == 'legacy':
        # The whole line as it always was -- the alteration step came later
        # and was never on it.
        return [s for s in ordered_stages(config) if s.get('flows') != ['alteration']]
    if flow == 'alteration':
        return [s for s in ordered_stages(config) if s['key'] in ALTERATION_STAGES]
    return [s for s in ordered_stages(config)
            if not s.get('flows') or flow in s['flows']]


def for_order(config, order):
    """The boutique's workflow as it applies to this one order: only the
    stages the order actually has, in the configured order. Everything that
    reasons about prerequisites or "what comes next" reads this, so a plain
    stitching order is never blocked on an embroidery stage it does not carry.

    A legacy order keeps maggam work optional -- that is the rule it was
    placed under, and its rows may already say SKIPPED."""
    # In the order's own sequence, not the config's: a legacy order was
    # built when maggam sat after cutting, and its rows still say so.
    declared = {s['key']: s for s in ordered_stages(config)}
    out, seen = [], set()
    for key in order.stages.order_by('sequence').values_list('stage_key', flat=True):
        s = declared.get(key)
        if s is None or key in seen:
            continue
        seen.add(key)
        if getattr(order, 'flow', 'legacy') == 'legacy' and key == 'maggam_work':
            s = {**s, 'optional': True}
        out.append(s)
    return out


def stage_position(config, stage_key):

    for index, stage in enumerate(ordered_stages(config)):
        if stage['key'] == stage_key:
            return index
    return None


def is_optional(config, stage_key):
    for stage in ordered_stages(config):
        if stage['key'] == stage_key:
            return bool(stage.get('optional'))
    return False


def prerequisites(config, stage_key):
    position = stage_position(config, stage_key)
    if position is None:
        return []
    return [s for s in ordered_stages(config)[:position] if not s.get('optional')]


def check_transition(order, stage, new_status, *, config, role, owner_role):
    stage_key = stage.stage_key
    label = stage.stage_name or stage_key

    if new_status not in VALID_STATUSES:
        raise TransitionError(f'Invalid stage status "{new_status}"')

    declared = next(
        (s for s in ordered_stages(config) if s['key'] == stage_key), None)
    if declared is None:
        raise TransitionError(
            f'"{stage_key}" is not a stage in this boutique\'s workflow.')

    allowed_roles = declared.get('roles', [])
    
    verifying = stage.status == 'PENDING_VERIFICATION' and (role == owner_role or role in SUPERVISOR_ROLES)
    if role != owner_role and allowed_roles and not holds_stage_role(role, allowed_roles) and not verifying:
        raise TransitionError(f'Role {role} is not authorized to update {label}')


    if stage.status in SETTLED_STATUSES and new_status not in SETTLED_STATUSES:
        raise TransitionError(
            f'{label} is already {stage.status.lower()}. Moving a settled '
            f'stage backwards needs a supervisor: use Reopen Stage (or Fail '
            f'QC for rework), which records who and why.')

    if new_status == 'SKIPPED' and not declared.get('optional'):
        raise TransitionError(
            f'{label} is a required stage and cannot be skipped.')

    if new_status in ENTERING_STATUSES:
        outstanding = outstanding_before(order, config, stage_key, stage.garment_job_id)
        if outstanding:
            names = ', '.join(s.get('name', s['key']) for s in outstanding)
            raise TransitionError(
                f'Cannot move to {label} yet: {names} '
                f'{"is" if len(outstanding) == 1 else "are"} not completed.')

    if new_status in ('IN_PROGRESS', 'COMPLETED', 'PENDING_VERIFICATION'):
        for validator in REQUIRED_DATA.get(stage_key, ()):
            problem = validator(order, stage,
                                supervisor=role == owner_role or role in SUPERVISOR_ROLES)
            if problem:
                raise TransitionError(f'Cannot move to {label}. {problem}')



REOPEN_ROLES = frozenset({'Master'})


QC_FAIL_ROLES = frozenset({'Master', 'QC Staff'})


def check_reopen(order, stage, *, config, role, owner_role):
    """May this settled stage be reopened, by this caller, right now?

    Raises TransitionError when it may not; PermissionError when the caller's
    role is the problem (the view maps that to 403 rather than 400). Returns
    the keys of later stages that have begun and must be reset with it.
    """
    label = stage.stage_name or stage.stage_key

    if role != owner_role and role not in REOPEN_ROLES:
        raise PermissionError(
            f'Role {role} is not authorized to reopen a completed stage. '
            f'Ask the owner or the Master.')

    if stage.status not in SETTLED_STATUSES:
        raise TransitionError(
            f'{label} is not completed or skipped, so there is nothing to reopen.')

    position = stage_position(config, stage.stage_key)
    if position is None:
        raise TransitionError(
            f'"{stage.stage_key}" is not a stage in this boutique\'s workflow.')

    
    later = order.stages.filter(
        stage_key__in=[s['key'] for s in ordered_stages(config)[position + 1:]]
    ).exclude(status='NOT_STARTED')
    if stage.garment_job_id is not None:
        from django.db.models import Q
        later = later.filter(Q(garment_job_id=stage.garment_job_id) | Q(garment_job__isnull=True))
    begun = set(later.values_list('stage_key', flat=True))
    return [s['key'] for s in ordered_stages(config)[position + 1:] if s['key'] in begun]
