import datetime
import secrets
from django.db import models, transaction
from core.permissions import SUPERVISOR_ROLES
from core.roles import OWNER, resolve_user_role
from crm_api.models import Order, OrderStage, OrderActivity, Tailor, BoutiqueSettings
from core.formatting import format_money
from domains.orders.notifications import create_order_notifications
from domains.orders import workflow


def _generate_order_id():
    today = datetime.date.today().strftime('%y%m%d')
    for _ in range(20):
        candidate = f"T2B-{today}-{secrets.randbelow(9000) + 1000}"
        if not Order.objects.filter(order_id=candidate).exists():
            return candidate
    return f"T2B-{today}-{secrets.token_hex(4)}"


def _next_order_number():
    """#1, #2, #3... per boutique.

    Serialised on the BoutiqueSettings singleton, which the create path already
    reads inside the same transaction, so two counters placing orders at once
    cannot draw the same number. Schema-per-tenant makes the count per boutique
    without any tenant column.
    """
    # ponytail: row lock on the settings singleton; a Postgres sequence if
    # order creation ever becomes a hot path.
    BoutiqueSettings.objects.select_for_update().get_or_create(id=1)
    highest = Order.objects.aggregate(n=models.Max('order_number'))['n'] or 0
    return highest + 1


_SETTLED_ORDER_STATUSES = ('Shipped', 'Delivered')


def _jsonable(value):
    from decimal import Decimal
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def refresh_staff_availability(*staff):
    for person in staff:
        if person is None:
            continue

        live = Order.objects.exclude(order_status__in=_SETTLED_ORDER_STATUSES)
        # Any garment still on the machine keeps the tailor busy.
        unfinished = OrderStage.objects.filter(
            stage_key='stitching_in_progress',
        ).exclude(status__in=workflow.SETTLED_STATUSES).values('order_id')
        stitching = live.filter(tailor=person, pk__in=unfinished).exists()
        supervising = live.filter(master=person).exists()

        wanted = 'Busy' if (stitching or supervising) else 'Available'
        if person.status != wanted:
            person.status = wanted
            person.save(update_fields=['status'])


def order_needs_measurements(order):
    """Whether any dress on this order actually asks for a measurement.

    A saree is draped, not fitted. Its whole measurements section is two
    petticoat fields, both hidden unless a petticoat was ordered -- so a
    saree-only order has nowhere to record a measurement, and demanding one
    before a tailor could be assigned deadlocked it permanently: the form never
    asked, so the answer could never be given.

    Asked of the TEMPLATE rather than hardcoding 'saree', and through the same
    visible_when rules the order form renders with. A garment whose measurement
    fields are all conditional is not a special case to be listed here; it is
    simply a garment that, for this spec, asks nothing.
    """
    from core.templates import is_visible

    for job in order.garment_jobs.select_related('template').all():
        section = job.template.sections.filter(key='measurements').first()
        if section is None:
            continue
        spec = job.spec or {}
        if any(is_visible(field, spec) for field in section.fields.all()):
            return True
    return False


def apply_advance(order, advance):
    """Set the payment fields from what was actually collected.

    Runs after the total is final (garment pricing can rewrite it), which is
    why create_order_for_customer is handed a neutral status by callers that
    price per garment.
    """
    total = float(order.total_amount or 0)
    paid = min(max(float(advance or 0), 0.0), total)
    if paid <= 0:
        order.payment_status = 'Pending'
    elif paid >= total:
        order.payment_status = 'Paid'
    else:
        order.payment_status = 'Partially Paid'
    order.advance_paid = order.amount_paid = paid
    order.save(update_fields=['payment_status', 'advance_paid', 'amount_paid'])
    return order


def customer_has_measurements(customer):
    columns = getattr(customer, 'measurements', None)
    if columns and (columns.bust or columns.waist or columns.hips):
        return True
    from apps.catalog.models import GarmentJob
    return GarmentJob.objects.filter(
        order__customer=customer).exclude(measurements={}).exists()


def stage_row(order, stage_key, garment_job=None):
    """The one OrderStage row a request means. A per-garment stage on an
    order with several garments has several rows, so the caller must say
    which garment; with one row the key alone is enough."""
    rows = order.stages.filter(stage_key=stage_key)
    job_id = getattr(garment_job, 'id', garment_job)
    if job_id not in (None, ''):
        rows = rows.filter(garment_job_id=job_id)
    rows = list(rows[:2])
    if not rows:
        raise ValueError(f'Unknown stage "{stage_key}" for order {order.order_id}')
    if len(rows) > 1:
        raise ValueError(
            f'{rows[0].stage_name} is tracked per garment on this order: say which garment.')
    return rows[0]


