"""Racks & shelves: where inside a location the stock sits.

A location (Main Store, Warehouse...) keeps the one official quantity per
item (LocationStock). This module records which shelf some of it is on:
area -> rack / cupboard -> shelf -> box, each with an address (FLOOR-C2-1) and
a printed QR label ("SEZ:<label_code>"). Whatever is in the location but on
no recorded shelf is "Not shelved".

THE ONE RULE, for every item at every location:

    sum on its shelves  <=  LocationStock.quantity

It is kept inside every stock change: InventoryService.record_movement calls
after_stock_change() in the same transaction, after the item's row lock, and
anything that would leave the shelves holding more than the location is taken
off them -- from "Not shelved" first, then shelves in walking order -- with a
Problem (ShelfIssue) raised for a person to check. The database re-checks it
at commit (migration 0017's constraint triggers).

Moves that only change *where* stock is (put away, move, count) are a
SHELF_MOVE StockMovement: the location's quantity does not change, and the
shelf legs (StockMovementSpot) hang off that movement for the history.

Every error is a ShelfError whose message is a sentence for the screen.
"""
import re
import secrets
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (
    InventoryItem, LocationStock, ShelfIssue, SpotStock, StockLocation, StockMovement,
    StockMovementSpot, StorageSpot,
)

ZERO = Decimal('0')
STEP = Decimal('0.001')
CODE_RE = re.compile(r'^[A-Z0-9]{1,12}$')
LABEL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
QR_PREFIX = 'SEZ:'
#: One "describe your store" can make at most this many spots.
MAX_SETUP_SPOTS = 600
#: The bell alert raised when the rule had to guess (one at a time, unread).
ALERT_TITLE = 'Shelves need a look'

UNIT_SHORT = {'METER': 'm', 'KILOGRAM': 'kg', 'GRAM': 'g'}


class ShelfError(ValueError):
    """A refusal the screen shows as it is."""


# ---- small helpers -----------------------------------------------------------

def clean_code(raw):
    return re.sub(r'[^A-Z0-9]', '', str(raw or '').upper())


def clean_address(raw):
    """"c2 1", "floor/c2/1", "FLOOR-C2-1" -> "C2-1" / "FLOOR-C2-1"."""
    parts = re.split(r'[^A-Za-z0-9]+', str(raw or '').strip())
    return '-'.join(p.upper() for p in parts if p)


def quantity(value, *, label='Quantity', allow_zero=False):
    try:
        q = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ShelfError(f'{label} must be a number.')
    if not q.is_finite():
        raise ShelfError(f'{label} must be a number.')
    q = q.quantize(STEP)
    if q < 0 or (q == 0 and not allow_zero):
        raise ShelfError(f'{label} must be more than 0.' if not allow_zero else f'{label} cannot be negative.')
    if q > Decimal('99999999'):
        raise ShelfError(f'{label} is too large.')
    return q


def fmt(q):
    """3.000 -> "3", 2.500 -> "2.5"."""
    q = Decimal(q or 0)
    text = f'{q.normalize():f}'
    return '0' if text in ('-0', '') else text


def amount(q, item):
    unit = UNIT_SHORT.get(item.unit)
    if unit:
        return f'{fmt(q)} {unit}'
    label = item.get_unit_display().lower()
    return f'{fmt(q)} {label}{"" if Decimal(q) == 1 or label.endswith("s") else "s"}'


def _new_label_code():
    while True:
        code = ''.join(secrets.choice(LABEL_ALPHABET) for _ in range(8))
        if not StorageSpot.objects.filter(label_code=code).exists():
            return code


def _user_name(user):
    if user is None or not getattr(user, 'is_authenticated', False):
        return 'System'
    profile = getattr(user, 'tailor_profile', None)
    if profile is not None and profile.name:
        return profile.name
    return user.get_full_name() or user.username


# ---- reading -------------------------------------------------------------------

def location_quantity(item, location):
    row = LocationStock.objects.filter(item=item, location=location).values_list('quantity', flat=True).first()
    return row if row is not None else ZERO


def shelved_quantity(item, location):
    return (SpotStock.objects.filter(item=item, location=location)
            .aggregate(n=Sum('quantity'))['n'] or ZERO)


def not_shelved(item, location):
    return max(ZERO, location_quantity(item, location) - shelved_quantity(item, location))


