"""Racks & shelves (apps/inventory/shelves.py): the one rule -- an item's
pieces on a location's shelves never add up to more than the location has --
kept by every stock change, re-checked by the database, and the screens'
flows (set up, put away, move, count, Problems) through the API."""
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import IntegrityError, InternalError, connection, transaction
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.inventory import shelves
from apps.inventory.models import (
    InventoryItem, LocationStock, ShelfIssue, SpotStock, StockLocation, StockMovement,
    StockMovementSpot, StorageSpot,
)
from apps.inventory.services import InventoryService
from crm_api.models import BoutiqueSettings, Tailor

API = '/api/inventory/shelves/'
OWNER_EMAIL = 'owner@shelves.test'


class ShelvesTestBase(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = OWNER_EMAIL
        tenant.name = 'Shelf Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(username=OWNER_EMAIL, email=OWNER_EMAIL, password='x')
        self.client = self.client_for(self.owner)
        self.store = StockLocation.objects.get(is_default=True)  # Main Store is seeded
        self.silk = InventoryItem.objects.create(item_code='SILK-1', name='Red Kanchi silk',
                                                 category='FABRIC', unit='METER', color='Red')
        self.hooks = InventoryItem.objects.create(item_code='HOOK-1', name='Gold hooks',
                                                  category='STITCHING', unit='PIECE')
        shelves.save_setup(self.store, levels=[
            {'kind': 'AREA', 'codes': ['FLOOR']},
            {'kind': 'CUPBOARD', 'prefix': 'C', 'count': 2},
            {'kind': 'SHELF', 'count': 3},
        ], is_shop_floor=True)
        shelves.save_setup(self.store, levels=[
            {'kind': 'AREA', 'codes': ['BACK']},
            {'kind': 'RACK', 'prefix': 'R', 'count': 1},
            {'kind': 'SHELF', 'count': 2},
        ], is_shop_floor=False)

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def spot(self, address):
        return StorageSpot.objects.get(location=self.store, address=address)

    def on(self, address, item):
        row = SpotStock.objects.filter(spot=self.spot(address), item=item).first()
        return row.quantity if row else Decimal('0')

    def stock_in(self, item, qty):
        InventoryService.stock_in(item, qty, to_location=self.store)
        item.refresh_from_db()


class SetupTests(ShelvesTestBase):

    def test_describe_the_store_makes_the_tree_and_only_adds_on_a_second_go(self):
        addresses = set(StorageSpot.objects.filter(location=self.store).values_list('address', flat=True))
        self.assertIn('FLOOR-C1-1', addresses)
        self.assertIn('FLOOR-C2-3', addresses)
        self.assertIn('BACK-R1-2', addresses)
        self.assertFalse(self.spot('BACK-R1-1').is_shop_floor)
        before = StorageSpot.objects.count()
        preview = shelves.plan_setup(self.store, levels=[
            {'kind': 'AREA', 'codes': ['FLOOR']}, {'kind': 'CUPBOARD', 'prefix': 'C', 'count': 3},
            {'kind': 'SHELF', 'counts': [3, 3, 2]}])
        self.assertEqual(preview['new'], 3, 'only C3 and its two shelves are new')
        self.assertEqual(StorageSpot.objects.count(), before, 'a preview makes nothing')
        shelves.save_setup(self.store, levels=[
            {'kind': 'AREA', 'codes': ['FLOOR']}, {'kind': 'CUPBOARD', 'prefix': 'C', 'count': 3},
            {'kind': 'SHELF', 'counts': [3, 3, 2]}])
        self.assertEqual(StorageSpot.objects.count(), before + 3)

    def test_nothing_goes_inside_a_shelf_that_holds_stock(self):
        self.stock_in(self.silk, 5)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 2)
        with self.assertRaisesMessage(shelves.ShelfError, 'holds stock'):
            shelves.create_spot(self.store, parent=self.spot('FLOOR-C1-1'), kind='BOX', code='A')

    def test_rename_rewrites_the_branch_and_keeps_the_label(self):
        cupboard = self.spot('FLOOR-C1')
        label = self.spot('FLOOR-C1-2').label_code
        shelves.update_spot(cupboard, {'code': 'SILK'})
        self.assertTrue(StorageSpot.objects.filter(address='FLOOR-SILK-2', label_code=label).exists())
        self.assertEqual(shelves.scan(f'SEZ:{label}').address, 'FLOOR-SILK-2')

    def test_scan_by_typed_address(self):
        self.assertEqual(shelves.scan('floor c2 1').address, 'FLOOR-C2-1')
        self.assertEqual(shelves.scan('r1 2', self.store).address, 'BACK-R1-2')

    def test_delete_only_an_empty_leaf(self):
        with self.assertRaisesMessage(shelves.ShelfError, 'inside it'):
            shelves.delete_spot(self.spot('FLOOR-C1'))
        self.stock_in(self.silk, 1)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-3'), 1)
        with self.assertRaisesMessage(shelves.ShelfError, 'still holds stock'):
            shelves.delete_spot(self.spot('FLOOR-C1-3'))
        shelves.delete_spot(self.spot('FLOOR-C2-3'))
        self.assertFalse(StorageSpot.objects.filter(address='FLOOR-C2-3').exists())