def ensure_garment_stages(order):
    """Give every per-garment stage one row (and one task) per garment job.

    Stages are written when the order is, before its garment jobs exist, as
    one row each. Once the jobs are in -- or when one is added later -- this
    splits each workroom stage into a row per garment, carrying over whatever
    the single row already said. An order with no garment jobs keeps its
    single rows. Idempotent.
    """
    from apps.production.models import ProductionTask
    config = BoutiqueSettings.objects.get_or_create(id=1)[0].workflow_config
    jobs = list(order.garment_jobs.select_related('template').order_by('sequence', 'created_at'))
    if not jobs:
        return
    for s_conf in workflow.stages_for_flow(config, order.flow):
        if s_conf.get('scope') != 'garment':
            continue
        key = s_conf['key']
        rows = list(OrderStage.objects.filter(order=order, stage_key=key))
        if not rows:
            continue
        placeholder = next((r for r in rows if r.garment_job_id is None), None)
        seed = placeholder or rows[0]
        task_seed = ProductionTask.objects.filter(
            order=order, stage_key=key, garment_job__isnull=True).first()
        have = {r.garment_job_id for r in rows}
        for job in jobs:
            if job.id in have:
                continue
            OrderStage.objects.create(
                order=order, garment_job=job, stage_key=key, stage_name=seed.stage_name,
                status=placeholder.status if placeholder else 'NOT_STARTED',
                started_at=placeholder.started_at if placeholder else None,
                completed_at=placeholder.completed_at if placeholder else None,
                duration_seconds=placeholder.duration_seconds if placeholder else 0,
                assigned_to=placeholder.assigned_to if placeholder else None,
                performed_by=placeholder.performed_by if placeholder else None,
                comments=placeholder.comments if placeholder else None,
                sequence=seed.sequence, sla_hours=seed.sla_hours)
            ProductionTask.objects.create(
                order=order, garment_job=job, stage_key=key,
                title=f"{seed.stage_name} · {job.template.name}",
                assigned_to=task_seed.assigned_to if task_seed else (order.master or order.tailor),
                status=task_seed.status if task_seed else 'PENDING',
                priority=task_seed.priority if task_seed else 'MEDIUM',
                sequence=task_seed.sequence if task_seed else seed.sequence + 1)
        if placeholder is not None:
            ProductionTask.objects.filter(
                order=order, stage_key=key, garment_job__isnull=True).delete()
            placeholder.delete()