def _walk_keys(spots):
    """{spot id: sort key} -- ancestors' walk orders, then its own, then the
    address -- so the same shelves always come back in the same order."""
    by_id = {s.id: s for s in spots}
    keys = {}

    def key(s):
        if s.id in keys:
            return keys[s.id]
        parent = by_id.get(s.parent_id)
        k = (key(parent)[0] if parent else ()) + (s.walk_order,)
        keys[s.id] = (k, s.address)
        return keys[s.id]

    for s in spots:
        key(s)
    return keys


def _leaf_ids(spots):
    parents = {s.parent_id for s in spots if s.parent_id}
    return {s.id for s in spots if s.id not in parents}


def spot_json(spot, *, total=None, items=None, is_leaf=None):
    data = {
        'id': str(spot.id),
        'location': str(spot.location_id),
        'parent': str(spot.parent_id) if spot.parent_id else None,
        'kind': spot.kind,
        'kind_label': spot.get_kind_display(),
        'code': spot.code,
        'address': spot.address,
        'name': spot.name,
        'depth': spot.depth,
        'walk_order': spot.walk_order,
        'is_shop_floor': spot.is_shop_floor,
        'label_code': spot.label_code,
        'capacity': fmt(spot.capacity) if spot.capacity is not None else None,
        'active': spot.active,
        'last_counted_at': spot.last_counted_at.isoformat() if spot.last_counted_at else None,
    }
    if total is not None:
        data['total'] = fmt(total)
    if items is not None:
        data['item_count'] = items
    if is_leaf is not None:
        data['is_leaf'] = is_leaf
    return data


def tree(location):
    """Every spot of a location in walking order, with how much each holds
    (a rack's figure is everything on its shelves)."""
    spots = list(StorageSpot.objects.filter(location=location))
    keys = _walk_keys(spots)
    spots.sort(key=lambda s: keys[s.id])
    leaves = _leaf_ids(spots)
    held = {row['spot']: row for row in SpotStock.objects.filter(location=location)
            .values('spot').annotate(total=Sum('quantity'), items=Count('id'))}
    by_id = {s.id: s for s in spots}
    totals = {s.id: ZERO for s in spots}
    items = {s.id: 0 for s in spots}
    for spot_id, row in held.items():
        node = by_id.get(spot_id)
        while node is not None:
            totals[node.id] += row['total']
            items[node.id] += row['items']
            node = by_id.get(node.parent_id)
    return [spot_json(s, total=totals[s.id], items=items[s.id], is_leaf=s.id in leaves) for s in spots]


def spot_contents(spot):
    rows = (SpotStock.objects.filter(spot=spot).select_related('item').order_by('item__name'))
    return [_stock_row(r) for r in rows]


def _item_json(item):
    return {
        'id': str(item.id), 'name': item.name, 'item_code': item.item_code,
        'category': item.category, 'color': item.color or '', 'unit': item.unit,
        'unit_label': item.get_unit_display(), 'image_url': item.image_url or '',
    }


def _stock_row(row):
    return {'item': _item_json(row.item), 'quantity': fmt(row.quantity),
            'quantity_text': amount(row.quantity, row.item)}


def spot_history(spot, limit=50):
    legs = (StockMovementSpot.objects.filter(spot=spot)
            .select_related('item', 'movement').order_by('-created_at')[:limit])
    return [{
        'id': str(leg.id), 'item': _item_json(leg.item), 'quantity': fmt(leg.quantity),
        'quantity_text': ('+' if leg.quantity > 0 else '−') + amount(abs(leg.quantity), leg.item),
        'source': leg.source, 'type': leg.movement.movement_type,
        'type_label': leg.movement.get_movement_type_display(),
        'by': leg.movement.user_name_snapshot or '', 'remarks': leg.movement.remarks or '',
        'at': leg.created_at.isoformat(),
    } for leg in legs]


def whereabouts(item, location=None):
    """Where one item is: per location, its shelves (holding it first, in
    walking order) and what is not on any shelf."""
    stock = LocationStock.objects.filter(item=item).select_related('location')
    if location is not None:
        stock = stock.filter(location=location)
    held = {row.location_id: row.quantity for row in stock}
    shelf_rows = SpotStock.objects.filter(item=item).select_related('spot', 'location')
    if location is not None:
        shelf_rows = shelf_rows.filter(location=location)
    by_location = {}
    for row in shelf_rows:
        by_location.setdefault(row.location_id, []).append(row)
    location_ids = set(held) | set(by_location)
    locations = {loc.id: loc for loc in StockLocation.objects.filter(id__in=location_ids)}
    result = []
    for loc_id in sorted(location_ids, key=lambda i: (locations[i].sequence, locations[i].name)):
        rows = by_location.get(loc_id, [])
        spots = list(StorageSpot.objects.filter(location_id=loc_id))
        keys = _walk_keys(spots)
        rows.sort(key=lambda r: keys.get(r.spot_id, ((), r.spot.address)))
        on_shelves = sum((r.quantity for r in rows), ZERO)
        total = held.get(loc_id, ZERO)
        if total <= 0 and not rows:
            continue
        result.append({
            'location': {'id': str(loc_id), 'name': locations[loc_id].name},
            'total': fmt(total), 'total_text': amount(total, item),
            'shelves': [{'spot': spot_json(r.spot), 'quantity': fmt(r.quantity),
                         'quantity_text': amount(r.quantity, item)} for r in rows],
            'not_shelved': fmt(max(ZERO, total - on_shelves)),
            'not_shelved_text': amount(max(ZERO, total - on_shelves), item),
        })
    return {'item': _item_json(item), 'locations': result}


