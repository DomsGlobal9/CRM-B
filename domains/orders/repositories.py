from django.db.models import Prefetch

from crm_api.models import Order

from domains.orders.services import _SETTLED_ORDER_STATUSES

# alteration_of: Order.reference prints the parent's reference on an alteration,
# so without it every alteration row ran its own SELECT for the parent.
ORDER_SELECT_RELATED = ('customer', 'tailor', 'master', 'customer__measurements',
                        'alteration_of')


def _alterations_prefetch():
    # OrderSerializer.get_alterations lists them in alteration_seq order and
    # prints each one's reference, which reads the parent back.
    return Prefetch('alterations', queryset=Order.objects.select_related('alteration_of')
                    .order_by('alteration_seq'))


ORDER_PREFETCH = (
    'stages',
    'stages__performed_by',
    'stages__assigned_to',
    # OrderStageSerializer.garment_name reads stage.garment_job.display_name,
    # which falls back to the template's name. Measured on production: one
    # SELECT for the job and one for its template per per-garment stage --
    # 360 of the order list's 399 queries for a boutique with 18 orders.
    'stages__garment_job__template',
    'activities',
    'activities__user',
    'stage_histories',
    'garment_jobs',
    'garment_jobs__template',
    # GarmentJobSerializer.design_assignment: who is designing each garment.
    'garment_jobs__design_assignment__designer',
    'garment_jobs__materials',
    # JobMaterialSerializer.item_name.
    'garment_jobs__materials__inventory_item',
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

        return Order.objects.select_related(
            'customer', 'tailor', 'master', 'alteration_of',
        ).prefetch_related(
            'stages', 'stages__performed_by', 'stages__assigned_to',
            'stages__garment_job__template',
            'garment_jobs', 'garment_jobs__template',
            'garment_jobs__design_assignment__designer',
        ).order_by('-order_date')

    @staticmethod
    def with_serializer_relations(queryset):
        """Everything OrderSerializer reads, fetched up front for any order queryset."""
        return queryset.select_related(*ORDER_SELECT_RELATED).prefetch_related(
            *ORDER_PREFETCH, _alterations_prefetch())

    @staticmethod
    def base_queryset():
        return OrderRepository.with_serializer_relations(Order.objects.all())

    @staticmethod
    def get_all():
        return OrderRepository.base_queryset().order_by('-order_date')

    @staticmethod
    def get_by_id(order_id):
        return OrderRepository.base_queryset().filter(id=order_id).first()

    @staticmethod
    def get_active_orders():
        return OrderRepository.get_all().exclude(order_status__in=_SETTLED_ORDER_STATUSES)