class OrderService:
    @staticmethod
    @transaction.atomic
    def create_order_for_customer(customer, data, user=None, notify=True):
        tailor_id = data.get('tailor_id')
        tailor = Tailor.objects.filter(id=tailor_id).first() if tailor_id else None
        if tailor_id and tailor is None:
            raise ValueError(f'No staff member with id {tailor_id}.')

        master_id = data.get('master_id')
        master = Tailor.objects.filter(id=master_id).first() if master_id else None
        if master_id and master is None:
            raise ValueError(f'No master with id {master_id}.')

        def safe_float(val, default=0.0):
            try:
                return float(val) if val not in (None, '') else default
            except (ValueError, TypeError):
                return default

        base_price = safe_float(data.get('base_price', 0.0))
        fabric_price = safe_float(data.get('fabric_price', 0.0))
        embroidery_price = safe_float(data.get('embroidery_price', 0.0))
        customization_price = safe_float(data.get('customization_price', 0.0))
        tailoring_charges = safe_float(data.get('tailoring_charges', 0.0))
        packaging_handling = safe_float(data.get('packaging_handling', 0.0))

        discount = safe_float(data.get('discount', 0.0))

        components = {
            'base_price': base_price, 'fabric_price': fabric_price,
            'embroidery_price': embroidery_price,
            'customization_price': customization_price,
            'tailoring_charges': tailoring_charges,
            'packaging_handling': packaging_handling,
            'discount': discount,
        }
        for field, value in components.items():
            if value < 0:
                raise ValueError(f'{field} cannot be negative.')
        del components['discount'], components['packaging_handling']

        from . import pricing
        _, taxes_dec, total_dec = pricing.totals_from_amounts(
            {k: pricing.to_money(v) for k, v in components.items()},
            pricing.to_money(packaging_handling),
            pricing.to_money(discount))
        taxes = float(taxes_dec)
        total_amount = float(total_dec)

        order_id = _generate_order_id()
        order_number = _next_order_number()
        requested_delivery = data.get('estimated_delivery')
        if isinstance(requested_delivery, str):
            try:
                requested_delivery = datetime.date.fromisoformat(requested_delivery)
            except ValueError:
                requested_delivery = None
        est_delivery = requested_delivery or (
            datetime.date.today() + datetime.timedelta(days=15))

        payment_status = data.get('payment_status', 'Paid')
        advance_paid = 0.0
        amount_paid = 0.0
        if payment_status == 'Paid':
            advance_paid = total_amount
            amount_paid = total_amount
        elif payment_status == 'Partially Paid':
            advance_paid = min(
                max(safe_float(data.get('advance_paid', 0.0)), 0.0),
                total_amount)
            amount_paid = advance_paid

        config, _ = BoutiqueSettings.objects.get_or_create(id=1)
        boutique_template = getattr(config, 'invoice_template', 'classic') or 'classic'

        order = Order.objects.create(
            order_id=order_id,
            order_number=order_number,
            customer=customer,
            tailor=tailor,
            master=master,
            payment_status=payment_status,
            order_status='Received',
            base_price=base_price,
            fabric_price=fabric_price,
            embroidery_price=embroidery_price,
            customization_price=customization_price,
            tailoring_charges=tailoring_charges,
            packaging_handling=packaging_handling,
            discount=discount,
            taxes=taxes,
            total_amount=total_amount,
            estimated_delivery=est_delivery,
            delivery_method=data.get('delivery_method', 'Direct Pickup'),
            courier_service=data.get('courier_service'),
            tracking_number=data.get('tracking_number'),
            delivery_address=data.get('delivery_address'),
            special_instructions=data.get('custom_requirements') or '',
            advance_paid=advance_paid,
            amount_paid=amount_paid,
            current_stage_key='created',
            production_status='IN_PROGRESS',
            invoice_template=data.get('invoice_template') or boutique_template,
            flow=data.get('flow') if data.get('flow') in ('stitching', 'maggam') else 'stitching',
        )

        workflow_stages = workflow.stages_for_flow(config.workflow_config, order.flow)
        from django.utils import timezone

        stages_to_create = []
        for index, s_conf in enumerate(workflow_stages):
            s_key = s_conf['key']
            s_name = s_conf['name']
            s_status = 'NOT_STARTED'
            started_at = None
            completed_at = None

            if s_key == 'created':
                s_status = 'COMPLETED'
                started_at = timezone.now()
                completed_at = timezone.now()

            stages_to_create.append(OrderStage(
                order=order,
                stage_key=s_key,
                stage_name=s_name,
                status=s_status,
                started_at=started_at,
                completed_at=completed_at,
                sequence=index,
                sla_hours=s_conf.get('sla_hours', 24)
            ))

        OrderStage.objects.bulk_create(stages_to_create)

        from apps.production.models import ProductionTask
        from apps.activities.models import UniversalActivity

        # One task per workroom stage the order has, named for the stage, so
        # a maggam order's task list is the maggam path and a plain one's is
        # not padded with embroidery it will never do.
        tailor_stages = {'stitching_in_progress', 'finishing'}
        tasks_to_create = [
            ProductionTask(
                order=order, title=s_conf['name'], stage_key=s_conf['key'],
                assigned_to=tailor if s_conf['key'] in tailor_stages else (master or tailor),
                sequence=index,
                priority='URGENT' if s_conf['key'] == 'stitching_in_progress'
                         else 'HIGH' if s_conf['key'] in ('pattern_cutting', 'fabric_cutting', 'maggam_work', 'maggam_handwork', 'master_quality_check')
                         else 'MEDIUM')
            for index, s_conf in enumerate(workflow_stages, start=1)
            if s_conf['key'] not in ('created', 'payment', 'delivered')
        ]
        ProductionTask.objects.bulk_create(tasks_to_create)

        creator_user = user if (user and user.is_authenticated) else None
        OrderActivity.objects.create(
            order=order,
            event_type='ORDER_CREATED',
            user=creator_user,
            metadata={"message": f"Order {order.reference} created with initial production tasks."}
        )

        UniversalActivity.objects.create(
            user=creator_user,
            user_name_snapshot=creator_user.get_full_name() or creator_user.username if creator_user else "System",
            module="orders",
            entity_type="Order",
            entity_id=order.order_id,
            action="ORDER_CREATED",
            title=f"New Order {order.reference}",
            description=(f"Order created for client {customer.first_name} "
                         f"{customer.last_name} (Total: {format_money(order.total_amount)})"),
            new_value={"order_id": order.order_id, "total_amount": float(order.total_amount)}
        )

        if notify:
            create_order_notifications(order, created=True)

        refresh_staff_availability(tailor, master)

        return order

    @staticmethod
    def _attach_stage_photos(order, order_stage, files, request=None):
        import uuid
        from django.core.files.storage import default_storage
        from django.core.files.base import ContentFile
        if not files:
            return
        image_urls = list(order_stage.attachments)
        for f in files:
            path = f"stage_attachments/order_{order.id}/{uuid.uuid4()}_{f.name}"
            saved_path = default_storage.save(path, ContentFile(f.read()))
            if request:
                image_urls.append(request.build_absolute_uri(default_storage.url(saved_path)))
            else:
                image_urls.append(default_storage.url(saved_path))
        order_stage.attachments = image_urls

    @staticmethod
    def _voice_sender(user):
        """The name a voice note is shown under: the staff profile's, else the account's."""
        if not (user and getattr(user, 'is_authenticated', False)):
            return ''
        profile = getattr(user, 'tailor_profile', None)
        if profile is not None and profile.name:
            return profile.name
        return user.get_full_name() or user.username

    @staticmethod
    def _stamp_voice(order_stage, voice_note, user):
        """Set or clear the recording and who left it, together."""
        from django.utils import timezone
        order_stage.voice_note = voice_note or ''
        order_stage.voice_note_by = OrderService._voice_sender(user) if voice_note else ''
        order_stage.voice_note_at = timezone.now() if voice_note else None

    @staticmethod
    def _note_stage(order, order_stage, comments, voice_note, user, files=None, request=None):
        """A note on its own: the status stays, something is said.

        This is how the two sides of a stage talk -- the owner leaving a
        spoken correction on work in progress, the tailor answering on a
        stage that is waiting to be verified -- without the status
        side-effects, prerequisite checks and photo rules of a real move.
        The role gate has already run; every note goes into the activity
        thread, and the stage carries the latest one.
        """
        order_stage.comments = comments or ''
        OrderService._stamp_voice(order_stage, voice_note, user)
        OrderService._attach_stage_photos(order, order_stage, files, request)
        order_stage.save(update_fields=['comments', 'voice_note', 'voice_note_by', 'voice_note_at', 'attachments'])
        if voice_note:
            from domains.orders.notifications import notify_voice_note
            notify_voice_note(order, order_stage, user, sender_name=order_stage.voice_note_by)
        OrderActivity.objects.create(
            order=order,
            event_type='STAGE_NOTE',
            user=user if (user and user.is_authenticated) else None,
            metadata={
                "stage_key": order_stage.stage_key,
                "stage_name": order_stage.stage_name,
                "garment_job": str(order_stage.garment_job_id) if order_stage.garment_job_id else None,
                "old_status": order_stage.status,
                "new_status": order_stage.status,
                "comments": comments or '',
                "voice_note": voice_note or '',
            },
        )
        return order

    @staticmethod
    @transaction.atomic
    def transition_order_stage(order, stage_key, new_status, comments='', performer_id=None, user=None, files=None, request=None, voice_note='', clear_voice_note=False, notify=True, garment_job=None):
        from django.utils import timezone

        order_stage = stage_row(order, stage_key, garment_job)

        config, _ = BoutiqueSettings.objects.get_or_create(id=1)
        workflow_stages = workflow.for_order(config.workflow_config, order)

        user_role = resolve_user_role(user)
        if user_role is None:
            raise ValueError('Sign in to update this order.')

        # A note is not a move. `clear_voice_note`: the person deleting a
        # recording they sent -- the text stays; the clip and its sender go.
        # A note with neither text nor clip is otherwise not a note, so the
        # flag says this one is meant. Only the role gate applies: the owner
        # leaving a voice note on a stage nobody has started yet, or one that
        # is skipped, is exactly the point, and the prerequisite and skip rules
        # of a real transition would refuse it.
        if new_status == order_stage.status and (comments or voice_note or clear_voice_note):
            declared = next((s for s in workflow.ordered_stages(workflow_stages) if s['key'] == stage_key), None)
            allowed_roles = declared.get('roles', []) if declared else []
            verifying = order_stage.status == 'PENDING_VERIFICATION' and user_role in ('Owner', 'Master')
            if user_role != OWNER and allowed_roles and user_role not in allowed_roles and not verifying:
                raise workflow.TransitionError(
                    f'Role {user_role} is not authorized to update {order_stage.stage_name or stage_key}')
            return OrderService._note_stage(order, order_stage, comments, voice_note, user, files, request)

        workflow.check_transition(
            order, order_stage, new_status,
            config=workflow_stages,
            role=user_role,
            owner_role=OWNER,
        )

        if order_stage.status == 'COMPLETED' and new_status == 'COMPLETED':
            return order

        # Verification. Anyone below owner/Master does not complete a stage:
        # they submit it, photo attached, and a supervisor completes it. The
        # rule sits here, not in the button, so the API cannot be talked past.
        supervisor = user_role == OWNER or user_role in SUPERVISOR_ROLES
        if not supervisor:
            if new_status == 'COMPLETED':
                new_status = 'PENDING_VERIFICATION'
            if new_status == 'PENDING_VERIFICATION' and not files:
                raise ValueError('Add a photo of the finished work before submitting it for verification.')
            if order_stage.status == 'PENDING_VERIFICATION':
                raise ValueError('This stage is waiting for the owner or Master to verify it.')
        rejected = order_stage.status == 'PENDING_VERIFICATION' and new_status == 'IN_PROGRESS'
        if rejected and not (comments or '').strip():
            raise ValueError('Say what needs to be redone before sending this back.')

        old_status = order_stage.status
        order_stage.status = new_status
        if new_status == 'PENDING_VERIFICATION' and old_status != 'PENDING_VERIFICATION':
            order_stage.verification_seen_by = ''
            order_stage.verification_seen_at = None
        # A new note, spoken or typed, replaces the whole of the old one: a
        # recording left next to text it no longer matches (or the other way
        # round) would mislead the tailor who listens instead of reading. The
        # activity row below keeps every note, so nothing said is lost.
        if comments or voice_note:
            order_stage.comments = comments or ''
            OrderService._stamp_voice(order_stage, voice_note, user)
            if voice_note:
                from domains.orders.notifications import notify_voice_note
                notify_voice_note(order, order_stage, user, sender_name=order_stage.voice_note_by)
        if rejected:
            order_stage.verification_note = comments
        elif new_status == 'PENDING_VERIFICATION':
            order_stage.verification_note = ''
            # A fresh submission replaces what was rejected: those photos
            # come off the stage, the verdicts with them, and the ones that
            # were never faulted stay.
            rejected_urls = {u for u, r in (order_stage.attachment_reviews or {}).items()
                             if r.get('status') == 'REJECTED'}
            order_stage.attachments = [u for u in (order_stage.attachments or [])
                                       if u not in rejected_urls]
            order_stage.attachment_reviews = {}

        # Naming SOMEBODY ELSE as the performer is a supervisor's call.
        #
        # The dropdown that sets this is Owner/Master only in the interface, and
        # the API took the field from anyone: a tailor who could see the order
        # could post performed_by_id and sign a colleague's name to the work
        # they had just done, or to work they had not. Ignored rather than
        # refused, so the ordinary staff path -- which falls through to the
        # branch below and records the caller -- is unaffected.
        #
        # int() first: only DoesNotExist was caught, so a non-numeric id raised
        # out of IntegerField and surfaced as a 500 carrying the raw exception
        # text back to the caller.
        if performer_id and (user_role == OWNER or user_role in SUPERVISOR_ROLES):
            try:
                order_stage.performed_by = Tailor.objects.get(id=int(performer_id))
            except (Tailor.DoesNotExist, TypeError, ValueError):
                pass
        elif old_status == 'PENDING_VERIFICATION':
            pass  # verifying or rejecting is not doing the work: keep the worker's name on it
        elif user and user.is_authenticated and getattr(user, 'tailor_profile', None):
            order_stage.performed_by = user.tailor_profile

        work_started_at = None
        if new_status == 'IN_PROGRESS' and old_status not in ('IN_PROGRESS', 'PENDING_VERIFICATION'):
            order_stage.started_at = work_started_at = timezone.now()
        elif new_status == 'COMPLETED' and old_status != 'COMPLETED':
            if not order_stage.started_at:
                order_stage.started_at = work_started_at = timezone.now()
            order_stage.completed_at = timezone.now()
            delta = order_stage.completed_at - order_stage.started_at
            order_stage.duration_seconds = int(delta.total_seconds())

        OrderService._attach_stage_photos(order, order_stage, files, request)

        order_stage.save()

        # Somebody who starts a task without having checked in gets a
        # session opened from this very stamp (apps.staff.attendance). It
        # never raises: the stage moves whatever attendance thinks.
        if work_started_at is not None and order_stage.performed_by_id:
            from apps.staff import attendance
            attendance.check_in_from_work(
                order_stage.performed_by, user=user, started_at=work_started_at,
                note=f'Auto check-in: started {stage_key} on {order.order_id}')

        from apps.inventory import order_materials
        material_report = order_materials.sync_order_materials(
            order, stage_key, new_status, user=user, garment_job=order_stage.garment_job)

        order.current_stage_key = stage_key
        pending = order.stages.exclude(status__in=['COMPLETED', 'SKIPPED']).exists()
        order.production_status = 'IN_PROGRESS' if pending else 'COMPLETED'

        status_map = {
            'created': 'Received',
            'measurements_completed': 'Confirmed',
            'fabric_confirmed': 'Confirmed',
            'pattern_cutting': 'Design & Creation',
            'paper_cutting': 'Design & Creation',
            'maggam_work': 'Design & Creation',
            'maggam_handwork': 'Design & Creation',
            'maggam_verification': 'Design & Creation',
            'fabric_cutting': 'Design & Creation',
            'stitching_in_progress': 'Quality Check' if new_status == 'COMPLETED' else 'Design & Creation',
            'finishing': 'Quality Check',
            'pressing': 'Quality Check',
            'master_quality_check': 'Ready for Dispatch' if new_status == 'COMPLETED' else 'Quality Check',
            'trial_scheduled': 'Ready for Dispatch',
            'trial_completed': 'Ready for Dispatch',
            'ready_for_delivery': 'Ready for Dispatch',
            'payment': 'Ready for Dispatch',
            'delivered': 'Delivered' if new_status == 'COMPLETED' else order.order_status,
        }
        previous_order_status = order.order_status
        if stage_key in status_map:
            order.order_status = status_map[stage_key]
        order.save()

        from apps.production.models import ProductionTask
        task_status = STAGE_TO_TASK_STATUS.get(new_status)
        task = ProductionTask.objects.filter(
            order=order, stage_key=stage_key, garment_job_id=order_stage.garment_job_id).first()
        if task is not None and task_status:
            task.status = task_status
            fields = ['status']
            performer = order_stage.performed_by
            if performer is not None and task.assigned_to_id != performer.id:
                task.assigned_to = performer
                fields.append('assigned_to')
            task.save(update_fields=fields)

        creator = user if (user and user.is_authenticated) else None
        OrderActivity.objects.create(
            order=order,
            event_type='STAGE_TRANSITION',
            user=creator,
            metadata={
                "stage_key": stage_key,
                "stage_name": order_stage.stage_name,
                "garment_job": str(order_stage.garment_job_id) if order_stage.garment_job_id else None,
                "garment": (order_stage.garment_job.template.name
                            if order_stage.garment_job_id and order_stage.garment_job.template_id else None),
                "old_status": old_status,
                "new_status": new_status,
                "comments": comments,
                "voice_note": voice_note or '',
                **({"materials": _jsonable(material_report)} if material_report else {}),
            }
        )

        if stage_key in ('stitching_in_progress', 'delivered'):
            refresh_staff_availability(order.tailor, order.master)

        from domains.orders.notifications import notify_verification
        if new_status == 'PENDING_VERIFICATION':
            notify_verification(order, order_stage, submitted=True)
        elif rejected:
            notify_verification(order, order_stage, submitted=False)

        # `notify=False` is complete_all's: it walks a dozen stages in one
        # transaction, and the customer should hear "Delivered" once, not
        # every intermediate status in the same second.
        if notify and new_status in ('COMPLETED', 'SKIPPED'):
            create_order_notifications(
                order,
                created=False,
                status_changed=order.order_status != previous_order_status,
                stage_name=order_stage.stage_name,
                stage_key=order_stage.stage_key,
            )
            from domains.orders.notifications import notify_next_stage_owners
            notify_next_stage_owners(order)
        return order


