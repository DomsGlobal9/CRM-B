from unittest import mock

from django.contrib.auth.models import User
from django.db import IntegrityError, connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from crm_api.models import Customer, CustomerReferral, Measurement, Tailor


class CustomerReferralApiTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@referral-api.test'
        tenant.name = 'Referral Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@referral-api.test', email='owner@referral-api.test', password='x')
        self.a = Customer.objects.create(first_name='Asha', last_name='Rao', mobile_number='9876500001')
        self.b = Customer.objects.create(first_name='Bina', last_name='Das', mobile_number='9876500002',
                                         email_address='bina@example.com', city_region='Pune')
        self.c = Customer.objects.create(first_name='Chitra', last_name='Iyer', mobile_number='9876500003')

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.get_or_create(user=user)[0].key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def refer(self, referrer, body, user=None):
        response = self.client_for(user or self.owner).post(
            f'/api/customers/{referrer.pk}/referrals/', body, format='json')
        connection.set_tenant(self.tenant)
        return response

    def listing(self, referrer, user=None):
        response = self.client_for(user or self.owner).get(f'/api/customers/{referrer.pk}/referrals/')
        connection.set_tenant(self.tenant)
        return response

    def staff(self, role, username):
        user = User.objects.create_user(username=username, email=username, password='x')
        Tailor.objects.create(name=role, specialty=role, role=role, user=user)
        return user

    # New B

    def test_a_refers_a_new_customer(self):
        before = Customer.objects.count()
        response = self.refer(self.a, {'first_name': 'Divya', 'last_name': 'Nair',
                                       'mobile_number': '9876500004', 'note': 'Sister-in-law'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data['created'], True)
        self.assertIs(response.data['name_differs'], False)
        self.assertEqual(Customer.objects.count(), before + 1)
        b = Customer.objects.get(mobile_number='919876500004')
        self.assertEqual((b.first_name, b.last_name), ('Divya', 'Nair'))
        self.assertEqual(b.source, 'Referral')
        self.assertTrue(Measurement.objects.filter(customer=b).exists())
        referral = CustomerReferral.objects.get(referred=b)
        self.assertEqual(referral.referrer, self.a)
        self.assertEqual(referral.created_by, self.owner)
        self.assertEqual(referral.note, 'Sister-in-law')
        self.assertEqual(response.data['customer']['id'], str(b.pk))
        self.assertEqual(response.data['referral']['referrer'], self.a.pk)
        self.assertEqual(response.data['referral']['referred'], b.pk)

    # Existing B

    def test_a_refers_an_existing_customer(self):
        stored = Customer.objects.get(pk=self.b.pk)
        before = Customer.objects.count()
        response = self.refer(self.a, {'first_name': 'Beena', 'last_name': 'D',
                                       'mobile_number': '9876500002', 'city_region': 'Goa',
                                       'email_address': 'other@example.com'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data['created'], False)
        self.assertIs(response.data['name_differs'], True)
        self.assertEqual(response.data['customer']['first_name'], 'Bina')
        self.assertEqual(Customer.objects.count(), before)
        after = Customer.objects.get(pk=self.b.pk)
        for field in ('first_name', 'last_name', 'mobile_number', 'email_address',
                      'city_region', 'source', 'updated_at'):
            self.assertEqual(getattr(after, field), getattr(stored, field), field)
        self.assertEqual(CustomerReferral.objects.get(referred=self.b).referrer, self.a)

    def test_the_same_name_is_not_reported_as_different(self):
        response = self.refer(self.a, {'first_name': 'bina', 'last_name': 'das', 'mobile_number': '9876500002'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data['name_differs'], False)

    # Mobile normalisation

    def test_an_existing_customer_is_found_however_the_number_is_typed(self):
        for i, typed in enumerate(('+91 98765 00002', '098765 00002', '0091-9876500002')):
            CustomerReferral.objects.all().delete()
            before = Customer.objects.count()
            response = self.refer(self.a, {'first_name': 'Bina', 'mobile_number': typed})
            self.assertEqual(response.status_code, 201, (typed, response.data))
            self.assertIs(response.data['created'], False, typed)
            self.assertEqual(response.data['customer']['id'], str(self.b.pk), typed)
            self.assertEqual(Customer.objects.count(), before, typed)

    def test_a_foreign_number_finds_the_customer_stored_under_it(self):
        abroad = Customer.objects.create(first_name='Uma', last_name='Rao', mobile_number='+13175291732')
        response = self.refer(self.a, {'first_name': 'Uma', 'mobile_number': '+1 (317) 529-1732'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIs(response.data['created'], False)
        self.assertEqual(response.data['customer']['id'], str(abroad.pk))

    # Validation

    def test_a_customer_cannot_refer_themselves(self):
        response = self.refer(self.a, {'first_name': 'Asha', 'mobile_number': '9876500001'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('cannot refer themselves', response.data['error'])
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_customer_cannot_get_a_second_referrer(self):
        self.assertEqual(self.refer(self.a, {'mobile_number': '9876500002'}).status_code, 201)
        response = self.refer(self.c, {'mobile_number': '9876500002'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('already referred by Asha Rao', response.data['error'])
        self.assertEqual(CustomerReferral.objects.get().referrer, self.a)

    def test_the_same_referral_cannot_be_recorded_twice(self):
        self.assertEqual(self.refer(self.a, {'mobile_number': '9876500002'}).status_code, 201)
        response = self.refer(self.a, {'mobile_number': '9876500002'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('already referred', response.data['error'])
        self.assertEqual(CustomerReferral.objects.count(), 1)

    def test_a_missing_mobile_is_refused(self):
        response = self.refer(self.a, {'first_name': 'Divya'})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_invalid_new_customer_data_is_refused_and_nothing_is_saved(self):
        before = Customer.objects.count()
        for body in ({'first_name': 'Divya', 'mobile_number': '12345'},
                     {'first_name': '', 'mobile_number': '9876500009'}):
            response = self.refer(self.a, body)
            self.assertEqual(response.status_code, 400, body)
        self.assertEqual(Customer.objects.count(), before)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_failed_referral_leaves_no_new_customer_behind(self):
        before = Customer.objects.count()
        with mock.patch('domains.customers.referrals.CustomerReferral.objects.create',
                        side_effect=IntegrityError('boom')):
            response = self.refer(self.a, {'first_name': 'Divya', 'last_name': 'Nair',
                                           'mobile_number': '9876500004'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Customer.objects.count(), before)
        self.assertFalse(Customer.objects.filter(mobile_number='919876500004').exists())
        self.assertFalse(Measurement.objects.filter(customer__mobile_number='919876500004').exists())
        self.assertFalse(CustomerReferral.objects.exists())

    def test_an_unknown_referrer_is_not_found(self):
        response = self.client_for(self.owner).post(
            '/api/customers/00000000-0000-0000-0000-000000000000/referrals/',
            {'mobile_number': '9876500002'}, format='json')
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 404)

    # Permissions

    def test_the_owner_can_record_a_referral(self):
        self.assertEqual(self.refer(self.a, {'mobile_number': '9876500002'}).status_code, 201)

    def test_a_tailor_cannot_record_a_referral(self):
        tailor = self.staff('Tailor', 'tailor@referral-api.test')
        response = self.refer(self.a, {'mobile_number': '9876500002'}, user=tailor)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_master_cannot_record_a_referral(self):
        master = self.staff('Master', 'master@referral-api.test')
        response = self.refer(self.a, {'mobile_number': '9876500002'}, user=master)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_designer_cannot_record_a_referral(self):
        user = User.objects.create_user(username='designer@referral-api.test', password='x')
        Designer.objects.create(name='Priya', user=user)
        response = self.refer(self.a, {'mobile_number': '9876500002'}, user=user)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(CustomerReferral.objects.exists())

    # GET

    def test_the_owner_lists_the_customers_a_referred(self):
        self.refer(self.a, {'mobile_number': '9876500002', 'note': 'Neighbour'})
        self.refer(self.a, {'first_name': 'Divya', 'last_name': 'Nair', 'mobile_number': '9876500004'})
        self.refer(self.c, {'first_name': 'Esha', 'last_name': 'Pai', 'mobile_number': '9876500005'})
        response = self.listing(self.a)
        self.assertEqual(response.status_code, 200)
        rows = {row['referred_name']: row for row in response.data}
        self.assertEqual(set(rows), {'Bina Das', 'Divya Nair'})
        bina = rows['Bina Das']
        self.assertEqual(bina['referrer'], self.a.pk)
        self.assertEqual(bina['referrer_name'], 'Asha Rao')
        self.assertEqual(bina['referred'], self.b.pk)
        self.assertEqual(bina['referred_mobile'], '919876500002')
        self.assertEqual(bina['note'], 'Neighbour')
        self.assertEqual(bina['created_by'], self.owner.pk)
        self.assertTrue(bina['created_at'])

    def test_the_customer_detail_says_who_referred_them(self):
        self.refer(self.a, {'mobile_number': '9876500002'})
        detail = self.client_for(self.owner).get(f'/api/customers/{self.b.pk}/')
        connection.set_tenant(self.tenant)
        self.assertEqual(detail.data['referred_by'], {'id': str(self.a.pk), 'name': 'Asha Rao'})
        unreferred = self.client_for(self.owner).get(f'/api/customers/{self.c.pk}/')
        connection.set_tenant(self.tenant)
        self.assertIsNone(unreferred.data['referred_by'])

    def test_the_referrer_name_survives_the_referrer_being_deleted(self):
        self.refer(self.a, {'mobile_number': '9876500002'})
        self.a.delete()
        detail = self.client_for(self.owner).get(f'/api/customers/{self.b.pk}/')
        connection.set_tenant(self.tenant)
        self.assertEqual(detail.data['referred_by'], {'id': None, 'name': 'Asha Rao'})

    def test_a_customer_with_no_referrals_lists_none(self):
        response = self.listing(self.c)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