def find(q, location=None, limit=20):
    """Search by name, code, colour, design number or type; each hit with where it is."""
    needle = str(q or '').strip()
    if len(needle) < 1:
        return []
    items = InventoryItem.objects.filter(
        Q(name__icontains=needle) | Q(item_code__iexact=needle) | Q(item_code__icontains=needle)
        | Q(color__icontains=needle) | Q(design_number__icontains=needle) | Q(kind__icontains=needle)
        | Q(sub_category__icontains=needle)
    ).order_by('name')[:limit]
    return [whereabouts(item, location) for item in items]


def not_shelved_list(location):
    """Items at a location with pieces on no shelf: "Waiting to be put away"."""
    rows = (LocationStock.objects.filter(location=location, quantity__gt=0)
            .select_related('item').order_by('item__name'))
    shelved = {r['item']: r['n'] for r in SpotStock.objects.filter(location=location)
               .values('item').annotate(n=Sum('quantity'))}
    out = []
    for row in rows:
        left = row.quantity - shelved.get(row.item_id, ZERO)
        if left > 0:
            out.append({'item': _item_json(row.item), 'quantity': fmt(left),
                        'quantity_text': amount(left, row.item), 'total': fmt(row.quantity)})
    return out


def scan(code, location=None):
    """A scanned label ("SEZ:ABCD2345" or the code alone) or a typed address
    ("c2 1") -> the spot."""
    raw = str(code or '').strip()
    if not raw:
        raise ShelfError('Scan a shelf label or type its address.')
    label = raw[len(QR_PREFIX):] if raw.upper().startswith(QR_PREFIX) else raw
    spot = StorageSpot.objects.filter(label_code=clean_code(label)).select_related('location').first()
    if spot is not None:
        return spot
    address = clean_address(label)
    spots = StorageSpot.objects.filter(address=address).select_related('location')
    if location is not None:
        spots = spots.filter(location=location)
    found = list(spots[:2])
    if not found:
        # "C2-1" typed without its area: match the end of an address.
        spots = StorageSpot.objects.filter(address__endswith='-' + address).select_related('location')
        if location is not None:
            spots = spots.filter(location=location)
        found = list(spots[:2])
    if len(found) == 1:
        return found[0]
    if len(found) > 1:
        raise ShelfError(f'More than one shelf matches "{raw}". Type the full address, like FLOOR-C2-1.')
    raise ShelfError(f'No shelf matches "{raw}".')


def labels(location, spot_ids=None):
    spots = StorageSpot.objects.filter(location=location)
    if spot_ids:
        spots = spots.filter(id__in=spot_ids)
    spots = list(spots)
    keys = _walk_keys(list(StorageSpot.objects.filter(location=location)))
    spots.sort(key=lambda s: keys.get(s.id, ((), s.address)))
    return [{**spot_json(s), 'qr': QR_PREFIX + s.label_code, 'location_name': location.name} for s in spots]


# ---- the rack tree --------------------------------------------------------------

def _next_walk_order(location, parent):
    siblings = StorageSpot.objects.filter(location=location, parent=parent)
    top = siblings.order_by('-walk_order').values_list('walk_order', flat=True).first()
    return (top or 0) + 10


def _check_kind(kind):
    kind = str(kind or '').upper()
    if kind not in StorageSpot.Kind.values:
        raise ShelfError('Choose what this is: an area, rack, cupboard, shelf, box...')
    return kind