#: ProductionTask has its own vocabulary -- PENDING where a stage says
#: NOT_STARTED, BLOCKED where a stage says PAUSED. One translation, shared by
#: the forward path and both reversals, because a task row that disagrees with
#: its stage row was a real served-endpoint bug once already.
STAGE_TO_TASK_STATUS = {
    'NOT_STARTED': 'PENDING',
    'IN_PROGRESS': 'IN_PROGRESS',
    'COMPLETED': 'COMPLETED',
    'SKIPPED': 'SKIPPED',
    'PAUSED': 'BLOCKED',
    'PENDING_VERIFICATION': 'IN_PROGRESS',
}


def _sync_task_status(order, stage_key, stage_status, garment_job_id=None):
    """Keep the stage's ProductionTask row telling the same story."""
    from apps.production.models import ProductionTask
    task_status = STAGE_TO_TASK_STATUS.get(stage_status)
    if task_status:
        ProductionTask.objects.filter(
            order=order, stage_key=stage_key, garment_job_id=garment_job_id,
        ).update(status=task_status)


#: What each stage says about the customer-facing status once it is settled.
#: Mirrors the map inside transition_order_stage, in its completed sense, so a
#: reversal can recompute order_status from what actually remains settled.
CLIENT_STATUS_WHEN_SETTLED = {
    'created': 'Received',
    'measurements_completed': 'Confirmed',
    'fabric_confirmed': 'Confirmed',
    'pattern_cutting': 'Design & Creation',
    'paper_cutting': 'Design & Creation',
    'maggam_work': 'Design & Creation',
    'maggam_handwork': 'Design & Creation',
    'maggam_verification': 'Design & Creation',
    'fabric_cutting': 'Design & Creation',
    'stitching_in_progress': 'Quality Check',
    'finishing': 'Quality Check',
    'pressing': 'Quality Check',
    'master_quality_check': 'Ready for Dispatch',
    'trial_scheduled': 'Ready for Dispatch',
    'trial_completed': 'Ready for Dispatch',
    'ready_for_delivery': 'Ready for Dispatch',
    'payment': 'Ready for Dispatch',
    'delivered': 'Delivered',
}


