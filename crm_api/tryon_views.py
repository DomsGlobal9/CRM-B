"""The customer's try-on page: their finished garment on a photo of themselves.

Opened from the link sent with a garment's photos; public, no sign-in. Like
the tracking page it resolves its own boutique from the signed link and
applies the boutique's own switches itself (suspended, Try-On module off).
"""
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from django_tenants.utils import get_public_schema_name, get_tenant_model, schema_context

from crm_api.models import BoutiqueSettings, GarmentTryOn, Order
from domains.orders import tryon

#: What the customer reads for each TryOnError code; the code travels in the
#: redirect, never the vendor's own text.
MESSAGES = {
    'no_photo': 'Please choose a photo of yourself first.',
    'too_big': 'That photo is too large. Please choose one under 15 MB.',
    'bad_photo': 'We could not open that photo. Please choose a JPG or PNG photo.',
    'no_tries': 'You have used all your try-ons for this garment.',
    'no_garment': 'The photos of this garment are not ready yet.',
    'timeout': 'Making your picture took too long. Please wait a minute, then try again.',
    'busy': 'Our try-on is busy right now. Please wait a minute, then try again.',
    'unavailable': 'We could not make your picture right now. Please try again in a little while.',
}


def _resolve(token):
    """(tenant, schema, order_id, job_id) for a try-on link, or Http404."""
    schema_name, order_id, job_id = tryon.read_token(token)
    if not schema_name or schema_name == get_public_schema_name():
        raise Http404
    tenant = get_tenant_model().objects.filter(schema_name=schema_name).first()
    if tenant is None or not tenant.is_active or not tryon.enabled_for(tenant):
        raise Http404
    return tenant, schema_name, order_id, job_id


def _order_and_job(order_id, job_id):
    order = Order.objects.select_related('customer').filter(order_id=order_id).first()
    if order is None or order.customer_id is None:
        raise Http404
    job = order.garment_jobs.select_related('template').filter(pk=job_id).first()
    if job is None:
        raise Http404
    return order, job


@require_http_methods(['GET', 'POST'])
def garment_tryon(request, token):
    tenant, schema_name, order_id, job_id = _resolve(token)
    here = reverse('garment-tryon', args=[token])

    with schema_context(schema_name):
        order, job = _order_and_job(order_id, job_id)
        expired = tryon.delivered(order, job)

        if request.method == 'POST':
            if expired:
                return HttpResponseRedirect(here)
            upload = request.FILES.get('photo')
            try:
                if upload is None:
                    raise tryon.TryOnError('no_photo')
                tryon.make(order, job, upload, request)
            except tryon.TryOnError as exc:
                return HttpResponseRedirect(f'{here}?error={exc.code}#tryon')
            return HttpResponseRedirect(f'{here}?made=1#result')

        photos = [image for image in job.photos.all() if image.sent_at]
        if not photos:
            raise Http404
        context = {
            'boutique': BoutiqueSettings.objects.filter(id=1).first(),
            'order': order,
            'customer': order.customer,
            'garment_name': job.display_name,
            'photos': photos,
            'results': list(job.tryons.filter(status=GarmentTryOn.DONE)),
            'tries_left': tryon.tries_left(job),
            'max_tries': tryon.MAX_TRIES,
            'expired': expired,
            'just_made': request.GET.get('made') == '1',
            'error': MESSAGES.get(request.GET.get('error', '')),
            'token': token,
        }
        response = render(request, 'crm_api/tryon.html', context)

    response['Cache-Control'] = 'private, no-store'
    response['X-Robots-Tag'] = 'noindex, nofollow'
    return response
