"""Add Customer with `referred_by`: one request, one customer, one referral."""
from unittest import mock

from django.contrib.auth.models import User
from django.db import IntegrityError, connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import Customer, CustomerReferral, Measurement, Tailor


class AddCustomerReferredByTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@add-referred.test'
        tenant.name = 'Referred Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@add-referred.test', email='owner@add-referred.test', password='x')
        self.a = Customer.objects.create(first_name='Asha', last_name='Rao', mobile_number='9876500001')

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get_or_create(user=user)[0].key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def add(self, body, user=None):
        response = self.client_for(user or self.owner).post('/api/customers/', body, format='json')
        connection.set_tenant(self.tenant)
        return response

    def test_a_customer_is_added_without_a_referral_exactly_as_before(self):
        response = self.add({'first_name': 'Bina', 'last_name': 'Das', 'mobile_number': '9876500002',
                             'source': 'Walk In'})
        self.assertEqual(response.status_code, 201, response.data)
        b = Customer.objects.get(mobile_number='919876500002')
        self.assertEqual(b.source, 'Walk In')
        self.assertTrue(Measurement.objects.filter(customer=b).exists())
        self.assertFalse(CustomerReferral.objects.exists())
        self.assertIsNone(response.data['referred_by'])

    def test_a_customer_is_added_with_the_customer_who_referred_them(self):
        response = self.add({'first_name': 'Bina', 'last_name': 'Das', 'mobile_number': '9876500002',
                             'source': 'Referral', 'referred_by': str(self.a.pk)})
        self.assertEqual(response.status_code, 201, response.data)
        b = Customer.objects.get(mobile_number='919876500002')
        self.assertEqual(b.source, 'Referral')
        referral = CustomerReferral.objects.get(referred=b)
        self.assertEqual(referral.referrer, self.a)
        self.assertEqual(referral.created_by, self.owner)
        self.assertEqual(referral.referrer_name_snapshot, 'Asha Rao')
        self.assertEqual(response.data['referred_by'], {'id': str(self.a.pk), 'name': 'Asha Rao'})

    def test_referred_by_alone_files_the_customer_under_referral(self):
        self.add({'first_name': 'Bina', 'mobile_number': '9876500002', 'referred_by': str(self.a.pk)})
        self.assertEqual(Customer.objects.get(mobile_number='919876500002').source, 'Referral')

    def test_recording_the_referral_leaves_the_referrer_alone(self):
        stored = Customer.objects.get(pk=self.a.pk)
        self.add({'first_name': 'Bina', 'mobile_number': '9876500002', 'referred_by': str(self.a.pk)})
        a = Customer.objects.get(pk=self.a.pk)
        self.assertEqual((a.first_name, a.source, a.updated_at),
                         (stored.first_name, stored.source, stored.updated_at))

    def test_one_customer_can_refer_several(self):
        for mobile in ('9876500002', '9876500003'):
            self.assertEqual(self.add({'first_name': 'Bina', 'mobile_number': mobile,
                                       'referred_by': str(self.a.pk)}).status_code, 201)
        self.assertEqual(self.a.referrals_made.count(), 2)

    def test_a_referrer_who_is_not_a_customer_is_refused_and_nothing_is_added(self):
        for bad in ('00000000-0000-0000-0000-000000000000', 'not-an-id', '9876500009'):
            response = self.add({'first_name': 'Bina', 'mobile_number': '9876500002',
                                 'referred_by': bad})
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn('customer book', response.data['error'])
            self.assertFalse(Customer.objects.filter(mobile_number='919876500002').exists(), bad)
            self.assertFalse(CustomerReferral.objects.exists(), bad)

    def test_a_customer_cannot_be_added_as_their_own_referrer(self):
        # The only way to name yourself here is to re-send the referrer's own
        # mobile, which is the duplicate the customer book already refuses.
        response = self.add({'first_name': 'Asha', 'last_name': 'Rao', 'mobile_number': '9876500001',
                             'referred_by': str(self.a.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertIn('mobile_number', response.data)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_the_self_referral_rule_still_refuses_one_that_reaches_it(self):
        from rest_framework.exceptions import ValidationError

        from domains.customers.referrals import attach_referral
        with self.assertRaises(ValidationError) as caught:
            attach_referral(self.a, self.a, user=self.owner)
        self.assertIn('cannot refer themselves', str(caught.exception))
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_duplicate_mobile_is_refused_the_way_it_always_was(self):
        plain = self.add({'first_name': 'Asha', 'mobile_number': '9876500001'})
        referred = self.add({'first_name': 'Asha', 'mobile_number': '9876500001',
                             'referred_by': str(self.a.pk)})
        self.assertEqual((plain.status_code, referred.status_code), (400, 400))
        self.assertEqual(list(plain.data), list(referred.data))
        self.assertEqual(str(plain.data['mobile_number'][0]), str(referred.data['mobile_number'][0]))
        self.assertEqual(Customer.objects.count(), 1)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_refused_referral_takes_the_new_customer_with_it(self):
        with mock.patch('domains.customers.referrals.CustomerReferral.objects.create',
                        side_effect=IntegrityError('boom')):
            response = self.add({'first_name': 'Bina', 'mobile_number': '9876500002',
                                 'referred_by': str(self.a.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Customer.objects.filter(mobile_number='919876500002').exists())
        self.assertFalse(Measurement.objects.filter(customer__mobile_number='919876500002').exists())
        self.assertFalse(CustomerReferral.objects.exists())
        self.assertEqual(Customer.objects.count(), 1)

    def test_editing_a_customer_never_records_a_referral(self):
        b = Customer.objects.create(first_name='Bina', last_name='Das', mobile_number='9876500002')
        response = self.client_for(self.owner).patch(
            f'/api/customers/{b.pk}/', {'city_region': 'Pune', 'referred_by': str(self.a.pk)},
            format='json')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Customer.objects.get(pk=b.pk).city_region, 'Pune')
        self.assertFalse(CustomerReferral.objects.exists())

    def test_only_the_owner_adds_a_customer_at_all(self):
        master = User.objects.create_user(username='master@add-referred.test', password='x')
        Tailor.objects.create(name='Meena', specialty='Lehenga', role='Master', user=master)
        response = self.add({'first_name': 'Bina', 'mobile_number': '9876500002',
                             'referred_by': str(self.a.pk)}, user=master)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(CustomerReferral.objects.exists())
