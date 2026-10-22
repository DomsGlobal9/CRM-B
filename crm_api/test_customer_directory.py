"""The Customers page, served a page at a time.

GET /api/customers/ used to be the only way to see the book, and returned all of
it -- 1.6 MB for one boutique on production -- for the browser to filter. With
?page= the server now filters, sorts, counts and pages (domains/customers/
directory.py). These tests pin the contract the page relies on, the filters'
rules, that the whole-book answer is unchanged for callers without ?page=, and
the two small endpoints that replaced the full list elsewhere: stats and lookup.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.permissions import visible_customers
from crm_api.models import Customer, Measurement, Order
from crm_api.test_state_machine import StateMachineTestBase
from domains.customers.directory import dial_of


class DirectoryTestBase(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.owner)
        self.url = reverse('customer-list')

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Token " + token.key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def add_customer(self, first, last='', mobile=None, **fields):
        self._seq = getattr(self, '_seq', 0) + 1
        return Customer.objects.create(
            first_name=first, last_name=last,
            mobile_number=mobile or f"9{self._seq:09d}", **fields)

    def page(self, **params):
        response = self.client.get(self.url, {'page': 1, **params})
        self.assertEqual(response.status_code, 200)
        return response.data

    def names(self, **params):
        return [f"{r['first_name']} {r['last_name']}".strip()
                for r in self.page(page_size=100, **params)['results']]


class PagingTests(DirectoryTestBase):

    def test_without_page_the_whole_book_comes_back_as_before(self):
        for n in range(3):
            self.add_customer(f"Extra{n}")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), Customer.objects.count())

    def test_a_page_carries_its_rows_and_the_counts_to_page_through(self):
        for n in range(25):
            self.add_customer(f"Bulk{n:02d}")
        data = self.page(page_size=10)
        self.assertEqual(data['count'], 26)          # the 25 plus setUp's customer
        self.assertEqual((data['page'], data['page_size'], data['page_count']), (1, 10, 3))
        self.assertEqual(len(data['results']), 10)
        last = self.page(page=3, page_size=10)
        self.assertEqual(len(last['results']), 6)
        ids = {r['id'] for r in data['results']} | {r['id'] for r in last['results']}
        self.assertEqual(len(ids), 16)

    def test_a_page_past_the_end_is_the_last_page(self):
        data = self.page(page=99, page_size=10)
        self.assertEqual(data['page'], 1)
        self.assertEqual(len(data['results']), 1)

    def test_the_page_size_is_capped(self):
        self.assertEqual(self.page(page_size=5000)['page_size'], 100)
        self.assertEqual(self.page(page_size='lots')['page_size'], 20)

    def test_default_order_is_newest_first(self):
        old = self.add_customer("Oldest")
        Customer.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=400))
        newest = self.add_customer("Newest")
        rows = self.page(page_size=100)['results']
        self.assertEqual(rows[0]['id'], str(newest.id))
        self.assertEqual(rows[-1]['id'], str(old.id))

    def test_the_query_count_does_not_grow_with_the_book(self):
        def queries():
            self.client.get(self.url, {'page': 1})   # warm per-process caches
            with CaptureQueriesContext(connection) as ctx:
                self.client.get(self.url, {'page': 1})
            return len(ctx.captured_queries)
        before = queries()
        for n in range(30):
            self.add_customer(f"Grow{n}")
        self.assertEqual(queries(), before)


class FilterTests(DirectoryTestBase):

    def setUp(self):
        super().setUp()
        Customer.objects.all().delete()
        self.asha = self.add_customer("Asha", "Rao", customer_type='Platinum', source='Instagram',
                                  gender='Female', city_region=' Hyderabad ')
        self.bina = self.add_customer("Bina", "Shah", customer_type='Gold', source='Walk In', gender='')
        self.chen = self.add_customer("Chen", "Li", mobile="+447700900123", customer_type='Unknown')
        self.lead = self.add_customer("Dev", "Lead", is_lead=True)
        Measurement.objects.create(customer=self.asha, bust=Decimal('34'))
        Measurement.objects.create(customer=self.bina)  # the empty sheet made on creation
        for n in range(2):
            Order.objects.create(order_id=f"DIR-{n}", customer=self.asha, total_amount=Decimal('5000'))
        Order.objects.create(order_id="DIR-B", customer=self.bina, total_amount=Decimal('900'))

    def test_leads_and_customers_are_separate_books(self):
        self.assertEqual(sorted(self.names()), ['Asha Rao', 'Bina Shah', 'Chen Li'])
        self.assertEqual(self.names(view='leads'), ['Dev Lead'])

    def test_a_lead_with_an_order_is_a_customer(self):
        Order.objects.create(order_id="DIR-L", customer=self.lead, total_amount=Decimal('1'))
        self.assertIn('Dev Lead', self.names())

    def test_search_matches_name_mobile_and_email(self):
        self.bina.email_address = 'bina@example.test'
        self.bina.save()
        self.assertEqual(self.names(search='asha r'), ['Asha Rao'])
        self.assertEqual(self.names(search='4477009'), ['Chen Li'])
        self.assertEqual(self.names(search='EXAMPLE.test'), ['Bina Shah'])

    def test_tier_treats_anything_unrecognised_as_silver(self):
        self.assertEqual(self.names(tier='Platinum'), ['Asha Rao'])
        self.assertEqual(self.names(tier='Silver'), ['Chen Li'])

    def test_orders(self):
        self.assertEqual(sorted(self.names(orders='with')), ['Asha Rao', 'Bina Shah'])
        self.assertEqual(self.names(orders='repeat'), ['Asha Rao'])
        self.assertEqual(self.names(orders='none'), ['Chen Li'])

    def test_an_empty_measurement_sheet_is_not_measurements(self):
        self.assertEqual(self.names(measurements='recorded'), ['Asha Rao'])
        self.assertEqual(sorted(self.names(measurements='missing')), ['Bina Shah', 'Chen Li'])

    def test_country_comes_from_the_stored_mobile(self):
        self.assertEqual(self.names(country='44'), ['Chen Li'])
        self.assertEqual(sorted(self.names(country='91')), ['Asha Rao', 'Bina Shah'])

    def test_letter_source_gender_and_city(self):
        self.assertEqual(self.names(letter='B'), ['Bina Shah'])
        self.assertEqual(self.names(source='Instagram'), ['Asha Rao'])
        self.assertEqual(sorted(self.names(gender='__none')), ['Bina Shah', 'Chen Li'])
        self.assertEqual(self.names(city='hyderabad'), ['Asha Rao'])

    def test_birthdays(self):
        today = timezone.localdate()
        soon = today + timedelta(days=10)
        self.asha.date_of_birth = soon.replace(year=1990)
        self.asha.save()
        self.assertEqual(self.names(birthday='next30'), ['Asha Rao'])
        self.assertEqual(sorted(self.names(birthday='missing')), ['Bina Shah', 'Chen Li'])

    def test_added(self):
        Customer.objects.filter(pk=self.chen.pk).update(created_at=timezone.now() - timedelta(days=60))
        self.assertEqual(sorted(self.names(added='30')), ['Asha Rao', 'Bina Shah'])
        self.assertEqual(sorted(self.names(added='90')), ['Asha Rao', 'Bina Shah', 'Chen Li'])

    def test_sorts(self):
        self.assertEqual(self.names(sort='name_asc'), ['Asha Rao', 'Bina Shah', 'Chen Li'])
        self.assertEqual(self.names(sort='name_desc'), ['Chen Li', 'Bina Shah', 'Asha Rao'])
        self.assertEqual(self.names(sort='orders'), ['Asha Rao', 'Bina Shah', 'Chen Li'])
        self.assertEqual(self.names(sort='spend'), ['Asha Rao', 'Bina Shah', 'Chen Li'])

    def test_unknown_values_are_ignored(self):
        self.assertEqual(len(self.names(orders='lots', sort='random', tier='Diamond', letter='?')), 3)

    def test_counts_are_over_the_book_not_the_filtered_rows(self):
        data = self.page(search='asha')
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['summary'], {
            'total': 3, 'with_orders': 2, 'new_this_month': 3,
            'tiers': {'Platinum': 1, 'Gold': 1, 'Silver': 1}})
        facets = data['facets']
        self.assertEqual(facets['countries'], [{'key': '91', 'count': 2}, {'key': '44', 'count': 1}])
        self.assertEqual(facets['letters']['A'], 1)
        self.assertEqual(facets['letters']['C'], 1)
        self.assertEqual(facets['genders'][-1], {'key': '__none', 'label': 'Not set', 'count': 2})
        self.assertEqual(facets['cities'], [{'key': 'hyderabad', 'label': 'Hyderabad', 'count': 1}])


class VisibilityTests(DirectoryTestBase):

    def test_a_tailor_pages_through_only_the_customers_they_may_see(self):
        for n in range(3):
            self.add_customer(f"Hidden{n}")
        visible = visible_customers(Customer.objects.all(), self.tailor_user)
        data = self.client_for(self.tailor_user).get(self.url, {'page': 1, 'page_size': 100}).data
        self.assertEqual(data['count'], visible.count())
        self.assertEqual({r['id'] for r in data['results']}, {str(c.id) for c in visible})
        stats = self.client_for(self.tailor_user).get(reverse('customer-stats')).data
        self.assertEqual(stats['total'], visible.count())


class StatsAndLookupTests(DirectoryTestBase):

    def test_stats_count_the_whole_book_with_leads(self):
        self.add_customer("Plat", customer_type='Platinum')
        self.add_customer("Lead", is_lead=True, customer_type='Gold')
        data = self.client.get(reverse('customer-stats')).data
        total = Customer.objects.count()
        self.assertEqual(data['total'], total)
        self.assertEqual(data['tiers'], {'Platinum': 1, 'Gold': 1, 'Silver': total - 2})

    def test_lookup_needs_something_to_look_for(self):
        self.assertEqual(self.client.get(reverse('customer-lookup')).data, [])

    def test_lookup_by_name_mobile_digits_and_id(self):
        meera = self.add_customer("Meera", "Nair", mobile="9123456789")
        url = reverse('customer-lookup')
        self.assertEqual([r['id'] for r in self.client.get(url, {'q': 'meera n'}).data], [meera.id])
        self.assertEqual([r['id'] for r in self.client.get(url, {'q': '234-567'}).data], [meera.id])
        self.assertEqual([r['id'] for r in self.client.get(url, {'mobile': '23456'}).data], [meera.id])
        self.assertEqual([r['id'] for r in self.client.get(url, {'ids': f"{meera.id},nonsense"}).data],
                         [meera.id])
        slim = self.client.get(url, {'q': 'meera'}).data[0]
        self.assertEqual(set(slim), {'id', 'first_name', 'last_name', 'mobile_number',
                                     'email_address', 'city_region', 'customer_type'})
        full = self.client.get(url, {'q': 'meera', 'full': '1'}).data[0]
        self.assertIn('measurements', full)
        self.assertIn('order_count', full)

    def test_lookup_is_limited(self):
        for n in range(8):
            self.add_customer(f"Same{n}")
        self.assertEqual(len(self.client.get(reverse('customer-lookup'), {'q': 'same', 'limit': 5}).data), 5)
        self.assertEqual(len(self.client.get(reverse('customer-lookup'), {'q': 'same', 'limit': 999}).data), 8)


class DialTests(StateMachineTestBase):
    """services/phone.js splitStoredMobile, as the directory reads it."""

    def test_dial_codes(self):
        self.assertEqual(dial_of('919845012345'), '91')   # India, stored with its code
        self.assertEqual(dial_of('9845012345'), '91')     # ten digits: Indian
        self.assertEqual(dial_of('447700900123'), '44')
        self.assertEqual(dial_of('13175291732'), '1')
        self.assertEqual(dial_of('9715012345678'), '971')  # longest code wins over '97'
        self.assertEqual(dial_of(''), '91')