def recompute_client_status(order, config):
    """The order_status the settled stages still justify, after a reversal.

    Forward transitions write order_status from the stage just completed.
    A reversal has no "stage just completed" -- what is true is whatever the
    remaining settled stages add up to, so walk them in workflow order and
    keep the last claim standing.
    """
    live = workflow.rollup(order)
    status = 'Received'
    for declared in workflow.ordered_stages(config):
        key = declared['key']
        if live.get(key) in workflow.SETTLED_STATUSES and key in CLIENT_STATUS_WHEN_SETTLED:
            status = CLIENT_STATUS_WHEN_SETTLED[key]
    return status


def _log_reversal(order, event_type, user, metadata):
    OrderActivity.objects.create(
        order=order, event_type=event_type, user=user, metadata=metadata)


def reopen_order_stage(order, stage_key, user, reason, request=None, garment_job=None):
    """A supervisor reverses a settled stage, on the record.

    The mandatory reason is the whole point: the stage history stops being a
    mystery ("why did pressing go backwards on the 14th?") and becomes a
    sentence someone signed. Inventory is deliberately left alone -- material
    consumed by the first attempt was really consumed; rework that needs more
    cloth draws it when the stage completes again.
    """
    reason = (reason or '').strip()
    if not reason:
        raise workflow.TransitionError(
            'A reason is required to reopen a completed stage.')

    try:
        stage = stage_row(order, stage_key, garment_job)
    except ValueError as exc:
        raise workflow.TransitionError(str(exc))

    config = workflow.for_order(
        BoutiqueSettings.objects.get_or_create(id=1)[0].workflow_config, order)
    role = resolve_user_role(user)
    if role is None:
        raise workflow.TransitionError('Sign in to update this order.')

    reset_keys = workflow.check_reopen(
        order, stage, config=config, role=role, owner_role=OWNER)

    with transaction.atomic():
        previous = stage.status
        # COMPLETED work resumes; a SKIPPED stage was never begun, so it goes
        # back to the starting line instead of pretending to be in progress.
        stage.status = 'IN_PROGRESS' if previous == 'COMPLETED' else 'NOT_STARTED'
        stage.completed_at = None
        stage.duration_seconds = 0
        stage.save(update_fields=['status', 'completed_at', 'duration_seconds'])
        _sync_task_status(order, stage_key, stage.status, stage.garment_job_id)

        # Later work goes back to the starting line: it was done on a garment
        # whose earlier state is now unfinished, so it has to be done again.
        # Only this garment's later work, plus the order-level stages after.
        later_rows = order.stages.filter(stage_key__in=reset_keys)
        if stage.garment_job_id is not None:
            later_rows = later_rows.filter(
                models.Q(garment_job_id=stage.garment_job_id) | models.Q(garment_job__isnull=True))
        for later in later_rows:
            later.status = 'NOT_STARTED'
            later.started_at = None
            later.completed_at = None
            later.duration_seconds = 0
            later.save(update_fields=['status', 'started_at', 'completed_at', 'duration_seconds'])
            _sync_task_status(order, later.stage_key, 'NOT_STARTED', later.garment_job_id)

        order.current_stage_key = stage_key
        order.production_status = 'IN_PROGRESS'
        order.order_status = recompute_client_status(order, config)
        order.save(update_fields=['current_stage_key', 'production_status', 'order_status'])

        _log_reversal(order, 'STAGE_REOPENED', user, {
            'stage_key': stage_key,
            'garment_job': str(stage.garment_job_id) if stage.garment_job_id else None,
            'previous_status': previous,
            'reset_stages': reset_keys,
            'reason': reason,
            'role': role,
        })
    return order