@transaction.atomic
def create_spot(location, *, parent=None, kind, code, name='', walk_order=None, is_shop_floor=None,
                capacity=None):
    code = clean_code(code)
    if not CODE_RE.match(code):
        raise ShelfError('A code is 1 to 12 letters or numbers, like C2 or 1.')
    kind = _check_kind(kind)
    if parent is not None:
        parent = StorageSpot.objects.select_for_update().get(pk=parent.pk)
        if parent.location_id != location.id:
            raise ShelfError('That rack is in another location.')
        if parent.depth >= StorageSpot.MAX_DEPTH:
            raise ShelfError(f'{parent.address} is already 4 levels deep; nothing more can go inside it.')
        if SpotStock.objects.filter(spot=parent).exists():
            raise ShelfError(f'{parent.address} holds stock, so nothing can go inside it. '
                             f'Move its stock to another shelf first.')
        address = f'{parent.address}-{code}'
        depth = parent.depth + 1
        shop_floor = parent.is_shop_floor
    else:
        address, depth = code, 1
        shop_floor = True if is_shop_floor is None else bool(is_shop_floor)
    if StorageSpot.objects.filter(location=location, address=address).exists():
        raise ShelfError(f'{address} already exists here.')
    return StorageSpot.objects.create(
        location=location, parent=parent, kind=kind, code=code, address=address,
        name=str(name or '').strip()[:80], depth=depth,
        walk_order=_next_walk_order(location, parent) if walk_order in (None, '') else max(0, int(walk_order)),
        is_shop_floor=shop_floor, label_code=_new_label_code(),
        capacity=quantity(capacity, label='Capacity') if capacity not in (None, '') else None,
    )


def _level_codes(level, index_in_parent):
    """One level's codes for the n-th parent: explicit codes, or a numbered
    run with a prefix (C1, C2...), the count either the same for every parent
    or one per parent ("rack 1 has 6 shelves, rack 2 has 4")."""
    codes = level.get('codes')
    if codes:
        return [clean_code(c) for c in codes if clean_code(c)]
    counts = level.get('counts')
    if counts:
        try:
            count = int(counts[index_in_parent]) if index_in_parent < len(counts) else int(counts[-1])
        except (TypeError, ValueError):
            raise ShelfError('How many must be a number.')
    else:
        try:
            count = int(level.get('count') or 0)
        except (TypeError, ValueError):
            raise ShelfError('How many must be a number.')
    if count < 0 or count > 99:
        raise ShelfError('Each level can have 0 to 99.')
    prefix = clean_code(level.get('prefix', ''))
    try:
        start = int(level.get('start') or 1)
    except (TypeError, ValueError):
        start = 1
    pad = 2 if level.get('pad') else 0
    return [f'{prefix}{str(start + i).zfill(pad)}' for i in range(count)]


def plan_setup(location, *, parent=None, levels, is_shop_floor=True):
    """What "describe your store" would make, without making it. Only adds:
    an existing address is kept as it is, and nothing is planned under a spot
    that holds stock or is switched off."""
    if not isinstance(levels, list) or not levels:
        raise ShelfError('Describe at least one level.')
    if parent is not None and parent.depth + len(levels) > StorageSpot.MAX_DEPTH:
        raise ShelfError('That would be more than 4 levels deep.')
    if parent is None and len(levels) > StorageSpot.MAX_DEPTH:
        raise ShelfError('A store can be at most 4 levels deep: area, rack, shelf, box.')
    existing = {s.address: s for s in StorageSpot.objects.filter(location=location)}
    holding = set(SpotStock.objects.filter(location=location).values_list('spot__address', flat=True))
    plan = []
    parents = [(parent.address if parent else None, parent.depth if parent else 0)]
    for level in levels:
        kind = _check_kind(level.get('kind'))
        next_parents = []
        for index, (parent_address, parent_depth) in enumerate(parents):
            if parent_address is not None:
                held_spot = existing.get(parent_address)
                if parent_address in holding:
                    plan.append({'address': parent_address, 'skip': 'holds stock'})
                    continue
                if held_spot is not None and not held_spot.active:
                    plan.append({'address': parent_address, 'skip': 'not in use'})
                    continue
            for code in _level_codes(level, index):
                if not CODE_RE.match(code):
                    raise ShelfError(f'"{code}" is not a valid code: use 1 to 12 letters or numbers.')
                address = f'{parent_address}-{code}' if parent_address else code
                plan.append({'address': address, 'code': code, 'kind': kind, 'kind_label': StorageSpot.Kind(kind).label,
                             'depth': parent_depth + 1, 'parent': parent_address,
                             'exists': address in existing})
                next_parents.append((address, parent_depth + 1))
                if len(plan) > MAX_SETUP_SPOTS:
                    raise ShelfError(f'That is more than {MAX_SETUP_SPOTS} spots in one go. Set it up in parts.')
        parents = next_parents
    plan = [p for p in plan if 'skip' in p or p['address']]
    return {
        'spots': plan,
        'new': sum(1 for p in plan if not p.get('exists') and 'skip' not in p),
        'kept': sum(1 for p in plan if p.get('exists')),
        'is_shop_floor': bool(is_shop_floor),
    }


