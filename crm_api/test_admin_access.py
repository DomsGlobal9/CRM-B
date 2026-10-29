"""Work handed to a role: /api/boutique-settings/admin-access/ and what it opens."""

from django.contrib.auth.models import User
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.admin_access import assignable_roles, clean_admin_access
from crm_api.models import BoutiqueSettings, Customer, Tailor


class AdminAccessTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@adminaccess.test"
        tenant.name = "Admin Access Atelier"
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        self.url = reverse('boutique-settings-admin-access')
        self.owner = User.objects.create_user(
            username="owner@adminaccess.test", email="owner@adminaccess.test", password="ownerpass123")
        self.tailor_user = User.objects.create_user(username="ravi@adminaccess.test", password="pass12345")
        self.tailor = Tailor.objects.create(name='Ravi', role='Tailor', user=self.tailor_user)
        self.second_tailor_user = User.objects.create_user(username="anu@adminaccess.test", password="pass12345")
        Tailor.objects.create(name='Anu', role='Tailor', user=self.second_tailor_user)
        self.qc_user = User.objects.create_user(username="sita@adminaccess.test", password="pass12345")
        Tailor.objects.create(name='Sita', role='QC Staff', user=self.qc_user)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}', HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def hand(self, roles):
        return self.client_for(self.owner).put(self.url, {'roles': roles}, format='json')

    def test_clean_refuses_unknown_roles_and_tasks(self):
        self.assertEqual(
            clean_admin_access({'roles': {'Tailor': ['orders.create', 'orders.create'], 'QC Staff': []}}),
            {'roles': {'Tailor': ['orders.create']}})
        for bad in ({'roles': {'Tailor': ['orders.fly']}}, {'roles': {'Boss': ['orders.create']}},
                    {'roles': {'Owner': ['orders.create']}}, {'roles': {'Tailor': 'orders.create'}},
                    {'roles': ['Tailor']}, []):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                clean_admin_access(bad)

    def test_every_role_but_the_owner_can_be_handed_work(self):
        roles = assignable_roles()
        self.assertNotIn('Owner', roles)
        for role in ('Designer', 'Master', 'Tailor', 'Hemming & Pressing Staff', 'Logistics Staff'):
            self.assertIn(role, roles)

    def test_only_the_owner_reads_and_writes_it(self):
        self.assertEqual(self.client_for(self.tailor_user).get(self.url).status_code, 403)
        self.assertEqual(self.client_for(self.tailor_user).put(self.url, {}, format='json').status_code, 403)
        res = self.hand({'Tailor': ['customers.add']})
        self.assertEqual(res.status_code, 200, res.content)
        got = self.client_for(self.owner).get(self.url).data
        self.assertEqual(got['roles'], {'Tailor': ['customers.add']})
        self.assertEqual(got['role_names'], list(assignable_roles()))
        self.assertIsNone(got['previous_admin'])

    def test_an_unknown_role_is_refused(self):
        self.assertEqual(self.hand({'Nightwatchman': ['customers.add']}).status_code, 400)

    def test_everyone_in_the_role_gets_the_task_and_no_other_role_does(self):
        body = {'first_name': 'Asha', 'mobile_number': '9876543210'}
        # Before: a Tailor cannot add a customer.
        self.assertEqual(self.client_for(self.tailor_user).post('/api/customers/', body, format='json').status_code, 403)
        self.hand({'Tailor': ['customers.add']})
        self.assertNotEqual(
            self.client_for(self.tailor_user).post('/api/customers/', body, format='json').status_code, 403)
        body['mobile_number'] = '9876543211'
        self.assertNotEqual(
            self.client_for(self.second_tailor_user).post('/api/customers/', body, format='json').status_code, 403)
        # QC Staff were handed nothing.
        body['mobile_number'] = '9876543212'
        self.assertEqual(self.client_for(self.qc_user).post('/api/customers/', body, format='json').status_code, 403)
        # A task not handed stays closed.
        customer = Customer.objects.create(first_name='Meena', mobile_number='9123456780')
        self.assertEqual(self.client_for(self.tailor_user).delete(f'/api/customers/{customer.id}/').status_code, 403)

    def test_saving_without_a_role_takes_its_tasks_back(self):
        self.hand({'Tailor': ['customers.add'], 'QC Staff': ['orders.create']})
        self.hand({'QC Staff': ['orders.create']})
        self.assertEqual(self.client_for(self.tailor_user).get('/api/auth/me/').json()['admin_tasks'], [])
        self.assertEqual(self.client_for(self.qc_user).get('/api/auth/me/').json()['admin_tasks'], ['orders.create'])

    def test_login_payload_carries_the_roles_tasks(self):
        self.hand({'Tailor': ['orders.create', 'workshop.assign']})
        me = self.client_for(self.tailor_user).get('/api/auth/me/').json()
        self.assertEqual(me['admin_tasks'], ['orders.create', 'workshop.assign'])
        self.assertEqual(self.client_for(self.qc_user).get('/api/auth/me/').json()['admin_tasks'], [])
        self.assertEqual(self.client_for(self.owner).get('/api/auth/me/').json()['admin_tasks'], [])

    def test_the_old_single_admin_grants_nothing_but_is_named(self):
        # The old screen's shape. Converting it onto the person's role would hand
        # their work to every Tailor, so it grants nothing until re-ticked.
        config, _ = BoutiqueSettings.objects.get_or_create(id=1)
        config.admin_access = {'member': {'kind': 'staff', 'id': str(self.tailor.id)},
                               'tasks': ['customers.add']}
        config.save()
        self.assertEqual(self.client_for(self.tailor_user).get('/api/auth/me/').json()['admin_tasks'], [])
        got = self.client_for(self.owner).get(self.url).data
        self.assertEqual(got['roles'], {})
        self.assertEqual(got['previous_admin'], {'name': 'Ravi', 'role': 'Tailor', 'tasks': ['customers.add']})
        # Once the owner saves per role, the old Admin is gone for good.
        self.hand({'Tailor': ['customers.add']})
        self.assertIsNone(self.client_for(self.owner).get(self.url).data['previous_admin'])
