"""Garments the workroom finished for stock, received into inventory.

An internal production run ends with physical garments the boutique owns, so
the last thing it does is put them on the shelf. One InventoryItem per garment
template (the Anarkali line, the saree line), stocked a piece at a time through
InventoryService so every receipt leaves a StockMovement the way every other
stock change does.

Only internal runs come through here. A customer's order ends with the
customer, not with stock.
"""
from apps.inventory.models import Category, InventoryItem, Unit
from apps.inventory.services import InventoryService

#: Stamped on the receipt movement so the run that produced the stock is
#: readable from the ledger. StockMovement.order carries the run itself.
RECEIPT_REMARK = 'Finished in boutique production {reference}'


def _design_id(job):
    """The design this garment was made to, out of the parts it was configured
    with: the whole-garment one where there is one, else the first part that
    names a design."""
    parts = ((job.selections or {}).get('design') or {}).get('parts') or {}
    chosen = parts.get('overall') or next(
        (p for p in parts.values() if isinstance(p, dict) and p.get('id')), None)
    return (chosen or {}).get('id') or None


def _item_for(job):
    """The stock line this finished garment belongs on, created on first use.

    Keyed on the template, so five Anarkalis from one run and three from the
    next are the same line with eight pieces on it rather than eight lines.
    A design named on the job links the row to the library the same way a
    design filed straight into stock does.
    """
    from apps.design_studio.models import DesignAsset

    template = job.template
    code = f"FG-{str(template.pk)[:8].upper()}"
    item = InventoryItem.objects.filter(item_code=code).first()
    if item is not None:
        return item
    design = DesignAsset.objects.filter(pk=_design_id(job)).first()
    return InventoryItem.objects.create(
        item_code=code, name=template.name, category=Category.FINISHED,
        unit=Unit.PIECE, design_asset=design)


def receive_finished_goods(order, user=None):
    """Put every garment of a finished internal run into stock, once.

    Returns the pieces received. Idempotent per garment job: a run whose
    stages are reopened and completed again does not stock the same garment
    twice, because a job that already has a receipt movement is skipped.
    """
    if not order.is_internal:
        return 0

    jobs = list(order.garment_jobs.select_related('template'))
    if not jobs:
        return 0

    from apps.inventory.models import StockMovement
    already = set(StockMovement.objects.filter(
        order=order, movement_type=StockMovement.Type.STOCK_IN,
    ).values_list('garment_job_id', flat=True))

    received = 0
    for job in jobs:
        if job.id in already:
            continue
        InventoryService.stock_in(
            _item_for(job), 1, user=user, order=order, garment_job=job,
            remarks=RECEIPT_REMARK.format(reference=order.reference))
        received += 1
    return received
