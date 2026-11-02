
from decimal import Decimal, ROUND_HALF_UP

#: GST is the boutique's to add on each order -- none unless they enter it,
#: as a percentage of the subtotal or as a fixed amount.
GST_MODES = ('percent', 'amount')

MAX_TOTAL = Decimal('99999999')

JOB_COMPONENTS = (
    'base_price', 'fabric_price', 'embroidery_price',
    'customization_price', 'tailoring_charges',
)

TWO_PLACES = Decimal('0.01')


def to_money(value):

    try:
        return Decimal(str(value if value not in (None, '') else 0)).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal('0.00')


def job_subtotal(job):
    return sum((getattr(job, f) or Decimal('0')) for f in JOB_COMPONENTS)


def validate_components(components, label=''):
    prefix = f'{label}: ' if label else ''
    for field, value in components.items():
        if value < 0:
            raise ValueError(f'{prefix}{field} cannot be negative.')


def gst_amount(subtotal, gst_mode='percent', gst_value=0):
    value = to_money(gst_value)
    if gst_mode not in GST_MODES:
        raise ValueError('GST must be a percentage or an amount.')
    if value < 0:
        raise ValueError('GST cannot be negative.')
    if gst_mode == 'amount':
        return value
    if value > 100:
        raise ValueError('GST cannot be more than 100%.')
    return (subtotal * value / Decimal('100')).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def totals_from_amounts(component_sums, packaging, discount, gst_mode='percent', gst_value=0):
    goods = sum(component_sums.values()) + packaging
    if discount > goods:
        raise ValueError('Discount cannot exceed the order subtotal.')
    subtotal = goods - discount
    taxes = gst_amount(subtotal, gst_mode, gst_value)
    total = subtotal + taxes
    if total > MAX_TOTAL:
        raise ValueError(
            'Order total exceeds the maximum this system can record '
            '(99,999,999). Check the prices entered.')
    return subtotal, taxes, total


def recompute_order_totals(order, jobs=None):
    if jobs is None:
        jobs = list(order.garment_jobs.all())
    sums = {
        field: sum((to_money(getattr(job, field)) for job in jobs), Decimal('0.00'))
        for field in JOB_COMPONENTS
    }
    packaging = to_money(order.packaging_handling)
    discount = to_money(order.discount)
    _, taxes, total = totals_from_amounts(sums, packaging, discount,
                                          order.gst_mode, order.gst_value)

    for field, value in sums.items():
        setattr(order, field, value)
    order.taxes = taxes
    order.total_amount = total
    order.save(update_fields=[*JOB_COMPONENTS, 'taxes', 'total_amount'])
    return order