class RuleTests(ShelvesTestBase):

    def test_put_away_only_what_is_not_shelved(self):
        self.stock_in(self.silk, Decimal('8.5'))
        shelves.put_away(self.store, self.silk, self.spot('BACK-R1-1'), 6)
        self.assertEqual(shelves.not_shelved(self.silk, self.store), Decimal('2.5'))
        with self.assertRaisesMessage(shelves.ShelfError, 'Only 2.5 m of Red Kanchi silk are not on a shelf'):
            shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 3)
        with self.assertRaisesMessage(shelves.ShelfError, 'has no Gold hooks'):
            shelves.put_away(self.store, self.hooks, self.spot('FLOOR-C1-1'), 1)

    def test_move_between_shelves_keeps_the_location_quantity(self):
        self.stock_in(self.silk, 8)
        shelves.put_away(self.store, self.silk, self.spot('BACK-R1-1'), 6)
        shelves.move(self.store, self.silk, 2, from_spot=self.spot('BACK-R1-1'), to_spot=self.spot('FLOOR-C1-1'))
        self.assertEqual(self.on('BACK-R1-1', self.silk), 4)
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 2)
        self.silk.refresh_from_db()
        self.assertEqual(self.silk.current_stock, 8, 'a shelf move never changes stock')
        with self.assertRaisesMessage(shelves.ShelfError, 'Only 2 m of Red Kanchi silk are on FLOOR-C1-1'):
            shelves.move(self.store, self.silk, 3, from_spot=self.spot('FLOOR-C1-1'), to_spot=self.spot('FLOOR-C1-2'))

    def test_stock_leaving_takes_not_shelved_first(self):
        self.stock_in(self.silk, 8)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 5)
        InventoryService.issue(self.silk, 3, from_location=self.store)
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 5, 'the 3 not-shelved metres went first')
        self.assertFalse(ShelfIssue.objects.exists())

    def test_stock_leaving_beyond_not_shelved_comes_off_shelves_in_walk_order_with_a_problem(self):
        self.stock_in(self.silk, 8)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 2)
        shelves.put_away(self.store, self.silk, self.spot('BACK-R1-1'), 5)
        movement = InventoryService.issue(self.silk, 4, from_location=self.store)
        # 1 m not shelved, then 2 m off FLOOR-C1-1 (first in the walk), then 1 m off BACK-R1-1.
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 0)
        self.assertEqual(self.on('BACK-R1-1', self.silk), 4)
        legs = StockMovementSpot.objects.filter(movement=movement)
        self.assertEqual(sorted((l.address, l.quantity) for l in legs),
                         [('BACK-R1-1', Decimal('-1.000')), ('FLOOR-C1-1', Decimal('-2.000'))])
        self.assertTrue(all(l.source == 'AUTO' for l in legs))
        issues = ShelfIssue.objects.filter(kind=ShelfIssue.Kind.AUTO_TAKEN)
        self.assertEqual(issues.count(), 2)
        self.assertIn('Check that shelf', issues.first().message)
        self.assertLessEqual(shelves.shelved_quantity(self.silk, self.store),
                             LocationStock.objects.get(item=self.silk, location=self.store).quantity)

    def test_a_stock_count_lowering_takes_the_back_room_first(self):
        self.stock_in(self.silk, 6)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 3)
        shelves.put_away(self.store, self.silk, self.spot('BACK-R1-1'), 3)
        InventoryService.adjust(self.silk, 4, from_location=self.store)
        self.assertEqual(self.on('BACK-R1-1', self.silk), 1)
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 3)
        self.assertEqual(ShelfIssue.objects.get().kind, ShelfIssue.Kind.COUNT_BELOW_SHELVES)

    def test_transfer_out_follows_the_rule(self):
        workshop = StockLocation.objects.create(name='Workshop', kind='WORKSHOP')
        self.stock_in(self.silk, 4)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C2-1'), 4)
        InventoryService.transfer(self.silk, 3, from_location=self.store, to_location=workshop)
        self.assertEqual(self.on('FLOOR-C2-1', self.silk), 1)

    def test_a_location_without_shelves_is_untouched(self):
        workshop = StockLocation.objects.create(name='Workshop', kind='WORKSHOP')
        InventoryService.stock_in(self.hooks, 10, to_location=workshop)
        InventoryService.issue(self.hooks, 4, from_location=workshop)
        self.assertFalse(StockMovementSpot.objects.exists())
        self.assertFalse(ShelfIssue.objects.exists())

    def test_the_database_refuses_shelves_above_the_location(self):
        self.stock_in(self.silk, 2)
        with self.assertRaises((IntegrityError, InternalError)):
            with transaction.atomic():
                connection.cursor().execute('SET CONSTRAINTS ALL IMMEDIATE')
                SpotStock.objects.create(spot=self.spot('FLOOR-C1-1'), item=self.silk,
                                         location=self.store, quantity=5)


