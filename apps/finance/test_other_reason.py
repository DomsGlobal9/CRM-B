"""An "Other" cost carries what it was for."""

from django.contrib.auth.models import User
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.finance.models import Expense


class OtherReasonTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@finance-other.test'
        tenant.name = 'Finance Other'
        return tenant

    def setUp(self):
        owner = User.objects.create_user(
            username='owner@finance-other.test', email='owner@finance-other.test',
            password='pw12345678')
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}',
            HTTP_X_TENANT_ID=self.tenant.schema_name)

    def _post(self, **overrides):
        payload = {'category': 'OTHER', 'amount': '500', 'incurred_on': '2026-08-15'}
        payload.update(overrides)
        return self.client.post('/api/finance/expenses/', payload, format='json')

    def test_other_needs_a_reason(self):
        response = self._post()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('other_reason', response.data)
        self.assertEqual(self._post(other_reason='   ').status_code, 400)
        self.assertFalse(Expense.objects.exists())

    def test_other_keeps_its_reason(self):
        response = self._post(other_reason='  Diwali decorations ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['other_reason'], 'Diwali decorations')
        self.assertEqual(Expense.objects.get().other_reason, 'Diwali decorations')

    def test_another_category_drops_a_stray_reason(self):
        response = self._post(category='RENT', other_reason='left over')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Expense.objects.get().other_reason, '')

    def test_reason_has_an_end(self):
        self.assertEqual(self._post(other_reason='r' * 151).status_code, 400)
