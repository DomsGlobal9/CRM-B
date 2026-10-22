"""The appointment list: the same answer, in a fixed number of queries.

Each appointment carries its full customer (CustomerSerializer, with every one
of their orders) and its staff member. Fetched row by row that was the
customer's queries and each of its orders' once per appointment -- 917 queries
for ten upcoming appointments, measured locally -- on a list the dashboard
loads at sign-in. The list now fetches all of it up front. These tests hold the
response to what it was (every field, every value) and the query count still
as appointments and orders are added.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.scheduling.models import Appointment
from apps.scheduling.serializers import AppointmentSerializer
from crm_api.models import Customer, CustomerReferral, Order
from crm_api.test_state_machine import StateMachineTestBase
from domains.orders.services import ensure_garment_stages


class AppointmentListQueryTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        ensure_garment_stages(self.order)
        token, _ = Token.objects.get_or_create(user=self.owner)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Token " + token.key,
                                HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.url = reverse('appointment-list')
        self._seq = 0
        self.book(self.customer)

    def book(self, customer, staff=True):
        self._seq += 1
        return Appointment.objects.create(
            customer=customer, assigned_staff=self.tailor if staff else None,
            scheduled_time=timezone.now() + timedelta(days=1, hours=self._seq))

    def customer_with_orders(self, n_orders=2):
        self._seq += 1
        customer = Customer.objects.create(first_name=f"Guest{self._seq}", last_name="Test",
                                           mobile_number=f"98{self._seq:08d}")
        for i in range(n_orders):
            order = Order.objects.create(order_id=f"APPT-{self._seq}-{i}", customer=customer,
                                         total_amount=Decimal('1500'), tailor=self.tailor)
            ensure_garment_stages(order)
        return customer

    def queries(self, params=None):
        self.client.get(self.url, params or {})   # warm per-process caches
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.url, params or {})
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries), response

    def test_the_query_count_does_not_grow_with_appointments_or_orders(self):
        before, _ = self.queries({'upcoming': 'true'})
        for _ in range(3):
            self.book(self.customer_with_orders(n_orders=3))
        self.book(self.customer, staff=False)
        after, response = self.queries({'upcoming': 'true'})
        self.assertEqual(len(response.data), 5)
        self.assertEqual(after, before)

    def test_the_response_is_what_the_row_by_row_serialiser_gave(self):
        """Every field and value as before; only the orders' sequence is now fixed (by id)."""
        guest = self.customer_with_orders(n_orders=2)
        self.book(guest)
        CustomerReferral.objects.create(referrer=self.customer, referred=guest)
        Order.objects.create(order_id="APPT-ALT", customer=guest, total_amount=Decimal('100'),
                             alteration_of=guest.orders.order_by('id').first(), alteration_seq=1)

        _, response = self.queries()
        raw = APIRequestFactory().get(self.url)
        force_authenticate(raw, user=self.owner)
        request = Request(raw)
        request.user = self.owner
        connection.set_tenant(self.tenant)
        old = AppointmentSerializer(
            Appointment.objects.select_related('customer', 'order', 'assigned_staff'),
            many=True, context={'request': request}).data

        def comparable(rows):
            out = []
            for row in rows:
                row = dict(row)
                customer = dict(row['customer_detail'])
                customer['orders'] = sorted(customer['orders'], key=lambda o: str(o['id']))
                row['customer_detail'] = customer
                out.append(row)
            return sorted(out, key=lambda r: str(r['id']))

        self.assertEqual(comparable(response.data), comparable(old))
        guest_row = next(r for r in response.data if r['customer'] == guest.id)
        self.assertEqual(guest_row['customer_detail']['referred_by']['id'], str(self.customer.pk))
        self.assertEqual(len(guest_row['customer_detail']['orders']), 3)

    def test_every_field_clients_read_is_still_there(self):
        _, response = self.queries()
        row = response.data[0]
        for key in ('id', 'customer', 'customer_detail', 'assigned_staff', 'assigned_staff_detail',
                    'scheduled_time', 'status', 'appointment_type'):
            self.assertIn(key, row)
        for key in ('first_name', 'last_name', 'mobile_number', 'measurements', 'orders',
                    'measurement_history', 'design_preferences', 'fabric_selections',
                    'referred_by', 'total_spend', 'order_count', 'segment', 'style_dna'):
            self.assertIn(key, row['customer_detail'])
        self.assertEqual(row['assigned_staff_detail']['name'], self.tailor.name)
        self.assertIn('phone', row['assigned_staff_detail'])

    def test_a_customers_orders_come_back_oldest_first(self):
        guest = self.customer_with_orders(n_orders=3)
        self.book(guest)
        _, response = self.queries()
        guest_row = next(r for r in response.data if r['customer'] == guest.id)
        ids = [o['id'] for o in guest_row['customer_detail']['orders']]
        self.assertEqual(ids, sorted(ids))
