"""Work handed to a role on the screens beyond orders: what each task opens,
what it leaves shut, and what can never be handed at all."""

from decimal import Decimal

from django.contrib.auth.models import User
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.inventory.models import Category, InventoryItem, StockLocation, Unit
from apps.inventory.services import InventoryService
from core.admin_access import ACTION_TASKS, ALL_TASKS, NEVER_DELEGATED
from crm_api.models import BoutiqueSettings, Tailor


class CatalogueTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@catalogue.test"
        return tenant

    def test_every_mapped_task_exists(self):
        for key, tasks in ACTION_TASKS.items():
            with self.subTest(key=key):
                self.assertTrue(set(tasks) <= ALL_TASKS, tasks)

    def test_nothing_never_delegated_is_mapped(self):
        self.assertFalse(set(ACTION_TASKS) & NEVER_DELEGATED)


class RoleTasksTestCase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@roletasks.test"
        tenant.name = "Role Tasks Atelier"
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username="owner@roletasks.test", email="owner@roletasks.test", password="ownerpass123")
        self.runner_user = User.objects.create_user(username="raju@roletasks.test", password="pass12345")
        self.runner = Tailor.objects.create(name='Raju', role='Logistics Staff', user=self.runner_user)
        self.tailor_user = User.objects.create_user(username="ravi@roletasks.test", password="pass12345")
        self.tailor = Tailor.objects.create(name='Ravi', role='Tailor', user=self.tailor_user)
        self.colleague_user = User.objects.create_user(username="anu@roletasks.test", password="pass12345")
        self.colleague = Tailor.objects.create(name='Anu', role='QC Staff', user=self.colleague_user)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}', HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def hand(self, roles):
        config, _ = BoutiqueSettings.objects.get_or_create(id=1)
        config.admin_access = {'roles': roles}
        config.save()


class NeverDelegatedTests(RoleTasksTestCase):
    def test_a_role_handed_everything_still_cannot_change_who_may_do_what(self):
        self.hand({'Tailor': sorted(ALL_TASKS)})
        api = self.client_for(self.tailor_user)
        self.assertEqual(api.get('/api/boutique-settings/admin-access/').status_code, 403)
        self.assertEqual(api.put('/api/boutique-settings/admin-access/',
                                 {'roles': {'Tailor': sorted(ALL_TASKS)}}, format='json').status_code, 403)
        self.assertEqual(api.post(f'/api/tailors/{self.colleague.id}/reset_password/', {}, format='json').status_code
                         in (403, 404, 405), True)


class InventoryTaskTests(RoleTasksTestCase):
    def setUp(self):
        super().setUp()
        self.item = InventoryItem.objects.create(
            item_code='FAB-001', name='Silk Dupion', category=Category.FABRIC, unit=Unit.METER,
            purchase_price=Decimal('1200.00'), reorder_level=Decimal('5'))
        InventoryService.stock_in(self.item, 50, user=self.owner)
        self.warehouse = StockLocation.objects.get(is_default=True)
        self.shop = StockLocation.objects.create(name='Shop', kind=StockLocation.Kind.SHOWROOM, sequence=2)

    def transfer(self, api):
        return api.post(f'/api/inventory/items/{self.item.id}/transfer/',
                        {'quantity': '5', 'from_location': str(self.warehouse.id),
                         'to_location': str(self.shop.id)}, format='json')

    def test_without_a_task_logistics_staff_cannot_open_inventory(self):
        api = self.client_for(self.runner_user)
        self.assertEqual(api.get('/api/inventory/items/').status_code, 403)
        self.assertEqual(self.transfer(api).status_code, 403)

    def test_transfer_task_moves_stock_from_warehouse_to_shop_and_nothing_more(self):
        self.hand({'Logistics Staff': ['inventory.transfer']})
        api = self.client_for(self.runner_user)
        self.assertEqual(api.get('/api/inventory/items/').status_code, 200)
        self.assertEqual(api.get('/api/inventory/locations/').status_code, 200)
        self.assertEqual(self.transfer(api).status_code, 200)
        # Receiving stock, suppliers and reports are other tasks.
        self.assertEqual(api.post(f'/api/inventory/items/{self.item.id}/stock-in/',
                                  {'quantity': '5'}, format='json').status_code, 403)
        self.assertEqual(api.get('/api/inventory/suppliers/').status_code, 403)
        self.assertEqual(api.get('/api/inventory/reports/low-stock/').status_code, 403)
        # Another role was handed nothing.
        self.assertEqual(self.client_for(self.tailor_user).get('/api/inventory/items/').status_code, 403)

    def test_login_payload_opens_the_inventory_screen(self):
        self.hand({'Logistics Staff': ['inventory.view']})
        me = self.client_for(self.runner_user).get('/api/auth/me/').json()
        self.assertIn('inventory', me['modules'])
        self.assertEqual(me['admin_tasks'], ['inventory.view'])
        self.assertNotIn('inventory', self.client_for(self.tailor_user).get('/api/auth/me/').json()['modules'])


class TeamTaskTests(RoleTasksTestCase):
    def test_team_view_shows_the_roster(self):
        api = self.client_for(self.tailor_user)
        self.assertEqual(len(api.get('/api/staff/profiles/').json()), 0)
        from apps.staff.models import StaffProfile
        StaffProfile.objects.create(staff=self.colleague)
        self.assertEqual(len(api.get('/api/staff/profiles/').json()), 0)
        self.hand({'Tailor': ['team.view']})
        self.assertEqual(len(api.get('/api/staff/profiles/').json()), 1)

    def test_team_manage_edits_others_but_never_your_own_record(self):
        self.hand({'Tailor': ['team.manage']})
        api = self.client_for(self.tailor_user)
        res = api.patch(f'/api/tailors/{self.colleague.id}/', {'specialty': 'Finishing'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        # No promoting yourself.
        res = api.patch(f'/api/tailors/{self.tailor.id}/', {'role': 'Master'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.tailor.refresh_from_db()
        self.assertEqual(self.tailor.role, 'Tailor')

    def test_pay_needs_the_payroll_task(self):
        from apps.staff.models import StaffProfile
        profile = StaffProfile.objects.create(staff=self.colleague)
        self.hand({'Tailor': ['team.manage']})
        api = self.client_for(self.tailor_user)
        self.assertEqual(api.patch(f'/api/staff/profiles/{profile.id}/', {'hourly_rate': '500'},
                                   format='json').status_code, 403)
        self.hand({'Tailor': ['team.manage', 'team.payroll']})
        self.assertEqual(api.patch(f'/api/staff/profiles/{profile.id}/', {'hourly_rate': '500'},
                                   format='json').status_code, 200)


class FinanceTaskTests(RoleTasksTestCase):
    def test_finance_view_opens_profit_and_costs_but_not_expense_writes(self):
        api = self.client_for(self.tailor_user)
        self.assertEqual(api.get('/api/finance/profit-loss/').status_code, 403)
        self.hand({'Tailor': ['finance.view']})
        self.assertEqual(api.get('/api/finance/profit-loss/').status_code, 200)
        self.assertEqual(api.get('/api/finance/expenses/').status_code, 200)
        self.assertEqual(api.post('/api/finance/expenses/', {}, format='json').status_code, 403)
