"""The order screens ask the database a fixed number of times, however many rows.

Production sits a region away from its database, so every query is a network
round trip. Before these were pinned, the order list asked for each stage's
garment job and template one row at a time -- 399 queries for a boutique with
18 orders -- and customer detail and the dashboard inherited the same pattern.
Each test measures an endpoint at one size, grows the data, and expects the
same count.
"""

from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import Order
from crm_api.test_state_machine import StateMachineTestBase
from domains.orders.services import ensure_garment_stages


class OrderQueryCountTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        ensure_garment_stages(self.order)
        self._alteration(self.order)
        token, _ = Token.objects.get_or_create(user=self.owner)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + token.key,
                                HTTP_X_TENANT_ID=self.tenant.schema_name)

    def _alteration(self, parent, seq=1):
        # Order.reference prints the parent's reference on an alteration, and
        # the parent lists its alterations: both used to cost a query per row.
        return Order.objects.create(
            order_id=f"{parent.order_id}-A{seq}", customer=self.customer,
            total_amount=Decimal('200'), alteration_of=parent, alteration_seq=seq)

    def _grow(self, n=3):
        for i in range(n):
            order = self._order(order_id=f"T2B-QC-{i}")
            ensure_garment_stages(order)
            self._alteration(order)

    def _queries(self, url):
        self.client.get(url)  # warm the per-process tenant and settings caches
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries)

    def test_order_list(self):
        url = reverse('order-list')
        before = self._queries(url)
        self._grow()
        self.assertEqual(self._queries(url), before)

    def test_order_detail(self):
        url = reverse('order-detail', args=[self.order.pk])
        before = self._queries(url)
        self._alteration(self.order, seq=2)
        self._alteration(self.order, seq=3)
        self.assertEqual(self._queries(url), before)

    def test_customer_detail(self):
        url = reverse('customer-detail', args=[self.customer.pk])
        before = self._queries(url)
        self._grow()
        self.assertEqual(self._queries(url), before)

    def test_dashboard(self):
        url = reverse('dashboard')
        before = self._queries(url)
        self._grow()
        self.assertEqual(self._queries(url), before)

    def test_customer_orders_come_back_oldest_first(self):
        # Order has no Meta.ordering; the customer's orders are ordered
        # explicitly so the profile does not reshuffle when a row is updated.
        self._grow(2)
        response = self.client.get(reverse('customer-detail', args=[self.customer.pk]))
        ids = [o['id'] for o in response.data['orders']]
        self.assertEqual(ids, sorted(ids))