class ViewInsideTests(ShelvesTestBase):

    def test_view_lists_everything_inside_a_rack_shelf_by_shelf(self):
        self.stock_in(self.silk, 10)
        self.stock_in(self.hooks, 40)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), '6')
        shelves.put_away(self.store, self.hooks, self.spot('FLOOR-C1-2'), '40')
        cupboard = self.spot('FLOOR-C1')
        res = self.client.get(f'{API}spots/{cupboard.id}/')
        self.assertEqual(res.status_code, 200)
        inside = res.json()['inside']
        self.assertEqual([g['spot']['address'] for g in inside], ['FLOOR-C1-1', 'FLOOR-C1-2'])
        self.assertEqual(inside[0]['contents'][0]['item']['name'], 'Red Kanchi silk')
        self.assertEqual(inside[0]['contents'][0]['quantity'], '6')
        # FLOOR-C2 is a different cupboard: nothing of C1 shows there.
        other = self.spot('FLOOR-C2')
        self.assertEqual(self.client.get(f'{API}spots/{other.id}/').json()['inside'], [])


class CountTests(ShelvesTestBase):

    def setUp(self):
        super().setUp()
        self.stock_in(self.silk, 10)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 6)

    def test_fewer_than_recorded_goes_to_not_shelved_with_a_problem(self):
        shelves.count(self.spot('FLOOR-C1-1'), [{'item': str(self.silk.id), 'quantity': 4}])
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 4)
        self.assertEqual(shelves.not_shelved(self.silk, self.store), 6)
        self.assertEqual(ShelfIssue.objects.get().kind, ShelfIssue.Kind.MISSING_FROM_SHELF)
        self.assertIsNotNone(self.spot('FLOOR-C1-1').last_counted_at)

    def test_more_than_recorded_comes_from_not_shelved_then_a_problem(self):
        shelves.count(self.spot('FLOOR-C1-1'), [{'item': str(self.silk.id), 'quantity': 12}])
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 10, 'only the 4 not-shelved metres exist')
        self.assertEqual(ShelfIssue.objects.get().kind, ShelfIssue.Kind.COUNT_BELOW_SHELVES)

    def test_a_matching_count_closes_old_problems(self):
        shelves.report_missing(self.spot('FLOOR-C1-1'), self.silk, 1)
        shelves.count(self.spot('FLOOR-C1-1'), [{'item': str(self.silk.id), 'quantity': 6}])
        self.assertFalse(ShelfIssue.objects.filter(status='OPEN').exists())

    def test_whole_shelf_count_sets_unlisted_items_to_zero(self):
        self.stock_in(self.hooks, 20)
        shelves.put_away(self.store, self.hooks, self.spot('FLOOR-C1-1'), 20)
        shelves.count(self.spot('FLOOR-C1-1'), [{'item': str(self.silk.id), 'quantity': 6}], complete=True)
        self.assertEqual(self.on('FLOOR-C1-1', self.hooks), 0)
        self.assertEqual(shelves.not_shelved(self.hooks, self.store), 20)


