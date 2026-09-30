"""Customer referrals: customer A brings in customer B.

B is found by the same canonical mobile the customer book is unique on. A new
B goes through CustomerSerializer, exactly like the Add Customer form; an
existing B is linked as it stands and never edited. Finding or creating B and
recording the referral happen in one transaction, so a refused referral never
leaves a customer behind.
"""
from typing import NamedTuple

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers as drf_serializers

from core.validators import MAX_NOTE, validate_text
from crm_api.models import Customer, CustomerReferral
from crm_api.serializers import CustomerSerializer
from domains.customers.repositories import CustomerRepository
from domains.orders.drafts import first_error


class ReferralResult(NamedTuple):
    referral: CustomerReferral
    #: B was added to the customer book by this call (False: B already existed).
    created: bool
    #: B already existed under a different name than the one sent. B is not
    #: renamed; the caller shows the name on file instead.
    name_differs: bool


def _name(customer):
    return f"{customer.first_name} {customer.last_name}".strip()


def _customer_data(payload):
    data = payload.dict() if hasattr(payload, 'dict') else dict(payload or {})
    data.pop('note', None)
    data.setdefault('source', 'Referral')
    return data


def attach_referral(referrer, referred, *, user, note=''):
    """Record that `referrer` referred the already-saved customer `referred`.

    The business rules both callers share: nobody refers themselves, and a
    customer keeps the first referrer they were given. Raises a DRF
    ValidationError with one plain sentence when the referral is refused.
    """
    if referred.pk == referrer.pk:
        raise drf_serializers.ValidationError('A customer cannot refer themselves.')

    earlier = (CustomerReferral.objects.select_related('referrer')
               .filter(referred=referred).first())
    if earlier is not None:
        if earlier.referrer_id == referrer.pk:
            raise drf_serializers.ValidationError(
                f'{_name(referrer)} has already referred {_name(referred)}.')
        by = _name(earlier.referrer) if earlier.referrer else earlier.referrer_name_snapshot
        raise drf_serializers.ValidationError(
            f'{_name(referred)} was already referred by {by or "another customer"}.')

    return CustomerReferral.objects.create(
        referrer=referrer, referred=referred, created_by=user, note=note)


def find_referrer(referrer_id):
    """The customer `referrer_id` names, or a refusal if no such customer exists.

    The referrer must already be in the book: an id nobody holds is refused
    rather than turned into a new customer.
    """
    try:
        referrer = Customer.objects.filter(pk=referrer_id).first()
    except (DjangoValidationError, ValueError, TypeError):
        referrer = None
    if referrer is None:
        raise drf_serializers.ValidationError(
            'Choose the referring customer from the list; that one is not in the customer book.')
    return referrer


def record_referral(referrer, payload, *, user):
    """Record that `referrer` referred the customer `payload` describes.

    Returns a ReferralResult. Raises a DRF ValidationError with one plain
    sentence when the referral is refused.
    """
    payload = payload or {}
    note = validate_text(payload.get('note'), label='Note', max_length=MAX_NOTE)
    mobile = str(payload.get('mobile_number') or '').strip()
    if not mobile:
        raise drf_serializers.ValidationError(
            'Enter the mobile number of the customer being referred.')

    try:
        with transaction.atomic():
            referred = CustomerRepository.find_by_mobile(mobile)
            created = referred is None
            if created:
                serializer = CustomerSerializer(data=_customer_data(payload))
                if not serializer.is_valid():
                    raise drf_serializers.ValidationError(first_error(serializer.errors))
                referred = serializer.save()

            referral = attach_referral(referrer, referred, user=user, note=note)
    except IntegrityError:
        raise drf_serializers.ValidationError(
            'That customer already has a referrer, or cannot be referred by this customer.')

    sent = ' '.join(str(payload.get(k) or '').strip() for k in ('first_name', 'last_name')).strip()
    name_differs = not created and bool(sent) and sent.lower() != _name(referred).lower()
    return ReferralResult(referral, created, name_differs)