@transaction.atomic
def save_setup(location, *, parent=None, levels, is_shop_floor=True):
    planned = plan_setup(location, parent=parent, levels=levels, is_shop_floor=is_shop_floor)
    made = {s.address: s for s in StorageSpot.objects.select_for_update().filter(location=location)}
    created = []
    for row in planned['spots']:
        if 'skip' in row or row['exists']:
            continue
        parent_spot = made.get(row['parent']) if row['parent'] else parent
        spot = create_spot(location, parent=parent_spot, kind=row['kind'], code=row['code'],
                           is_shop_floor=is_shop_floor if parent_spot is None else None)
        made[spot.address] = spot
        created.append(spot)
    return {'created': len(created), 'kept': planned['kept']}


@transaction.atomic
def update_spot(spot, data):
    spot = StorageSpot.objects.select_for_update().get(pk=spot.pk)
    fields = []
    if 'name' in data:
        spot.name = str(data.get('name') or '').strip()[:80]
        fields.append('name')
    if 'kind' in data and data['kind']:
        spot.kind = _check_kind(data['kind'])
        fields.append('kind')
    if 'walk_order' in data and data['walk_order'] not in (None, ''):
        try:
            spot.walk_order = max(0, int(data['walk_order']))
        except (TypeError, ValueError):
            raise ShelfError('Walking order must be a number.')
        fields.append('walk_order')
    if 'capacity' in data:
        spot.capacity = quantity(data['capacity'], label='Capacity') if data['capacity'] not in (None, '') else None
        fields.append('capacity')
    if 'active' in data:
        spot.active = bool(data['active'])
        fields.append('active')
    if 'is_shop_floor' in data:
        if spot.depth != 1:
            raise ShelfError('Shop floor is set on the area; everything inside it follows.')
        spot.is_shop_floor = bool(data['is_shop_floor'])
        fields.append('is_shop_floor')
        _descendants(spot).update(is_shop_floor=spot.is_shop_floor)
    if 'code' in data and clean_code(data['code']) != spot.code:
        code = clean_code(data['code'])
        if not CODE_RE.match(code):
            raise ShelfError('A code is 1 to 12 letters or numbers, like C2 or 1.')
        old = spot.address
        new = f'{spot.parent.address}-{code}' if spot.parent_id else code
        if StorageSpot.objects.filter(location=spot.location, address=new).exists():
            raise ShelfError(f'{new} already exists here.')
        for child in _descendants(spot).select_for_update():
            child.address = new + child.address[len(old):]
            child.save(update_fields=['address', 'updated_at'])
        spot.code, spot.address = code, new
        fields += ['code', 'address']
    if fields:
        spot.save(update_fields=fields + ['updated_at'])
    return spot


def _descendants(spot):
    return StorageSpot.objects.filter(location=spot.location, address__startswith=spot.address + '-')


@transaction.atomic
def delete_spot(spot):
    spot = StorageSpot.objects.select_for_update().get(pk=spot.pk)
    if spot.children.exists():
        raise ShelfError(f'{spot.address} has spots inside it. Delete those first.')
    if SpotStock.objects.filter(spot=spot).exists():
        raise ShelfError(f'{spot.address} still holds stock. Move it to another shelf first.')
    spot.delete()


# ---- changing where stock is ----------------------------------------------------

def _lock_item(item):
    return InventoryItem.objects.select_for_update().get(pk=item.pk)


def _check_leaf(spot, *, receiving):
    if spot.children.exists():
        raise ShelfError(f'{spot.address} has shelves inside it. Choose one of those.')
    if receiving and not spot.active:
        raise ShelfError(f'{spot.address} is not in use. Switch it back on, or choose another shelf.')


def _shelf_movement(item, location, qty, user, remarks):
    return StockMovement.objects.create(
        item=item, movement_type=StockMovement.Type.SHELF_MOVE, quantity=qty,
        from_location=location, to_location=location,
        previous_stock=item.current_stock, new_stock=item.current_stock,
        previous_reserved=item.reserved_stock, new_reserved=item.reserved_stock,
        user=user if (user and getattr(user, 'is_authenticated', False)) else None,
        user_name_snapshot=_user_name(user), remarks=remarks[:500],
    )


