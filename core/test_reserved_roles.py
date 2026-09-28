"""A staff row's free-text role can never make someone the owner or a designer.

Owner comes from BoutiqueTenant.owner_email and Designer from a Designer
profile (core.roles). Typing either word as a staff member's role used to
resolve to it: a partner added as "Owner" got payroll, finance and deletes.
"""

from django.contrib.auth.models import User
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.roles import OWNER, resolve_user_role
from crm_api.models import Tailor


class ReservedRoleTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@reserved.test'
        tenant.name = 'Reserved Roles Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@reserved.test', email='owner@reserved.test',
            password='ownerpass123')

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                        HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def add_staff(self, role, email):
        return self.client_for(self.owner).post(reverse('tailor-list'), {
            'name': 'Anand Kumar', 'specialty': 'Partner', 'role': role,
            'email': email, 'status': 'Available',
        }, format='json')

    def test_owner_and_designer_cannot_be_typed_as_a_staff_role(self):
        for i, role in enumerate(['Owner', 'owner', ' OWNER ', 'Designer', 'designer']):
            response = self.add_staff(role, f'partner{i}@reserved.test')
            self.assertEqual(response.status_code, 400, (role, response.data))
            self.assertIn('cannot be given to a staff member', str(response.data))
        self.assertFalse(Tailor.objects.exists())

    def test_a_built_in_role_in_the_wrong_case_is_stored_in_its_own_spelling(self):
        response = self.add_staff('master', 'lakshmi@reserved.test')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Tailor.objects.get().role, 'Master')

    def test_a_custom_role_is_still_allowed(self):
        response = self.add_staff('Helper', 'helper@reserved.test')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Tailor.objects.get().role, 'Helper')

    def test_an_existing_row_saved_as_owner_does_not_make_its_user_the_owner(self):
        # Rows written before the serializer refused the word.
        user = User.objects.create_user(username='partner@reserved.test',
                                        email='partner@reserved.test', password='pw-123456')
        Tailor.objects.create(name='Anand', specialty='Partner', role='Owner', user=user)

        self.assertNotEqual(resolve_user_role(user), OWNER)
        client = self.client_for(user)
        self.assertEqual(client.get('/api/payroll/deposits/').status_code, 403)
        self.assertEqual(client.delete(f'/api/tailors/{user.tailor_profile.pk}/').status_code, 403)
        self.assertTrue(Tailor.objects.filter(pk=user.tailor_profile.pk).exists())

    def test_the_real_owner_is_unaffected(self):
        self.assertEqual(resolve_user_role(self.owner), OWNER)
