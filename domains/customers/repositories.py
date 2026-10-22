from django.db.models import Prefetch

from crm_api.models import Customer, Order, whatsapp_number

CUSTOMER_PREFETCH = (
    'measurement_history',
    'design_preferences',
    'fabric_selections',
)


def _orders_prefetch():
    # CustomerSerializer.get_orders runs the full OrderSerializer over these, so
    # they get everything OrderRepository fetches for it. A hand-kept subset
    # here drifted: garment jobs, images, purchases and alterations were each
    # one SELECT per order (206 queries for one customer on production).
    #
    # Order has no Meta.ordering, so the rows used to come back in whatever
    # order Postgres read them -- insertion order on a plain scan, but not once
    # the joins above change the plan. Ordered by id to keep that order stable.
    from domains.orders.repositories import OrderRepository
    return Prefetch('orders', queryset=OrderRepository.with_serializer_relations(
        Order.objects.order_by('id')))


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