def fail_quality_check(order, user, reason, request=None, garment_job=None):
    """QC rejects the garment: the stitching band reopens for rework.

    A first-class transition, not a rollback: the reason is recorded on the QC
    stage and in the activity log, the band (stitching through pressing) goes
    back to work, and the customer-facing status drops to Design & Creation --
    because that is what is now true of the garment.
    """
    reason = (reason or '').strip()
    if not reason:
        raise workflow.TransitionError(
            'A reason is required to fail a quality check -- the tailor doing '
            'the rework needs to know what was wrong.')

    role = resolve_user_role(user)
    if role is None:
        raise workflow.TransitionError('Sign in to update this order.')
    if role != OWNER and role not in workflow.QC_FAIL_ROLES:
        raise PermissionError(
            f'Role {role} is not authorized to fail a quality check.')

    config = workflow.for_order(
        BoutiqueSettings.objects.get_or_create(id=1)[0].workflow_config, order)
    keys = [s['key'] for s in workflow.ordered_stages(config)]
    for needed in ('stitching_in_progress', 'master_quality_check'):
        if needed not in keys:
            raise workflow.TransitionError(
                f'This boutique\'s workflow has no "{needed}" stage, so the '
                f'rework loop does not apply to it.')

    try:
        qc = stage_row(order, 'master_quality_check', garment_job)
    except ValueError as exc:
        raise workflow.TransitionError(str(exc))
    if qc.status == 'COMPLETED':
        raise workflow.TransitionError(
            'This quality check has already passed. Reopen it first if that '
            'was a mistake.')
    stitching_settled = order.stages.filter(
        stage_key='stitching_in_progress', garment_job_id=qc.garment_job_id,
        status__in=workflow.SETTLED_STATUSES).exists()
    if not stitching_settled:
        raise workflow.TransitionError(
            'Stitching has not been completed yet, so there is nothing for '
            'quality check to fail.')

    band = keys[keys.index('stitching_in_progress'):keys.index('master_quality_check')]
    with transaction.atomic():
        # The rework is this garment's: the saree that passed stays passed.
        for stage in order.stages.filter(stage_key__in=band, garment_job_id=qc.garment_job_id):
            if stage.status == 'NOT_STARTED':
                continue
            stage.status = ('IN_PROGRESS'
                            if stage.stage_key == 'stitching_in_progress'
                            else 'NOT_STARTED')
            stage.completed_at = None
            stage.duration_seconds = 0
            stage.save(update_fields=['status', 'completed_at', 'duration_seconds'])
            _sync_task_status(order, stage.stage_key, stage.status, stage.garment_job_id)

        qc.status = 'NOT_STARTED'
        qc.completed_at = None
        qc.duration_seconds = 0
        # The reason reaches the people doing the rework where they already
        # look: on the QC stage row the Master's panel reads.
        qc.comments = (f'QC FAILED: {reason}\n{qc.comments}'.strip()
                       if qc.comments else f'QC FAILED: {reason}')
        qc.save(update_fields=['status', 'completed_at', 'duration_seconds', 'comments'])
        _sync_task_status(order, 'master_quality_check', 'NOT_STARTED', qc.garment_job_id)

        order.current_stage_key = 'stitching_in_progress'
        order.production_status = 'IN_PROGRESS'
        order.order_status = recompute_client_status(order, config)
        order.save(update_fields=['current_stage_key', 'production_status', 'order_status'])

        _log_reversal(order, 'QC_FAILED', user, {
            'reason': reason,
            'garment_job': str(qc.garment_job_id) if qc.garment_job_id else None,
            'role': role,
            'reopened_stages': band,
        })
    return order