def _shift_spot(spot, item, delta):
    row = SpotStock.objects.select_for_update().filter(spot=spot, item=item).first()
    current = row.quantity if row else ZERO
    new = current + delta
    if new < 0:
        raise ShelfError(f'Only {amount(current, item)} of {item.name} {"is" if current == 1 else "are"} on {spot.address}.')
    if row is None:
        if new > 0:
            SpotStock.objects.create(spot=spot, item=item, location=spot.location, quantity=new)
    elif new == 0:
        row.delete()
    else:
        row.quantity = new
        row.save(update_fields=['quantity', 'updated_at'])
    return new


def _leg(movement, spot, item, delta, source=StockMovementSpot.Source.SCANNED):
    StockMovementSpot.objects.create(
        movement=movement, spot=spot, address=spot.address, item=item, location=spot.location,
        quantity=delta, source=source)


def _capacity_warning(spot):
    if spot.capacity is None:
        return ''
    held = SpotStock.objects.filter(spot=spot).aggregate(n=Sum('quantity'))['n'] or ZERO
    if held > spot.capacity:
        return f'{spot.address} now holds {fmt(held)}, more than its usual {fmt(spot.capacity)}.'
    return ''


@transaction.atomic
def put_away(location, item, spot, qty, user=None):
    """Not-shelved pieces onto a shelf (also how a first fill is recorded)."""
    qty = quantity(qty)
    if spot.location_id != location.id:
        raise ShelfError(f'{spot.address} is in {spot.location.name}, not {location.name}.')
    _check_leaf(spot, receiving=True)
    item = _lock_item(item)
    held = location_quantity(item, location)
    if held <= 0:
        raise ShelfError(f'The stock record has no {item.name} at {location.name}.')
    free = max(ZERO, held - shelved_quantity(item, location))
    if qty > free:
        raise ShelfError(f'Only {amount(free, item)} of {item.name} {"is" if free == 1 else "are"} not on a shelf here.')
    movement = _shelf_movement(item, location, qty, user, f'Put away onto {spot.address}')
    _shift_spot(spot, item, qty)
    _leg(movement, spot, item, qty)
    return {'moved': fmt(qty), 'moved_text': amount(qty, item), 'spot': spot.address,
            'warning': _capacity_warning(spot)}


@transaction.atomic
def move(location, item, qty, *, from_spot=None, to_spot=None, user=None, note=''):
    """Shelf to shelf, or off a shelf back to Not shelved (no to_spot)."""
    qty = quantity(qty)
    if from_spot is None and to_spot is None:
        raise ShelfError('Choose the shelf the stock is on, and where it goes.')
    if from_spot is None:
        return put_away(location, item, to_spot, qty, user=user)
    for spot in (from_spot, to_spot):
        if spot is not None and spot.location_id != location.id:
            raise ShelfError(f'{spot.address} is in {spot.location.name}, not {location.name}.')
    if to_spot is not None:
        if to_spot.id == from_spot.id:
            raise ShelfError('That is the same shelf.')
        _check_leaf(to_spot, receiving=True)
    item = _lock_item(item)
    where = f'{from_spot.address} to {to_spot.address}' if to_spot else f'{from_spot.address} back to Not shelved'
    movement = _shelf_movement(item, location, qty, user, f'Moved from {where}. {note}'.strip())
    _shift_spot(from_spot, item, -qty)
    _leg(movement, from_spot, item, -qty)
    if to_spot is not None:
        _shift_spot(to_spot, item, qty)
        _leg(movement, to_spot, item, qty)
    return {'moved': fmt(qty), 'moved_text': amount(qty, item), 'from': from_spot.address,
            'to': to_spot.address if to_spot else None,
            'warning': _capacity_warning(to_spot) if to_spot else ''}


@transaction.atomic
def move_all(from_spot, to_spot, user=None):
    if from_spot.location_id != to_spot.location_id:
        raise ShelfError('Both shelves must be in the same location.')
    if from_spot.id == to_spot.id:
        raise ShelfError('That is the same shelf.')
    _check_leaf(to_spot, receiving=True)
    rows = list(SpotStock.objects.filter(spot=from_spot).select_related('item').order_by('item_id'))
    if not rows:
        raise ShelfError(f'{from_spot.address} is empty.')
    for row in rows:
        move(from_spot.location, row.item, row.quantity, from_spot=from_spot, to_spot=to_spot, user=user)
    return {'items': len(rows), 'from': from_spot.address, 'to': to_spot.address}


