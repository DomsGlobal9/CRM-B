"""Racks & shelves API (/api/inventory/shelves/...). The rules live in
apps/inventory/shelves.py; this only reads the request, checks who may do it,
and turns a ShelfError into a sentence the screen can show.

Who may do what (the owner always may; anyone else by the inventory work the
owner handed their role in Roles & Permissions, core/admin_access.py):
  view   -- where is it, the rack tree, Not shelved, Problems: any inventory task
  move   -- put away, move, count, report missing: inventory > stock or transfer
  manage -- set up racks, labels, edit / delete, mark a Problem fixed: inventory > items
Shelves never show a price.
"""
from django.db import Error as DatabaseError
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.admin_access import ADMIN_TASKS, holds
from core.permissions import ModuleAccess
from core.roles import OWNER, resolve_user_role

from . import shelves
from .models import InventoryItem, ShelfIssue, StockLocation, StorageSpot

VIEW_TASKS = tuple(f'inventory.{t}' for t in ADMIN_TASKS['inventory'])
MOVE_TASKS = ('inventory.stock', 'inventory.transfer')
MANAGE_TASKS = ('inventory.items',)


class ShelfPermission(ModuleAccess):
    message = 'Your role does not permit this on Racks & shelves.'

    def has_role_permission(self, request, view):
        role = resolve_user_role(request.user)
        if role is None:
            return False
        if role == OWNER:
            return True
        need = getattr(view, 'shelf_needs', {}).get(getattr(view, 'action', None), 'manage')
        tasks = {'view': VIEW_TASKS, 'move': MOVE_TASKS}.get(need, MANAGE_TASKS)
        return holds(request.user, *tasks)