#: Answers on a garment form that put the order on the maggam path.
HAND_WORK_FIELD = 'hand_work'


def flow_for_garments(garments):
    """'maggam' when any garment on the order asks for hand work, else
    'stitching'. `garments` are the wizard's garment payloads (spec dicts)."""
    for g in garments or []:
        spec = g.get('spec') or g.get('values') or {}
        if (spec.get(HAND_WORK_FIELD) or 'none') != 'none':
            return 'maggam'
    return 'stitching'


def set_order_flow(order, flow, user):
    """The owner or Master moves an order onto the other path -- allowed only
    while no cutting or later work has begun, because the two paths share
    everything up to Fabric and nothing after it can be re-told."""
    from crm_api.models import BoutiqueSettings
    role = resolve_user_role(user)
    if role != OWNER and role != 'Master':
        raise PermissionError('Only the owner or the Master can change how an order is made.')
    if flow not in ('stitching', 'maggam'):
        raise workflow.TransitionError(f'Unknown flow "{flow}".')
    if order.flow == flow:
        return order
    begun = order.stages.exclude(stage_key='created').exclude(status='NOT_STARTED')
    if begun.exists():
        names = ', '.join(begun.values_list('stage_name', flat=True))
        raise workflow.TransitionError(
            f'Work has already begun on this order ({names}), so its path can '
            f'no longer be changed.')
    config = BoutiqueSettings.objects.get_or_create(id=1)[0].workflow_config
    wanted = workflow.stages_for_flow(config, flow)
    wanted_keys = [s['key'] for s in wanted]
    with transaction.atomic():
        order.stages.exclude(stage_key__in=wanted_keys).delete()
        from apps.production.models import ProductionTask
        ProductionTask.objects.filter(order=order).exclude(stage_key__in=wanted_keys).delete()
        have = set(order.stages.values_list('stage_key', flat=True))
        for index, s_conf in enumerate(wanted):
            if s_conf['key'] in have:
                order.stages.filter(stage_key=s_conf['key']).update(sequence=index)
                continue
            OrderStage.objects.create(
                order=order, stage_key=s_conf['key'], stage_name=s_conf['name'],
                status='NOT_STARTED', sequence=index, sla_hours=s_conf.get('sla_hours', 24))
            if s_conf['key'] not in ('created', 'payment', 'delivered'):
                ProductionTask.objects.create(
                    order=order, title=s_conf['name'], stage_key=s_conf['key'],
                    assigned_to=order.master or order.tailor, sequence=index + 1, priority='MEDIUM')
        order.flow = flow
        order.save(update_fields=['flow'])
        ensure_garment_stages(order)
        _log_reversal(order, 'FLOW_CHANGED', user, {'flow': flow, 'role': role})
    return order