def _issue(kind, item, location, qty, message, *, spot=None, movement=None):
    return ShelfIssue.objects.create(
        kind=kind, item=item, location=location, quantity=qty, message=message,
        spot=spot, address=spot.address if spot else '', movement=movement)


def _close_issues(spot, item, note, kinds=None):
    issues = ShelfIssue.objects.filter(spot=spot, item=item, status=ShelfIssue.Status.OPEN)
    if kinds:
        issues = issues.filter(kind__in=kinds)
    return issues.update(status=ShelfIssue.Status.RESOLVED, resolved_at=timezone.now(),
                         resolved_by_name='Counted', resolution_note=note)


@transaction.atomic
def count(spot, counts, *, complete=False, user=None):
    """Record what a count found on one shelf.

    Fewer than recorded: the shelf is set to the count and the difference goes
    to Not shelved (it is somewhere in the store), with a Problem. More: the
    extra comes from Not shelved; beyond what the location holds, a Problem
    says to correct the stock. `complete` ("I counted the whole shelf") also
    sets anything not listed to 0. A count supersedes the shelf's older
    Problems for those items.
    """
    spot = StorageSpot.objects.select_for_update().get(pk=spot.pk)
    _check_leaf(spot, receiving=False)
    location = spot.location
    wanted = {}
    for line in counts or []:
        item_id = str((line or {}).get('item') or (line or {}).get('item_id') or '')
        if not item_id:
            raise ShelfError('Each counted line needs an item.')
        wanted[item_id] = quantity(line.get('quantity'), label='Counted quantity', allow_zero=True)
    if complete:
        for item_id in SpotStock.objects.filter(spot=spot).values_list('item_id', flat=True):
            wanted.setdefault(str(item_id), ZERO)
    if not wanted:
        raise ShelfError('Scan or add at least one item, or tick "I counted the whole shelf" for an empty shelf.')
    items = {str(i.id): i for i in InventoryItem.objects.filter(id__in=list(wanted))}
    missing = [i for i in wanted if i not in items]
    if missing:
        raise ShelfError('One of the counted items is no longer in the inventory.')
    results = []
    for item_id in sorted(wanted):
        item = _lock_item(items[item_id])
        counted = wanted[item_id]
        row = SpotStock.objects.filter(spot=spot, item=item).first()
        recorded = row.quantity if row else ZERO
        _close_issues(spot, item, f'Closed by itself: {spot.address} was counted.')
        if counted < recorded:
            short = recorded - counted
            movement = _shelf_movement(item, location, short, user, f'Count of {spot.address}: {amount(short, item)} fewer than recorded')
            _shift_spot(spot, item, -short)
            _leg(movement, spot, item, -short)
            _issue(ShelfIssue.Kind.MISSING_FROM_SHELF, item, location, short,
                   f'{spot.address} was counted with {amount(short, item)} fewer {item.name} than recorded. '
                   f'They are now "Not shelved" -- find them, or correct the stock.',
                   spot=spot, movement=movement)
            results.append({'item': item.name, 'change': '-' + fmt(short)})
        elif counted > recorded:
            extra = counted - recorded
            free = max(ZERO, location_quantity(item, location) - shelved_quantity(item, location))
            take = min(extra, free)
            if take > 0:
                movement = _shelf_movement(item, location, take, user, f'Count of {spot.address}: {amount(take, item)} more than recorded')
                _shift_spot(spot, item, take)
                _leg(movement, spot, item, take)
            if extra > take:
                over = extra - take
                _issue(ShelfIssue.Kind.COUNT_BELOW_SHELVES, item, location, over,
                       f'{spot.address} was counted with {amount(counted, item)} of {item.name}, but the stock '
                       f'record only has room for {amount(recorded + take, item)} there. Correct the stock '
                       f'(Stock count), then count the shelf again.', spot=spot)
            results.append({'item': item.name, 'change': '+' + fmt(take)})
        else:
            results.append({'item': item.name, 'change': '0'})
    spot.last_counted_at = timezone.now()
    spot.save(update_fields=['last_counted_at', 'updated_at'])
    return {'spot': spot.address, 'lines': results}


