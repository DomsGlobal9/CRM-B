from crm_api.models import Order

from domains.orders.services import _SETTLED_ORDER_STATUSES

ORDER_SELECT_RELATED = ('customer', 'tailor', 'master', 'customer__measurements')
ORDER_PREFETCH = (
    'stages',
    'stages__performed_by',
    'stages__assigned_to',
    'activities',
    'activities__user',
    'stage_histories',
    'garment_jobs',
    'garment_jobs__template',
    'garment_jobs__materials',
    # Both of these are serialised for every order on the list endpoint --
    # OrderSerializer.garment_images and get_purchases -- and neither was
    # prefetched, so each row ran its own SELECT. Measured on the order list:
    # one query per order for each, on top of the row itself. The purchase
    # serialiser then reads supplier.name and order.customer per purchase,
    # which is why those two come along.
    #
    # Query planning only. The same rows are serialised into the same JSON;
    # this changes how many round trips fetch them, not what is returned.
    'garment_images',
    'purchases',
    'purchases__supplier',
    'purchases__order__customer',
)


class OrderRepository:
    @staticmethod
    def summary_queryset():

        return Order.objects.select_related('customer', 'tailor', 'master').prefetch_related(
            'stages', 'stages__performed_by', 'stages__assigned_to',
            'garment_jobs', 'garment_jobs__template',
        ).order_by('-order_date')

    @staticmethod
    def base_queryset():
        return Order.objects.select_related(*ORDER_SELECT_RELATED).prefetch_related(*ORDER_PREFETCH)

    @staticmethod
    def get_all():
        return OrderRepository.base_queryset().order_by('-order_date')

    @staticmethod
    def get_by_id(order_id):
        return OrderRepository.base_queryset().filter(id=order_id).first()

    @staticmethod
    def get_active_orders():
        return OrderRepository.get_all().exclude(order_status__in=_SETTLED_ORDER_STATUSES)
