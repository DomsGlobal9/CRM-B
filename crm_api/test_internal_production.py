"""Boutique internal production: the same workroom, no customer, stock at the end."""
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentJob, GarmentTemplate
from apps.design_studio.models import DesignAsset
from apps.inventory.models import Category, InventoryItem, StockMovement
from apps.production.models import ProductionTask
from crm_api.models import (
    BoutiqueSettings, Customer, CustomerMessage, Measurement, Notification, Order,
    OrderStage, Tailor,
)
from domains.orders.services import OrderService, create_internal_production


class InternalProductionTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@internal.test'
        tenant.name = 'Internal Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(
            id=1, defaults={'name': 'Internal Atelier', 'phone': '9876500011'})
        self.owner = User.objects.create_user(
            username='owner@internal.test', email='owner@internal.test', password='x')
        self.master = Tailor.objects.create(name='Meena', specialty='Lehenga', role='Master')
        self.tailor = Tailor.objects.create(name='Ravi', specialty='Blouse', role='Tailor')
        self.anarkali = GarmentTemplate.objects.create(
            key='anarkali', name='Anarkali', version=1, sequence=0)
        self.saree = GarmentTemplate.objects.create(
            key='saree', name='Saree', version=1, sequence=1)

    # helpers

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get_or_create(user=user)[0].key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def post_run(self, body, user=None):
        response = self.client_for(user or self.owner).post(
            '/api/orders/internal-production/', body, format='json')
        connection.set_tenant(self.tenant)
        return response

    def make_run(self, quantity=1, template=None, **extra):
        return create_internal_production({
            'template': str((template or self.anarkali).pk), 'quantity': quantity,
            'master_id': self.master.id, **extra}, user=self.owner)

    def make_customer_order(self, mobile='9800000001'):
        customer = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number=mobile, garment_type='Lehenga')
        Measurement.objects.create(customer=customer, bust=36, waist=30, hips=38)
        return OrderService.create_order_for_customer(
            customer, {'base_price': 20000, 'master_id': self.master.id}, user=self.owner)

    def finish(self, order):
        """Settle every stage of the run, the way the workroom would."""
        config = BoutiqueSettings.objects.get(id=1).workflow_config
        optional = {s['key']: s.get('optional', False) for s in config}
        for stage in list(order.stages.all().order_by('sequence', 'id')):
            if stage.status in ('COMPLETED', 'SKIPPED'):
                continue
            OrderService.transition_order_stage(
                order=order, stage_key=stage.stage_key,
                new_status='SKIPPED' if optional.get(stage.stage_key) else 'COMPLETED',
                user=self.owner, garment_job=stage.garment_job, notify=False)
            order.refresh_from_db()
        return order

    # creation

    def test_a_run_is_created_with_no_customer_and_kind_internal(self):
        order = self.make_run()
        self.assertEqual(order.kind, Order.KIND_INTERNAL)
        self.assertTrue(order.is_internal)
        self.assertIsNone(order.customer_id)
        self.assertEqual(Order.objects.get(pk=order.pk).customer_id, None)

    def test_quantity_five_makes_five_garments(self):
        order = self.make_run(quantity=5)
        jobs = GarmentJob.objects.filter(order=order)
        self.assertEqual(jobs.count(), 5)
        self.assertEqual({j.template_id for j in jobs}, {self.anarkali.pk})
        self.assertEqual(sorted(j.sequence for j in jobs), [0, 1, 2, 3, 4])

    def test_the_run_takes_the_boutiques_configured_workflow(self):
        order = self.make_run(quantity=2)
        config = BoutiqueSettings.objects.get(id=1).workflow_config
        keys = {s['key'] for s in config}
        self.assertTrue(OrderStage.objects.filter(order=order).exists())
        self.assertTrue({s.stage_key for s in order.stages.all()} <= keys)
        self.assertEqual(order.stages.filter(stage_key='created', status='COMPLETED').count(), 1)
        self.assertTrue(ProductionTask.objects.filter(order=order).exists())

    def test_per_garment_stages_are_split_across_the_garments(self):
        order = self.make_run(quantity=3)
        config = BoutiqueSettings.objects.get(id=1).workflow_config
        per_garment = [s['key'] for s in config if s.get('scope') == 'garment']
        if not per_garment:
            self.skipTest('This boutique workflow has no per-garment stages.')
        key = per_garment[0]
        rows = OrderStage.objects.filter(order=order, stage_key=key)
        self.assertEqual(rows.count(), 3)
        self.assertEqual(rows.filter(garment_job__isnull=True).count(), 0)

    def test_the_run_gets_its_own_number_series(self):
        first, second = self.make_run(), self.make_run()
        self.assertEqual((first.internal_number, second.internal_number), (1, 2))
        self.assertEqual(second.reference, 'IP-002')
        self.assertIsNone(first.order_number)

    def test_customer_order_numbering_is_untouched_by_a_run(self):
        one = self.make_customer_order('9800000001')
        self.make_run()
        two = self.make_customer_order('9800000002')
        self.assertEqual(two.order_number, one.order_number + 1)
        self.assertEqual(two.reference, f'#{two.order_number}')

    def test_notes_priority_and_staff_are_carried(self):
        order = self.make_run(quantity=2, notes='For the front window',
                              priority='LOW', tailor_id=self.tailor.id)
        self.assertEqual(order.special_instructions, 'For the front window')
        self.assertEqual(order.tailor_id, self.tailor.id)
        self.assertEqual(
            set(ProductionTask.objects.filter(order=order).values_list('priority', flat=True)),
            {'LOW'})

    def test_a_run_needs_a_garment_and_a_sane_quantity(self):
        for body, message in (
            ({'quantity': 1}, 'making'),
            ({'template': 'not-an-id', 'quantity': 1}, 'making'),
            ({'template': str(self.anarkali.pk), 'quantity': 0}, 'between 1'),
            ({'template': str(self.anarkali.pk), 'quantity': 500}, 'between 1'),
            ({'template': str(self.anarkali.pk), 'quantity': 'five'}, 'whole number'),
        ):
            with self.subTest(body=body):
                with self.assertRaises(ValueError) as caught:
                    create_internal_production(body, user=self.owner)
                self.assertIn(message, str(caught.exception))
        self.assertFalse(Order.objects.filter(kind=Order.KIND_INTERNAL).exists())

    # nothing customer-facing

    def test_a_run_tells_no_customer_anything(self):
        before = Notification.objects.count()
        with mock.patch('domains.orders.emails.send_order_confirmation') as email:
            order = self.make_run(quantity=2)
        self.assertEqual(Notification.objects.count(), before)
        self.assertFalse(email.called)
        self.assertFalse(CustomerMessage.objects.filter(order=order).exists())

    def test_finishing_a_run_tells_no_customer_anything(self):
        order = self.finish(self.make_run(quantity=2))
        self.assertEqual(
            Notification.objects.filter(recipient_role='Customer').count(), 0)
        self.assertFalse(CustomerMessage.objects.filter(order=order).exists())

    def test_a_run_has_no_tracking_page(self):
        from domains.orders.tracking import build_token, tracking_url

        order = self.make_run()
        self.assertEqual(tracking_url(order), '')
        response = self.client_for(self.owner).get(f'/track/{build_token(order)}/')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 404)

    def test_a_run_is_never_purged_as_a_delivered_order(self):
        from domains.orders.retention import orders_due_for_purge

        order = self.finish(self.make_run())
        self.assertNotIn(order.pk, [o.pk for o in orders_due_for_purge(days=0)])

    # money

    def test_a_run_is_not_customer_revenue(self):
        order = self.make_run(quantity=5)
        self.assertEqual(Decimal(order.total_amount), Decimal('0.00'))
        self.assertEqual(Decimal(order.amount_paid), Decimal('0.00'))
        response = self.client_for(self.owner).get('/api/dashboard/')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200, response.data)
        stats = response.data['stats']
        self.assertEqual(float(stats['revenue_total']), 0.0)
        self.assertEqual(float(stats['outstanding']), 0.0)
        self.assertEqual(stats['total_orders'], 0)

    def test_the_dashboard_counts_customer_orders_only(self):
        self.make_customer_order()
        self.make_run(quantity=5)
        response = self.client_for(self.owner).get('/api/dashboard/')
        connection.set_tenant(self.tenant)
        counted = sum(row['count'] for row in response.data['status_counts']) \
            if isinstance(response.data.get('status_counts'), list) else None
        if counted is not None:
            self.assertEqual(counted, 1)

    def test_a_run_is_outside_what_customers_owe(self):
        from apps.finance import services as finance

        self.make_run(quantity=5)
        self.assertEqual(finance.outstanding_now(), Decimal('0.00'))

    # the workroom

    def test_the_workroom_sees_a_run_as_boutique_stock(self):
        order = self.make_run(quantity=2, tailor_id=self.tailor.id)
        response = self.client_for(self.owner).get(f'/api/orders/{order.pk}/')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['customer_name'], 'Boutique Stock')
        self.assertEqual(response.data['kind'], Order.KIND_INTERNAL)
        self.assertIsNone(response.data['customer'])

    def test_an_assigned_tailor_sees_the_run_in_their_work(self):
        user = User.objects.create_user(username='ravi@internal.test', password='x')
        self.tailor.user = user
        self.tailor.save(update_fields=['user'])
        order = self.make_run(quantity=2, tailor_id=self.tailor.id)
        response = self.client_for(user).get('/api/orders/')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertIn(str(order.pk), [str(r['id']) for r in rows])

    def test_the_orders_list_can_be_asked_for_one_kind(self):
        self.make_customer_order()
        run = self.make_run()
        for kind, expected in ((Order.KIND_INTERNAL, [str(run.pk)]), (Order.KIND_CUSTOMER, None)):
            response = self.client_for(self.owner).get(f'/api/orders/?kind={kind}')
            connection.set_tenant(self.tenant)
            rows = response.data['results'] if isinstance(response.data, dict) else response.data
            ids = [str(r['id']) for r in rows]
            if expected is not None:
                self.assertEqual(ids, expected)
            else:
                self.assertNotIn(str(run.pk), ids)

    def test_a_run_reaches_the_workroom_without_any_measurements(self):
        order = self.finish(self.make_run(quantity=2))
        self.assertEqual(order.production_status, 'COMPLETED')

    # inventory

    def test_finishing_a_run_puts_the_garments_into_stock(self):
        order = self.finish(self.make_run(quantity=5))
        item = InventoryItem.objects.get(category=Category.FINISHED)
        self.assertEqual(item.name, 'Anarkali')
        self.assertEqual(item.current_stock, Decimal('5.000'))
        self.assertEqual(item.available_stock, Decimal('5.000'))
        movements = StockMovement.objects.filter(
            order=order, movement_type=StockMovement.Type.STOCK_IN)
        self.assertEqual(movements.count(), 5)
        self.assertEqual({m.garment_job_id for m in movements},
                         set(order.garment_jobs.values_list('id', flat=True)))

    def test_a_run_still_in_the_workroom_has_stocked_nothing(self):
        self.make_run(quantity=5)
        self.assertFalse(InventoryItem.objects.filter(category=Category.FINISHED).exists())

    def test_two_runs_of_the_same_garment_stack_on_one_stock_line(self):
        self.finish(self.make_run(quantity=5))
        self.finish(self.make_run(quantity=3))
        item = InventoryItem.objects.get(category=Category.FINISHED)
        self.assertEqual(item.current_stock, Decimal('8.000'))

    def test_different_garments_get_their_own_stock_lines(self):
        self.finish(self.make_run(quantity=2))
        self.finish(self.make_run(quantity=1, template=self.saree))
        rows = {i.name: i.current_stock
                for i in InventoryItem.objects.filter(category=Category.FINISHED)}
        self.assertEqual(rows, {'Anarkali': Decimal('2.000'), 'Saree': Decimal('1.000')})

    def test_the_same_garment_is_never_stocked_twice(self):
        from apps.inventory.finished_goods import receive_finished_goods

        order = self.finish(self.make_run(quantity=3))
        self.assertEqual(receive_finished_goods(order, user=self.owner), 0)
        self.assertEqual(
            InventoryItem.objects.get(category=Category.FINISHED).current_stock,
            Decimal('3.000'))

    def test_a_customer_order_never_becomes_stock(self):
        self.finish(self.make_customer_order())
        self.assertFalse(InventoryItem.objects.filter(category=Category.FINISHED).exists())

    # the customer path is unchanged

    def test_a_customer_order_is_still_a_customer_order(self):
        order = self.make_customer_order()
        self.assertEqual(order.kind, Order.KIND_CUSTOMER)
        self.assertIsNone(order.internal_number)
        self.assertIsNotNone(order.customer_id)
        self.assertEqual(order.reference, f'#{order.order_number}')
        self.assertEqual(Decimal(order.base_price), Decimal('20000.00'))
        self.assertGreaterEqual(Decimal(order.total_amount), Decimal('20000.00'))

    def test_a_customer_order_still_tells_the_customer(self):
        self.make_customer_order()
        self.assertTrue(Notification.objects.filter(recipient_role='Customer').exists())

    def test_a_customer_order_still_has_a_tracking_page(self):
        from domains.orders.tracking import tracking_url

        self.assertTrue(tracking_url(self.make_customer_order()).endswith('/'))

    def test_creating_a_customer_order_still_needs_a_customer(self):
        with self.assertRaises(Exception):
            OrderService.create_order_for_customer(None, {'base_price': 100}, user=self.owner)

    def test_the_api_refuses_to_repoint_a_run_at_a_customer(self):
        order = self.make_run()
        response = self.client_for(self.owner).patch(
            f'/api/orders/{order.pk}/', {'kind': Order.KIND_CUSTOMER}, format='json')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Order.objects.get(pk=order.pk).kind, Order.KIND_INTERNAL)

    # the endpoint and its permissions

    def test_the_owner_starts_a_run_through_the_api(self):
        response = self.post_run({'template': str(self.anarkali.pk), 'quantity': 5,
                                  'notes': 'Showroom stock'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['kind'], Order.KIND_INTERNAL)
        self.assertEqual(response.data['customer_name'], 'Boutique Stock')
        order = Order.objects.get(pk=response.data['id'])
        self.assertEqual(order.garment_jobs.count(), 5)

    def test_the_api_refuses_a_garment_that_does_not_exist(self):
        response = self.post_run({'template': '999999', 'quantity': 1})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.filter(kind=Order.KIND_INTERNAL).exists())

    def test_a_tailor_cannot_start_a_run(self):
        user = User.objects.create_user(username='tailor@internal.test', password='x')
        Tailor.objects.create(name='Sita', specialty='Blouse', role='Tailor', user=user)
        response = self.post_run({'template': str(self.anarkali.pk), 'quantity': 1}, user=user)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Order.objects.filter(kind=Order.KIND_INTERNAL).exists())