@transaction.atomic
def report_missing(spot, item, missing, user=None):
    """A picker found less on a shelf than it says: a Problem, no stock moved."""
    missing = quantity(missing, label='How much is missing')
    row = SpotStock.objects.filter(spot=spot, item=item).first()
    recorded = row.quantity if row else ZERO
    if recorded <= 0:
        raise ShelfError(f'{spot.address} has no {item.name} recorded.')
    if missing > recorded:
        raise ShelfError(f'{spot.address} only records {amount(recorded, item)} of {item.name}.')
    return _issue(ShelfIssue.Kind.MISSING_FROM_SHELF, item, spot.location, missing,
                  f'{_user_name(user)} could not find {amount(missing, item)} of {item.name} on {spot.address}. '
                  f'Count that shelf.', spot=spot)


@transaction.atomic
def resolve_issue(issue, user=None, note=''):
    issue = ShelfIssue.objects.select_for_update().get(pk=issue.pk)
    if issue.status == ShelfIssue.Status.RESOLVED:
        return issue
    issue.status = ShelfIssue.Status.RESOLVED
    issue.resolved_at = timezone.now()
    issue.resolved_by = user if (user and getattr(user, 'is_authenticated', False)) else None
    issue.resolved_by_name = _user_name(user)
    issue.resolution_note = str(note or '').strip()[:1000]
    issue.save(update_fields=['status', 'resolved_at', 'resolved_by', 'resolved_by_name', 'resolution_note'])
    return issue


def issue_json(issue):
    return {
        'id': str(issue.id), 'kind': issue.kind, 'kind_label': issue.get_kind_display(),
        'status': issue.status, 'message': issue.message, 'quantity': fmt(issue.quantity),
        'item': _item_json(issue.item), 'location': {'id': str(issue.location_id), 'name': issue.location.name},
        'spot': str(issue.spot_id) if issue.spot_id else None, 'address': issue.address,
        'created_at': issue.created_at.isoformat(),
        'resolved_at': issue.resolved_at.isoformat() if issue.resolved_at else None,
        'resolved_by': issue.resolved_by_name, 'resolution_note': issue.resolution_note,
    }


# ---- the rule, inside every stock change -----------------------------------------

def after_stock_change(item, movement, *, from_location=None):
    """Called by InventoryService.record_movement after the location quantity
    changed, in the same transaction and under the item's row lock.

    Stock that left a location with no shelf named comes from "Not shelved"
    first. Only if the shelves would then hold more than the location does
    anything come off them -- in walking order (a stock count: back room
    first) -- with one Problem per shelf touched and one bell alert. A
    location with no shelves pays one indexed lookup.
    """
    if from_location is None or movement.movement_type == StockMovement.Type.SHELF_MOVE:
        return []
    shelved = shelved_quantity(item, from_location)
    if shelved <= 0:
        return []
    excess = shelved - max(ZERO, location_quantity(item, from_location))
    if excess <= 0:
        return []
    spots = list(StorageSpot.objects.filter(location=from_location))
    keys = _walk_keys(spots)
    rows = list(SpotStock.objects.select_for_update().filter(item=item, location=from_location).select_related('spot'))
    is_count = movement.movement_type == StockMovement.Type.ADJUSTMENT
    rows.sort(key=lambda r: keys.get(r.spot_id, ((), r.spot.address)), reverse=is_count)
    if is_count:
        # A count that lowered the stock: the back room first, then the floor.
        rows.sort(key=lambda r: r.spot.is_shop_floor)
    touched = []
    for row in rows:
        if excess <= 0:
            break
        take = min(row.quantity, excess)
        _shift_spot(row.spot, item, -take)
        _leg(movement, row.spot, item, -take, source=StockMovementSpot.Source.AUTO)
        excess -= take
        touched.append((row.spot, take))
    why = movement.get_movement_type_display().lower()
    for spot, take in touched:
        if is_count:
            _issue(ShelfIssue.Kind.COUNT_BELOW_SHELVES, item, from_location, take,
                   f'A stock count lowered {item.name} by more than was off the shelves, so '
                   f'{amount(take, item)} was taken off {spot.address}. Count that shelf.',
                   spot=spot, movement=movement)
        else:
            _issue(ShelfIssue.Kind.AUTO_TAKEN, item, from_location, take,
                   f'{amount(take, item)} of {item.name} left the stock ({why}) and the app took it off '
                   f'{spot.address}, because none was "Not shelved". Check that shelf.',
                   spot=spot, movement=movement)
    if touched:
        _alert(item, from_location)
    return touched


def _alert(item, location):
    from crm_api.models import Notification
    if Notification.objects.filter(title=ALERT_TITLE, is_read=False).exists():
        return None
    return Notification.objects.create(
        title=ALERT_TITLE, recipient_role='Owner',
        message=f'{item.name} at {location.name}: the app had to choose a shelf. See Racks & shelves > Problems.')
