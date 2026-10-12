"""The owner's Admin: /api/boutique-settings/admin-access/ and what it opens."""

from django.contrib.auth.models import User
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.admin_access import clean_admin_access
from crm_api.models import Customer, Tailor


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
        self.admin_user = User.objects.create_user(username="ravi@adminaccess.test", password="pass12345")
        self.admin = Tailor.objects.create(name='Ravi', role='Tailor', user=self.admin_user)
        self.other_user = User.objects.create_user(username="sita@adminaccess.test", password="pass12345")
        Tailor.objects.create(name='Sita', role='Tailor', user=self.other_user)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}', HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def make_admin(self, tasks):
        return self.client_for(self.owner).put(
            self.url, {'member': {'kind': 'staff', 'id': self.admin.id}, 'tasks': tasks}, format='json')

    def test_clean_refuses_unknown_tasks_and_bad_members(self):
        self.assertEqual(clean_admin_access({'member': None, 'tasks': ['orders.create', 'orders.create']}),
                         {'member': None, 'tasks': ['orders.create']})
        for bad in ({'tasks': ['orders.fly']}, {'member': {'kind': 'boss', 'id': 1}}, {'tasks': 'orders.create'}):
            with self.assertRaises(ValueError):
                clean_admin_access(bad)

    def test_only_the_owner_reads_and_writes_it(self):
        self.assertEqual(self.client_for(self.admin_user).get(self.url).status_code, 403)
        self.assertEqual(self.client_for(self.admin_user).put(self.url, {}, format='json').status_code, 403)
        res = self.make_admin(['customers.add'])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data['member'], {'kind': 'staff', 'id': str(self.admin.id)})
        self.assertEqual(self.client_for(self.owner).get(self.url).data['tasks'], ['customers.add'])

    def test_a_member_not_on_the_staff_list_is_refused(self):
        res = self.client_for(self.owner).put(
            self.url, {'member': {'kind': 'staff', 'id': 999999}, 'tasks': []}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_the_admin_gets_the_task_and_nobody_else_does(self):
        body = {'first_name': 'Asha', 'mobile_number': '9876543210'}
        # Before: a Tailor cannot add a customer.
        self.assertEqual(self.client_for(self.admin_user).post('/api/customers/', body, format='json').status_code, 403)
        self.make_admin(['customers.add'])
        self.assertNotEqual(self.client_for(self.admin_user).post('/api/customers/', body, format='json').status_code, 403)
        # The other Tailor is still Regular.
        self.assertEqual(self.client_for(self.other_user).post('/api/customers/', body, format='json').status_code, 403)
        # A task not handed stays closed.
        customer = Customer.objects.create(first_name='Meena', mobile_number='9123456780')
        self.assertEqual(self.client_for(self.admin_user).delete(f'/api/customers/{customer.id}/').status_code, 403)

    def test_login_payload_carries_the_tasks(self):
        self.make_admin(['orders.create', 'workshop.assign'])
        me = self.client_for(self.admin_user).get('/api/auth/me/').json()
        self.assertEqual(me['admin_tasks'], ['orders.create', 'workshop.assign'])
        self.assertEqual(self.client_for(self.other_user).get('/api/auth/me/').json()['admin_tasks'], [])