def _refused(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': message, 'detail': message}, status=code)


def _guarded(work):
    """Run a shelf change; a ShelfError or the database's shelf rule becomes a sentence."""
    try:
        return Response(work())
    except shelves.ShelfError as exc:
        return _refused(str(exc))
    except DatabaseError as exc:
        if 'shelf_stock_exceeds_location' in str(exc):
            return _refused('That would put more on the shelves than the stock record has. '
                            'Nothing was changed.', status.HTTP_409_CONFLICT)
        raise


def _location(request, required=True):
    raw = request.query_params.get('location') or request.data.get('location')
    if not raw:
        if required:
            raise shelves.ShelfError('Choose a location.')
        return None
    try:
        return StockLocation.objects.get(pk=raw)
    except (StockLocation.DoesNotExist, ValueError, Exception):
        raise shelves.ShelfError('That location was not found.')


def _item(raw):
    try:
        return InventoryItem.objects.get(pk=raw)
    except Exception:
        raise shelves.ShelfError('That item was not found.')


def _spot(raw, *, label='shelf'):
    if raw in (None, ''):
        return None
    try:
        return StorageSpot.objects.select_related('location').get(pk=raw)
    except Exception:
        raise shelves.ShelfError(f'That {label} was not found.')


class ShelfViewSet(viewsets.ViewSet):
    permission_classes = [ShelfPermission]
    shelf_needs = {
        'tree': 'view', 'find': 'view', 'item': 'view', 'not_shelved': 'view', 'scan': 'view',
        'put_away': 'move', 'move': 'move', 'move_all': 'move', 'report_missing': 'move',
        'setup': 'manage', 'labels': 'manage',
    }

    @action(detail=False, methods=['GET'])
    def tree(self, request):
        return _guarded(lambda: shelves.tree(_location(request)))

    @action(detail=False, methods=['GET'])
    def find(self, request):
        return _guarded(lambda: shelves.find(request.query_params.get('q'), _location(request, required=False)))

    @action(detail=False, methods=['GET'], url_path=r'item/(?P<item_id>[^/.]+)')
    def item(self, request, item_id=None):
        return _guarded(lambda: shelves.whereabouts(_item(item_id), _location(request, required=False)))

    @action(detail=False, methods=['GET'], url_path='not-shelved')
    def not_shelved(self, request):
        return _guarded(lambda: shelves.not_shelved_list(_location(request)))

    @action(detail=False, methods=['GET'])
    def scan(self, request):
        def work():
            spot = shelves.scan(request.query_params.get('code'), _location(request, required=False))
            return {**shelves.spot_json(spot, is_leaf=not spot.children.exists()),
                    'location_name': spot.location.name, 'contents': shelves.spot_contents(spot)}
        return _guarded(work)

    @action(detail=False, methods=['POST'])
    def setup(self, request):
        def work():
            location = _location(request)
            parent = _spot(request.data.get('parent'), label='rack')
            levels = request.data.get('levels')
            shop_floor = request.data.get('is_shop_floor', True) not in (False, 'false', 0)
            if request.data.get('preview', True) not in (False, 'false', 0):
                return shelves.plan_setup(location, parent=parent, levels=levels, is_shop_floor=shop_floor)
            return shelves.save_setup(location, parent=parent, levels=levels, is_shop_floor=shop_floor)
        return _guarded(work)

    @action(detail=False, methods=['GET'])
    def labels(self, request):
        ids = [i for i in (request.query_params.get('spots') or '').split(',') if i]
        return _guarded(lambda: shelves.labels(_location(request), ids or None))

    @action(detail=False, methods=['POST'], url_path='put-away')
    def put_away(self, request):
        def work():
            spot = _spot(request.data.get('spot'))
            if spot is None:
                raise shelves.ShelfError('Scan or choose the shelf it goes on.')
            return shelves.put_away(_location(request), _item(request.data.get('item')), spot,
                                    request.data.get('quantity'), user=request.user)
        return _guarded(work)

    @action(detail=False, methods=['POST'])
    def move(self, request):
        return _guarded(lambda: shelves.move(
            _location(request), _item(request.data.get('item')), request.data.get('quantity'),
            from_spot=_spot(request.data.get('from_spot')), to_spot=_spot(request.data.get('to_spot')),
            user=request.user, note=str(request.data.get('note') or '')[:200]))

    @action(detail=False, methods=['POST'], url_path='move-all')
    def move_all(self, request):
        def work():
            source, target = _spot(request.data.get('from_spot')), _spot(request.data.get('to_spot'))
            if source is None or target is None:
                raise shelves.ShelfError('Choose the shelf to empty and the shelf it goes to.')
            return shelves.move_all(source, target, user=request.user)
        return _guarded(work)

    @action(detail=False, methods=['POST'], url_path='report-missing')
    def report_missing(self, request):
        def work():
            spot = _spot(request.data.get('spot'))
            if spot is None:
                raise shelves.ShelfError('Scan or choose the shelf.')
            issue = shelves.report_missing(spot, _item(request.data.get('item')),
                                           request.data.get('missing'), user=request.user)
            return shelves.issue_json(issue)
        return _guarded(work)


class StorageSpotViewSet(viewsets.ViewSet):
    """One spot: create, open (contents + history), edit, delete, count."""
    permission_classes = [ShelfPermission]
    shelf_needs = {'retrieve': 'view', 'history': 'view', 'count': 'move',
                   'create': 'manage', 'partial_update': 'manage', 'destroy': 'manage'}

    def create(self, request):
        def work():
            location = _location(request)
            spot = shelves.create_spot(
                location, parent=_spot(request.data.get('parent'), label='rack'),
                kind=request.data.get('kind') or 'SHELF', code=request.data.get('code'),
                name=request.data.get('name', ''), walk_order=request.data.get('walk_order'),
                is_shop_floor=request.data.get('is_shop_floor'), capacity=request.data.get('capacity'))
            return shelves.spot_json(spot, is_leaf=True, total=0, items=0)
        return _guarded(work)

    def retrieve(self, request, pk=None):
        def work():
            spot = _spot(pk)
            return {**shelves.spot_json(spot, is_leaf=not spot.children.exists()),
                    'location_name': spot.location.name, 'contents': shelves.spot_contents(spot)}
        return _guarded(work)

    def partial_update(self, request, pk=None):
        def work():
            spot = shelves.update_spot(_spot(pk), request.data)
            return shelves.spot_json(spot, is_leaf=not spot.children.exists())
        return _guarded(work)

    def destroy(self, request, pk=None):
        def work():
            shelves.delete_spot(_spot(pk))
            return {'deleted': True}
        return _guarded(work)

    @action(detail=True, methods=['GET'])
    def history(self, request, pk=None):
        return _guarded(lambda: shelves.spot_history(_spot(pk)))

    @action(detail=True, methods=['POST'])
    def count(self, request, pk=None):
        return _guarded(lambda: shelves.count(
            _spot(pk), request.data.get('counts') or [],
            complete=request.data.get('complete') in (True, 'true', 1), user=request.user))


class ShelfIssueViewSet(viewsets.ViewSet):
    """Racks & shelves > Problems."""
    permission_classes = [ShelfPermission]
    shelf_needs = {'list': 'view', 'resolve': 'manage'}

    def list(self, request):
        def work():
            wanted = (request.query_params.get('status') or 'OPEN').upper()
            issues = ShelfIssue.objects.select_related('item', 'location')
            if wanted in ShelfIssue.Status.values:
                issues = issues.filter(status=wanted)
            location = _location(request, required=False)
            if location is not None:
                issues = issues.filter(location=location)
            return {'open_count': ShelfIssue.objects.filter(
                        status=ShelfIssue.Status.OPEN,
                        **({'location': location} if location else {})).count(),
                    'results': [shelves.issue_json(i) for i in issues[:200]]}
        return _guarded(work)

    @action(detail=True, methods=['POST'])
    def resolve(self, request, pk=None):
        def work():
            issue = get_object_or_404(ShelfIssue, pk=pk)
            return shelves.issue_json(shelves.resolve_issue(issue, request.user, request.data.get('note', '')))
        return _guarded(work)
