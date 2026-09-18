"""What the expense book refuses at the door."""

from django.contrib.auth.models import User
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.finance.models import Expense


class ExpenseValidationTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@finance-val.test'
        tenant.name = 'Finance Validation'
        return tenant

    def setUp(self):
        owner = User.objects.create_user(
            username='owner@finance-val.test', email='owner@finance-val.test',
            password='pw12345678')
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}',
            HTTP_X_TENANT_ID=self.tenant.schema_name)

    def _post(self, **overrides):
        payload = {'category': 'RENT', 'amount': '15000', 'incurred_on': '2026-08-15'}
        payload.update(overrides)
        return self.client.post('/api/finance/expenses/', payload, format='json')

    def test_an_absurd_amount_is_refused(self):
        response = self._post(amount='99999999')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Amount cannot be more than 10,000,000.', str(response.data['amount']))
        self.assertFalse(Expense.objects.exists())

    def test_paid_to_and_note_have_an_end(self):
        self.assertEqual(self._post(paid_to='p' * 151).status_code, 400)
        self.assertEqual(self._post(paid_to='p' * 150).status_code, 201)
        response = self._post(note='n' * 2001)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Note is limited to 2000 characters.', str(response.data['note']))

    def test_paid_to_is_trimmed(self):
        response = self._post(paid_to='  Landlord  ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Expense.objects.get().paid_to, 'Landlord')
