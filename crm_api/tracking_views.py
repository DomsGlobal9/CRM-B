
from decimal import Decimal

from django.db import connection
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_POST
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from core.modules import is_enabled
from crm_api.models import BoutiqueSettings, GarmentPhotoReview, Notification, Order
from domains.orders.garments import garment_names
from domains.orders.tracking import read_token


def _payment_status(total, paid):
    if paid >= total:
        return 'Paid'
    if paid > 0:
        return 'Partially Paid'
    return 'Payment Pending'


def _tracked(token):
    """(tenant, schema, order_id) for a tracking link, or Http404 -- the token
    and the two gates below, shared by the page and the photo review."""
    schema_name, order_id = read_token(token)
    if not schema_name or schema_name == get_public_schema_name():
        raise Http404

    tenant = get_tenant_model().objects.filter(schema_name=schema_name).first()
    if tenant is None:
        raise Http404

    # The two gates TenantHeaderMiddleware applies to every other request.
    #
    # This view resolves its own tenant from the signed token and enters the
    # schema itself, so the middleware's control check never ran for it: a
    # boutique suspended by the platform console, or one whose order_tracking
    # module had been switched off, went on serving customer-facing order pages
    # -- name, garments, stage history and payment status -- to anyone holding
    # a previously issued link. Opting out of the authenticated stack was
    # deliberate; opting out of the boutique's own on/off switches was not.
    #
    # Read from the registry row fetched above rather than re-implemented:
    # is_enabled is the same helper the middleware calls, so the two cannot
    # drift about what "absent means enabled" means.
    if not tenant.is_active:
        raise Http404
    if not is_enabled(getattr(tenant, 'plan', None), getattr(tenant, 'enabled_modules', None),
                      'order_tracking'):
        raise Http404
    return tenant, schema_name, order_id


@require_GET
def order_tracking(request, token):
    tenant, schema_name, order_id = _tracked(token)

    with schema_context(schema_name):
        order = (
            Order.objects
            .select_related('customer')
            .prefetch_related('stages', 'garment_jobs', 'garment_jobs__template')
            .filter(order_id=order_id)
            .first()
        )
        # A boutique's own production run is not tracked: nobody is waiting
        # for it, and it carries no customer for the page to address.
        if order is None or order.customer_id is None:
            raise Http404

        boutique = BoutiqueSettings.objects.filter(id=1).first()

        # One line per stage for the customer: a per-garment stage reads as
        # done once every garment's row is, and its date is the last one's.
        stages, by_key = [], {}
        for s in order.stages.all():
            if s.status == 'SKIPPED':
                continue
            folded = by_key.get(s.stage_key)
            if folded is None:
                by_key[s.stage_key] = s
                stages.append(s)
                continue
            if s.status in ('COMPLETED', 'SKIPPED') and folded.status == 'COMPLETED':
                if s.completed_at and (folded.completed_at is None or s.completed_at > folded.completed_at):
                    folded.completed_at = s.completed_at
            elif folded.status == 'COMPLETED':
                folded.status = s.status if s.status != 'NOT_STARTED' else 'IN_PROGRESS'
            elif s.status != 'NOT_STARTED' and folded.status == 'NOT_STARTED':
                folded.status = 'IN_PROGRESS'

        trial = (
            order.appointments
            .filter(appointment_type='TRIAL')
            .exclude(status='CANCELLED')
            .order_by('-scheduled_time')
            .first()
        )

        total = order.total_amount or Decimal('0')
        paid = order.amount_paid or Decimal('0')

        garment_images = (
            list(order.garment_images.all()) if order.garment_images_published else []
        )

        garments = garment_names(order)

        # Each garment's photos once they were sent to the customer, with their
        # latest answer, for the approve / ask-for-changes form.
        photo_garments = []
        for job in order.garment_jobs.all():
            sent = [i for i in order.garment_images.all() if i.garment_job_id == job.pk and i.sent_at]
            if sent:
                review = order.photo_reviews.filter(garment_job=job).first()
                photo_garments.append({'job': job, 'name': job.display_name, 'images': sent, 'review': review})

        context = {
            'boutique': boutique,
            'tenant': tenant,
            'order': order,
            'customer': order.customer,
            'garments': garments,
            'garment_heading': 'Garments' if len(garments) > 1 else 'Garment',
            'stages': stages,
            'garment_images': garment_images,
            'photo_garments': photo_garments,
            'token': token,
            'review_sent': request.GET.get('review') == 'thanks',
            'trial': trial,
            'total': total,
            'paid': paid,
            'balance': max(total - paid, Decimal('0')),
            'payment_status': _payment_status(total, paid),
        }
        response = render(request, 'crm_api/tracking.html', context)

    response['Cache-Control'] = 'private, no-store'
    response['X-Robots-Tag'] = 'noindex, nofollow'
    return response


@require_POST
def garment_photo_review(request, token):
    """The customer's answer to a garment's photos: approve, or ask for
    changes (saying what). The boutique gets an alert; the page reloads."""
    tenant, schema_name, order_id = _tracked(token)
    decision = request.POST.get('decision')
    note = (request.POST.get('note') or '').strip()[:500]
    with schema_context(schema_name):
        order = Order.objects.select_related('customer').filter(order_id=order_id).first()
        if order is None or order.customer_id is None:
            raise Http404
        job = order.garment_jobs.filter(pk=request.POST.get('garment_job')).first()
        sent = job is not None and order.garment_images.filter(garment_job=job, sent_at__isnull=False).exists()
        if not sent or decision not in (GarmentPhotoReview.APPROVED, GarmentPhotoReview.CHANGES):
            raise Http404
        GarmentPhotoReview.objects.create(order=order, garment_job=job, decision=decision, note=note)
        who = f"{order.customer.first_name} {order.customer.last_name}".strip()
        if decision == GarmentPhotoReview.APPROVED:
            title = f"Photos approved: {job.display_name} ({order.reference})"
            message = f"{who} approved the photos of their {job.display_name} on order {order.reference}."
        else:
            title = f"Changes asked: {job.display_name} ({order.reference})"
            message = (f"{who} asked for changes to their {job.display_name} on order {order.reference}: "
                       f"{note or '(no details given)'}")
        Notification.objects.create(recipient_role='Owner', title=title, message=message)
    return HttpResponseRedirect(reverse('order-tracking', args=[token]) + '?review=thanks#photos')
