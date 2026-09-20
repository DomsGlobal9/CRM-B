"""Buying for one order: a material the shelf does not hold, recorded against
the garment that needs it, never against stock."""

from decimal import Decimal

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentJob, JobMaterial
from apps.catalog.serializers import JobMaterialSerializer
from crm_api.views import _record_order_purchases

from . import order_materials
from .models import OrderPurchase, StockMovement, Supplier, Unit
from .test_order_materials_integration import OrderMaterialsTestBase


class OrderPurchaseTests(OrderMaterialsTestBase):

    def setUp(self):
        super().setUp()
        self.order = self.make_order()
        self.saree = GarmentJob.objects.create(
            order=self.order, template=self.blouse_template, template_version=1,
            spec={}, measurements={}, sequence=0)
        self.lehenga = GarmentJob.objects.create(
            order=self.order, template=self.lehenga_template, template_version=1,
            spec={}, measurements={}, sequence=1)

    def buy(self, job, name, quantity='2', **kw):
        return order_materials.create_order_purchase(
            self.order, garment_job=job, name=name, quantity=quantity,
            unit=Unit.METER, field_key='hand_work_material', user=self.owner, **kw)

    def api(self):
        client = APIClient()
        token, _ = Token.objects.get_or_create(user=self.owner)
        client.credentials(HTTP_AUTHORIZATION="Token " + token.key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def test_a_purchase_is_anchored_to_its_order_and_garment(self):
        row = self.buy(self.saree, 'Pink Zari Maggam Work', estimated_cost='800')
        self.assertEqual(row.order, self.order)
        self.assertEqual(row.garment_job, self.saree)
        self.assertEqual(row.garment_name, 'Blouse')
        self.assertEqual(row.field_key, 'hand_work_material')
        self.assertEqual(row.status, 'TO_PURCHASE')
        self.assertEqual(row.estimated_cost, Decimal('800'))
        # Nothing touched stock.
        self.assertFalse(StockMovement.objects.filter(order=self.order).exists())

    def test_two_garments_get_two_separate_purchases(self):
        a = self.buy(self.saree, 'Pink Zari Maggam Work', '2')
        b = self.buy(self.lehenga, 'Special Border', '5')
        self.assertNotEqual(a.pk, b.pk)
        self.assertEqual(set(self.order.purchases.values_list('garment_job_id', flat=True)),
                         {self.saree.id, self.lehenga.id})
        other = self.make_order(order_id='T2B-MAT-2')
        order_materials.create_order_purchase(other, name='Pink Zari Maggam Work',
                                              quantity='1', unit=Unit.METER)
        self.assertEqual(self.order.purchases.count(), 2)
        self.assertEqual(other.purchases.count(), 1)

    def test_validation(self):
        with self.assertRaises(order_materials.MaterialPlanError):
            self.buy(self.saree, '', '2')
        with self.assertRaises(order_materials.MaterialPlanError):
            self.buy(self.saree, 'Zari', '0')
        with self.assertRaises(order_materials.MaterialPlanError):
            self.buy(self.saree, 'Zari', '2', estimated_cost='-5')
        with self.assertRaises(order_materials.MaterialPlanError):
            order_materials.create_order_purchase(self.order, name='Zari', quantity='1', unit='BOGUS')

    def test_purchase_then_receive_then_use_keeps_the_real_cost_and_the_remainder(self):
        row = self.buy(self.saree, 'Pink Zari Maggam Work', '2', estimated_cost='800')
        shop = Supplier.objects.create(name='Zari House')
        row = order_materials.mark_purchased(row, actual_cost='720', supplier=shop,
                                             invoice_reference='INV-9', user=self.owner)
        self.assertEqual(row.status, 'PURCHASED')
        self.assertEqual(row.actual_cost, Decimal('720'))
        self.assertEqual(row.estimated_cost, Decimal('800'))
        self.assertEqual(row.supplier, shop)
        with self.assertRaises(order_materials.MaterialPlanError):
            order_materials.mark_purchased(row, actual_cost='-1')

        row = order_materials.receive_purchase(row, quantity='2', user=self.owner)
        self.assertEqual(row.status, 'RECEIVED')
        self.assertEqual(row.received_quantity, Decimal('2'))
        self.assertFalse(StockMovement.objects.filter(order=self.order).exists())

        row = order_materials.use_purchase(row, '1.8', user=self.owner)
        self.assertEqual(row.status, 'RECEIVED')
        self.assertEqual(row.remaining_quantity, Decimal('0.200'))
        with self.assertRaises(order_materials.MaterialPlanError):
            order_materials.use_purchase(row, '0.5')
        row = order_materials.use_purchase(row, '0.2', user=self.owner)
        self.assertEqual(row.status, 'USED')
        self.assertEqual(row.remaining_quantity, Decimal('0'))

    def test_receiving_straight_away_counts_as_bought_at_the_estimate(self):
        row = self.buy(self.saree, 'Latkan set', '1', estimated_cost='150')
        row = order_materials.receive_purchase(row, user=self.owner)
        self.assertEqual(row.status, 'RECEIVED')
        self.assertEqual(row.actual_cost, Decimal('150'))
        self.assertEqual(row.received_quantity, Decimal('1'))

    def test_only_a_pending_purchase_can_be_cancelled(self):
        row = self.buy(self.saree, 'Zari', '2')
        row = order_materials.cancel_purchase(row, user=self.owner)
        self.assertEqual(row.status, 'CANCELLED')
        bought = order_materials.mark_purchased(self.buy(self.saree, 'Dori', '1'), actual_cost='40')
        with self.assertRaises(order_materials.MaterialPlanError):
            order_materials.cancel_purchase(bought)
        self.assertEqual(OrderPurchase.objects.get(pk=bought.pk).status, 'PURCHASED')

    def test_the_wizard_line_becomes_a_purchase_and_the_stock_plan_leaves_it_alone(self):
        line = JobMaterial.objects.create(
            job=self.saree, field_key='hand_work_material', free_text='Pink Zari Maggam Work',
            quantity=Decimal('2'), unit='METER', source=JobMaterial.Source.PURCHASE)
        JobMaterial.objects.create(
            job=self.saree, field_key='main_fabric', inventory_item=self.brocade,
            quantity=Decimal('3'), unit='METER', source=JobMaterial.Source.STORE)
        _record_order_purchases(self.order, self.saree, [
            {'field_key': 'hand_work_material', 'estimated_cost': '800',
             'required_by': '2026-10-01', 'notes': 'Use on the pallu'},
        ], self.owner, purchases=[
            {'name': 'Gold latkan', 'quantity': '4', 'unit': 'PIECE', 'estimated_cost': '300'},
            {'name': '', 'quantity': '1'},   # an empty row the wizard left behind
        ])
        latkan = self.order.purchases.get(name='Gold latkan')
        self.assertEqual(latkan.garment_job, self.saree)
        self.assertEqual(latkan.quantity, Decimal('4'))
        self.assertEqual(self.order.purchases.count(), 2)
        row = self.order.purchases.get(job_material=line)
        self.assertEqual(row.job_material, line)
        self.assertEqual(row.estimated_cost, Decimal('800'))
        self.assertEqual(str(row.required_by), '2026-10-01')
        self.assertEqual(row.notes, 'Use on the pallu')

        # The normal stock line is planned and reserved; the purchase line is
        # listed but never reserved.
        plan, _ = order_materials.plan_from_garment_jobs(self.order, user=self.owner)
        order_materials.reserve(plan, user=self.owner, allow_partial=True)
        by_name = {l.material_name: l for l in plan.lines.all()}
        self.assertEqual(by_name['Maroon Brocade'].reserved_quantity, Decimal('3'))
        self.assertIsNone(by_name['Pink Zari Maggam Work'].item)
        self.assertEqual(by_name['Pink Zari Maggam Work'].reserved_quantity, Decimal('0'))
        self.brocade.refresh_from_db()
        self.assertEqual(self.brocade.reserved_stock, Decimal('3'))

    def test_serializer_rules_for_each_source(self):
        ok = JobMaterialSerializer(data={'field_key': 'x', 'inventory_item': self.brocade.id,
                                         'quantity': '1', 'source': 'STORE'})
        self.assertTrue(ok.is_valid(), ok.errors)
        bad = JobMaterialSerializer(data={'field_key': 'x', 'inventory_item': self.brocade.id,
                                          'quantity': '1', 'source': 'PURCHASE'})
        self.assertFalse(bad.is_valid())
        unnamed = JobMaterialSerializer(data={'field_key': 'x', 'quantity': '1', 'source': 'PURCHASE'})
        self.assertFalse(unnamed.is_valid())
        named = JobMaterialSerializer(data={'field_key': 'x', 'free_text': 'Zari', 'quantity': '1',
                                            'unit': 'METER', 'source': 'PURCHASE'})
        self.assertTrue(named.is_valid(), named.errors)

    def test_the_api_lists_steps_and_edits_pending_rows_only(self):
        client = self.api()
        res = client.post(reverse('order-purchase-list'), {
            'order': self.order.id, 'garment_job': str(self.lehenga.id), 'name': 'Special Border',
            'quantity': '5', 'unit': 'METER', 'estimated_cost': '1200'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        pk = res.json()['id']
        self.assertEqual(res.json()['garment_name'], 'Lehenga')

        res = client.patch(reverse('order-purchase-detail', args=[pk]), {'quantity': '6'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)

        res = client.post(reverse('order-purchase-purchased', args=[pk]),
                          {'actual_cost': '1100', 'invoice_reference': 'B-12'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['status'], 'PURCHASED')

        res = client.patch(reverse('order-purchase-detail', args=[pk]), {'quantity': '7'}, format='json')
        self.assertEqual(res.status_code, 400)

        res = client.post(reverse('order-purchase-received', args=[pk]), {'quantity': '6'}, format='json')
        self.assertEqual(res.json()['status'], 'RECEIVED')
        res = client.post(reverse('order-purchase-use', args=[pk]), {'quantity': '6'}, format='json')
        self.assertEqual(res.json()['status'], 'USED')

        listed = client.get(reverse('order-purchase-list'), {'open': 1}).json()
        rows = listed if isinstance(listed, list) else listed['results']
        self.assertEqual([r['id'] for r in rows], [])
        detail = client.get(reverse('order-detail', args=[self.order.id])).json()
        self.assertEqual(detail['purchases'][0]['name'], 'Special Border')
