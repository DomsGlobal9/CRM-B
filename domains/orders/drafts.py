
from django.db import transaction

from crm_api.models import Customer, OrderDraft, whatsapp_number


class DraftConflict(ValueError):
    pass



@transaction.atomic
def save_draft(user, payload, *, draft_id=None, customer=None, current_step=1,
               version=None):
    if draft_id is None:
        return OrderDraft.objects.create(
            created_by=user, customer=customer, payload=payload or {},
            current_step=current_step)

    draft = (OrderDraft.objects.select_for_update()
             .filter(pk=draft_id, created_by=user).first())
    if draft is None:
        return None

    if version is not None and int(version) != draft.version:
        raise DraftConflict(
            f'This order was changed somewhere else after you opened it '
            f'(you have version {version}, the saved one is {draft.version}). '
            f'Reload it to carry on from the newer copy.')

    draft.payload = payload if payload is not None else draft.payload
    draft.current_step = current_step or draft.current_step
    if customer is not None:
        draft.customer = customer
    draft.version += 1
    draft.save(update_fields=['payload', 'current_step', 'customer', 'version',
                              'updated_at'])
    return draft


def open_drafts(user):

    return OrderDraft.objects.filter(created_by=user).select_related('customer')


@transaction.atomic
def abandon(user, draft_id):
    return OrderDraft.objects.filter(pk=draft_id, created_by=user).delete()[0]


@transaction.atomic
def confirm(user, draft_id, *, create_order):
    draft = (OrderDraft.objects.select_for_update()
             .filter(pk=draft_id, created_by=user).first())
    if draft is None:
        return None
    order = create_order(draft)
    draft.delete()
    return order


def customer_for(draft, payload):
    # Customer.save stores the canonical form when the number parses and the
    # raw string when it does not, so the lookup asks for the same value.
    raw = (payload.get('mobile_number') or '').strip()
    mobile = whatsapp_number(raw) or raw
    # The draft names the customer it was started for; the wizard's "Not them"
    # then types a different number without clearing that id, so the id only
    # counts while the number on the draft is still theirs.
    if draft.customer_id and (not mobile or draft.customer.mobile_number == mobile):
        return draft.customer
    # A returning client typed afresh into the wizard is still the same client;
    # matching on the canonical number is what Customer.save would have
    # tripped the unique index on anyway.
    known = Customer.objects.filter(mobile_number=mobile).first() if mobile else None
    if known is not None:
        return known
    fields = {k: payload.get(k, '') for k in (
        'first_name', 'last_name', 'mobile_number', 'email_address', 'address',
        'city_region', 'source', 'customer_type', 'gender', 'garment_type', 'occasion',
        'pattern_style', 'custom_requirements', 'occupation',
        'preferred_communication', 'notes',
    ) if payload.get(k) not in (None, '')}
    return Customer.objects.create(**fields)
