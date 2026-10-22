from django.db.models import Prefetch

from crm_api.models import Customer, Order, whatsapp_number

CUSTOMER_PREFETCH = (
    'measurement_history',
    'design_preferences',
    'fabric_selections',
)


def _orders_prefetch(prefix=''):
    # CustomerSerializer.get_orders runs the full OrderSerializer over these, so
    # they get everything OrderRepository fetches for it. A hand-kept subset
    # here drifted: garment jobs, images, purchases and alterations were each
    # one SELECT per order (206 queries for one customer on production).
    #
    # Order has no Meta.ordering, so the rows used to come back in whatever
    # order Postgres read them -- insertion order on a plain scan, but not once
    # the joins above change the plan. Ordered by id to keep that order stable.
    from domains.orders.repositories import OrderRepository
    return Prefetch(f'{prefix}orders', queryset=OrderRepository.with_serializer_relations(
        Order.objects.order_by('id')))


def customer_serializer_relations(prefix):
    """What CustomerSerializer reads, for customers reached through `prefix`.

    `prefix` is the path from the rows being listed to their customer, e.g.
    'customer__' from an appointment. Returns (select_related, prefetch_related)
    lookups. Used where a full customer is nested in each row of a list: without
    them every row re-ran the customer's own queries and each of its orders' --
    917 queries for ten upcoming appointments, measured locally.
    """
    from crm_api.models import CustomerReferral
    select = (f'{prefix}measurements',)
    prefetch = (
        *(f'{prefix}{name}' for name in CUSTOMER_PREFETCH),
        _orders_prefetch(prefix),
        # get_referred_by: CustomerReferral's default order (newest first) is
        # the row its .first() picks.
        Prefetch(f'{prefix}referrals_received',
                 queryset=CustomerReferral.objects.select_related('referrer')),
    )
    return select, prefetch


class CustomerRepository:
    @staticmethod
    def summary_queryset():
        from django.db.models import Avg, Count, Max, Sum
        return Customer.objects.select_related('measurements').annotate(
            orders_count=Count('orders', distinct=True),
            orders_total_spend=Sum('orders__total_amount'),
            orders_avg_price=Avg('orders__total_amount'),
            orders_last_date=Max('orders__order_date'),
        ).order_by('-created_at')

    @staticmethod
    def base_queryset():
        return Customer.objects.select_related('measurements').prefetch_related(
            *CUSTOMER_PREFETCH, _orders_prefetch())

    @staticmethod
    def get_all():
        return CustomerRepository.base_queryset().order_by('-created_at')

    @staticmethod
    def get_by_id(customer_id):
        return CustomerRepository.base_queryset().filter(id=customer_id).first()

    @staticmethod
    def find_by_mobile(raw_mobile):
        raw = str(raw_mobile or '').strip()
        if not raw:
            return None
        return Customer.objects.filter(mobile_number=whatsapp_number(raw) or raw).first()

    @staticmethod
    def search(query):
        from django.db.models import Q
        return CustomerRepository.get_all().filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(mobile_number__icontains=query)
        )