class ApiTests(ShelvesTestBase):

    def test_owner_flow_through_the_api(self):
        self.stock_in(self.silk, 5)
        tree = self.client.get(f'{API}tree/', {'location': str(self.store.id)})
        self.assertEqual(tree.status_code, 200, tree.data)
        self.assertTrue(any(s['address'] == 'FLOOR-C1-1' and s['is_leaf'] for s in tree.data))
        waiting = self.client.get(f'{API}not-shelved/', {'location': str(self.store.id)})
        self.assertEqual(waiting.data[0]['quantity'], '5')
        res = self.client.post(f'{API}put-away/', {'location': str(self.store.id), 'item': str(self.silk.id),
                                                   'spot': str(self.spot('FLOOR-C1-1').id), 'quantity': 3},
                               format='json')
        self.assertEqual(res.status_code, 200, res.data)
        found = self.client.get(f'{API}find/', {'q': 'kanchi'})
        place = found.data[0]['locations'][0]
        self.assertEqual(place['shelves'][0]['spot']['address'], 'FLOOR-C1-1')
        self.assertEqual(place['not_shelved'], '2')
        over = self.client.post(f'{API}put-away/', {'location': str(self.store.id), 'item': str(self.silk.id),
                                                    'spot': str(self.spot('FLOOR-C1-2').id), 'quantity': 9},
                                format='json')
        self.assertEqual(over.status_code, 400)
        self.assertIn('not on a shelf', over.data['error'])
        scan = self.client.get(f'{API}scan/', {'code': 'c1 1'})
        self.assertEqual(scan.data['address'], 'FLOOR-C1-1')
        self.assertEqual(scan.data['contents'][0]['quantity'], '3')

    def test_setup_preview_then_save(self):
        body = {'location': str(self.store.id), 'is_shop_floor': True,
                'levels': [{'kind': 'AREA', 'codes': ['WINDOW']}, {'kind': 'DISPLAY', 'count': 2}]}
        preview = self.client.post(f'{API}setup/', {**body, 'preview': True}, format='json')
        self.assertEqual(preview.data['new'], 3)
        self.assertFalse(StorageSpot.objects.filter(address='WINDOW').exists())
        saved = self.client.post(f'{API}setup/', {**body, 'preview': False}, format='json')
        self.assertEqual(saved.data['created'], 3)

    def test_a_tailor_may_look_but_not_move_or_set_up(self):
        tailor_user = User.objects.create_user(username='t@shelves.test', email='t@shelves.test', password='x')
        Tailor.objects.create(name='Abhi', specialty='Stitching', role='Tailor', user=tailor_user)
        client = self.client_for(tailor_user)
        self.stock_in(self.silk, 2)
        moved = client.post(f'{API}put-away/', {'location': str(self.store.id), 'item': str(self.silk.id),
                                                'spot': str(self.spot('FLOOR-C1-1').id), 'quantity': 1},
                            format='json')
        self.assertEqual(moved.status_code, 403)

    def test_a_role_handed_stock_work_may_move_but_not_set_up(self):
        user = User.objects.create_user(username='l@shelves.test', email='l@shelves.test', password='x')
        Tailor.objects.create(name='Ravi', specialty='Logistics', role='Logistics Staff', user=user)
        config, _ = BoutiqueSettings.objects.get_or_create(id=1)
        config.admin_access = {'roles': {'Logistics Staff': ['inventory.stock']}}
        config.save()
        client = self.client_for(user)
        self.stock_in(self.silk, 2)
        moved = client.post(f'{API}put-away/', {'location': str(self.store.id), 'item': str(self.silk.id),
                                                'spot': str(self.spot('FLOOR-C1-1').id), 'quantity': 1},
                            format='json')
        self.assertEqual(moved.status_code, 200, moved.data)
        setup = client.post(f'{API}setup/', {'location': str(self.store.id), 'preview': False,
                                             'levels': [{'kind': 'AREA', 'codes': ['X']}]}, format='json')
        self.assertEqual(setup.status_code, 403)

    def test_problems_list_and_mark_fixed(self):
        self.stock_in(self.silk, 3)
        shelves.put_away(self.store, self.silk, self.spot('FLOOR-C1-1'), 3)
        InventoryService.issue(self.silk, 1, from_location=self.store)
        listed = self.client.get(f'{API}issues/')
        self.assertEqual(listed.data['open_count'], 1)
        fixed = self.client.post(f"{API}issues/{listed.data['results'][0]['id']}/resolve/",
                                 {'note': 'Recounted'}, format='json')
        self.assertEqual(fixed.data['status'], 'RESOLVED')
        self.assertEqual(self.on('FLOOR-C1-1', self.silk), 2, 'marking fixed never moves stock')