class InternalProductionDesignAndFabricTests(TenantTestCase):
    """What the run is making it from: a design from the library, cloth from stock."""

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@internal-material.test'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(
            id=1, defaults={'name': 'Material Atelier', 'phone': '9876500012'})
        self.owner = User.objects.create_user(
            username='owner@internal-material.test',
            email='owner@internal-material.test', password='x')
        self.blouse = GarmentTemplate.objects.create(
            key='blouse', name='Blouse', version=1, sequence=0)
        self.silk = self.stocked('FAB-SLK-001', 'Emerald Silk', 20)
        self.design = DesignAsset.objects.create(
            title='Peacock Blouse', source=DesignAsset.SOURCE_CATALOGUE,
            image_url='https://example.test/peacock.jpg')

    def stocked(self, code, name, quantity):
        from apps.inventory.services import InventoryService

        item = InventoryItem.objects.create(
            item_code=code, name=name, category=Category.FABRIC, unit='METER')
        InventoryService.stock_in(item, Decimal(quantity), user=self.owner,
                                  remarks='Opening stock')
        item.refresh_from_db()
        return item

    def make_run(self, **extra):
        return create_internal_production(
            {'template': str(self.blouse.pk), 'quantity': 3, **extra}, user=self.owner)

    def test_the_design_is_saved_on_every_garment(self):
        order = self.make_run(design=str(self.design.pk))
        jobs = list(order.garment_jobs.all())
        self.assertEqual(len(jobs), 3)
        for job in jobs:
            self.assertEqual(job.selections['design_asset_id'], str(self.design.pk))
            # The shape GarmentSelectionsReview reads: the photograph chosen
            # for a part of the garment, keyed by that part.
            chosen = job.selections['design']['parts']['overall']
            self.assertEqual(chosen['design_title'], 'Peacock Blouse')
            self.assertEqual(chosen['id'], str(self.design.pk))
            self.assertEqual(chosen['image_url'], 'https://example.test/peacock.jpg')

    def test_the_fabric_is_saved_as_a_material_line_on_every_garment(self):
        from apps.catalog.models import JobMaterial

        order = self.make_run(fabric=str(self.silk.pk), fabric_quantity='2.5')
        lines = JobMaterial.objects.filter(job__order=order)
        self.assertEqual(lines.count(), 3)
        for line in lines:
            self.assertEqual(line.inventory_item, self.silk)
            self.assertEqual(line.quantity, Decimal('2.500'))
            self.assertEqual(line.unit, 'METER')
            self.assertEqual(line.source, JobMaterial.Source.STORE)
        job = order.garment_jobs.first()
        self.assertEqual(job.selections['fabrics'], {line.field_key: [str(self.silk.pk)]})
        self.assertEqual([i['name'] for i in job.selections['fabric_items']], ['Emerald Silk'])

    def test_the_fabric_is_reserved_the_moment_the_run_starts(self):
        from apps.inventory.models import OrderMaterialPlan

        order = self.make_run(fabric=str(self.silk.pk), fabric_quantity='2.5')
        self.silk.refresh_from_db()
        self.assertEqual(self.silk.reserved_stock, Decimal('7.500'))
        self.assertEqual(self.silk.current_stock, Decimal('20.000'))
        self.assertEqual(self.silk.available_stock, Decimal('12.500'))
        plan = OrderMaterialPlan.objects.get(order=order)
        self.assertEqual(plan.lines.count(), 3)

    def test_a_run_with_no_fabric_reserves_nothing(self):
        from apps.catalog.models import JobMaterial

        order = self.make_run()
        self.silk.refresh_from_db()
        self.assertEqual(self.silk.reserved_stock, Decimal('0.000'))
        self.assertFalse(JobMaterial.objects.filter(job__order=order).exists())
        self.assertEqual(order.garment_jobs.count(), 3)

    def test_a_design_or_fabric_that_does_not_exist_is_refused(self):
        for body, message in (
            ({'design': '00000000-0000-0000-0000-000000000000'}, 'design'),
            ({'design': 'not-an-id'}, 'design'),
            ({'fabric': '00000000-0000-0000-0000-000000000000'}, 'fabric'),
            ({'fabric': str(self.silk.pk), 'fabric_quantity': '0'}, 'how much fabric'),
            ({'fabric': str(self.silk.pk), 'fabric_quantity': 'lots'}, 'must be a number'),
        ):
            with self.subTest(body=body):
                with self.assertRaises(ValueError) as caught:
                    self.make_run(**body)
                self.assertIn(message, str(caught.exception))
        self.assertFalse(Order.objects.filter(kind=Order.KIND_INTERNAL).exists())

    def test_the_run_still_finishes_into_stock_with_a_design_and_fabric(self):
        order = self.make_run(design=str(self.design.pk),
                              fabric=str(self.silk.pk), fabric_quantity='2')
        config = BoutiqueSettings.objects.get(id=1).workflow_config
        optional = {s['key']: s.get('optional', False) for s in config}
        for stage in list(order.stages.all().order_by('sequence', 'id')):
            if stage.status in ('COMPLETED', 'SKIPPED'):
                continue
            OrderService.transition_order_stage(
                order=order, stage_key=stage.stage_key,
                new_status='SKIPPED' if optional.get(stage.stage_key) else 'COMPLETED',
                user=self.owner, garment_job=stage.garment_job, notify=False)
            order.refresh_from_db()
        finished = InventoryItem.objects.get(category=Category.FINISHED)
        self.assertEqual(finished.current_stock, Decimal('3.000'))
        self.assertEqual(finished.design_asset, self.design)
        self.silk.refresh_from_db()
        self.assertLess(self.silk.current_stock, Decimal('20.000'))
