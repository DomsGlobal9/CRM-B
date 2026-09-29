"""Employment terms for a designer.

A designer added on the staff screen with a work type and pay has no roster
(Tailor) row, so the terms hang off StaffProfile.designer instead of
StaffProfile.staff -- exactly one of the two, as for StaffDocument. They are a
record of the agreement: payroll pays attended time, which designers do not
clock, so a designer's terms never enter a payroll run.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from apps.payroll import services as payroll
from apps.payroll.models import StaffLedgerEntry
from crm_api.models import Tailor

from .models import StaffProfile


class DesignerTermsTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@designer-terms.test'
        tenant.name = 'Designer Terms Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@designer-terms.test', email='owner@designer-terms.test',
            password='ownerpass12345')
        self.designer = Designer.objects.create(name='Bade Vaidika', phone='8008777900')
        self.tailor_user = User.objects.create_user(
            username='anita', email='anita@designer-terms.test', password='anitapass12345')
        self.tailor = Tailor.objects.create(
            name='Anita', specialty='Blouses', role='Tailor', user=self.tailor_user)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                        HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def post(self, user, body):
        response = self.client_for(user).post(reverse('staff-profile-list'), body, format='json')
        connection.set_tenant(self.tenant)
        return response

    def terms(self, **overrides):
        return {'employment_type': 'FULL_TIME', 'joined_at': '2026-09-01',
                'hourly_rate': '150.00', 'weekly_hours': '48', **overrides}

    def test_the_owner_can_save_a_designers_work_type_and_pay(self):
        response = self.post(self.owner, self.terms(designer=str(self.designer.id)))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['staff'])
        self.assertEqual(response.data['designer'], self.designer.id)
        self.assertEqual(response.data['staff_name'], 'Bade Vaidika')
        self.assertEqual(response.data['staff_role'], 'Designer')
        profile = StaffProfile.objects.get(designer=self.designer)
        self.assertEqual(profile.hourly_rate, Decimal('150.00'))
        self.assertEqual(profile.joined_at, date(2026, 9, 1))

    def test_the_list_carries_designer_terms_alongside_the_roster(self):
        self.post(self.owner, self.terms(designer=str(self.designer.id)))
        self.post(self.owner, self.terms(staff=self.tailor.id, hourly_rate='90'))
        response = self.client_for(self.owner).get(reverse('staff-profile-list'))
        self.assertEqual(response.status_code, 200)
        holders = {(row['staff'], str(row['designer']) if row['designer'] else None)
                   for row in response.data}
        self.assertEqual(holders, {(None, str(self.designer.id)), (self.tailor.id, None)})

    def test_terms_need_exactly_one_holder(self):
        neither = self.post(self.owner, self.terms())
        self.assertEqual(neither.status_code, 400)
        both = self.post(self.owner, self.terms(staff=self.tailor.id,
                                                designer=str(self.designer.id)))
        self.assertEqual(both.status_code, 400)
        self.assertFalse(StaffProfile.objects.exists())

    def test_the_database_refuses_terms_for_nobody(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            StaffProfile.objects.create(hourly_rate=10)

    def test_a_designer_has_one_set_of_terms(self):
        self.assertEqual(self.post(self.owner, self.terms(designer=str(self.designer.id))).status_code, 201)
        second = self.post(self.owner, self.terms(designer=str(self.designer.id)))
        self.assertEqual(second.status_code, 400)

    def test_a_designers_deposit_writes_no_ledger_row(self):
        response = self.post(self.owner, self.terms(designer=str(self.designer.id),
                                                    deposit_total='5000', deposit_weekly='500'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(StaffLedgerEntry.objects.exists())

    def test_payroll_leaves_designer_terms_out(self):
        self.post(self.owner, self.terms(designer=str(self.designer.id)))
        self.post(self.owner, self.terms(staff=self.tailor.id))
        eligible = list(payroll.eligible_profiles())
        self.assertEqual([p.staff_id for p in eligible], [self.tailor.id])

    def test_a_tailor_cannot_see_a_designers_terms(self):
        self.post(self.owner, self.terms(designer=str(self.designer.id)))
        response = self.client_for(self.tailor_user).get(reverse('staff-profile-list'))
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_a_designer_login_still_cannot_open_staff_terms(self):
        # Unchanged: the staff module is not a designer's. Their terms are
        # recorded for the owner, not shown to them.
        user = User.objects.create_user(username='bv', email='bv@designer-terms.test',
                                        password='bvpass1234567')
        self.designer.user = user
        self.designer.save(update_fields=['user'])
        self.post(self.owner, self.terms(designer=str(self.designer.id)))
        response = self.client_for(user).get(reverse('staff-profile-list'))
        connection.set_tenant(self.tenant)
        self.assertEqual(response.status_code, 403)

    def test_deleting_the_designer_takes_their_terms(self):
        self.post(self.owner, self.terms(designer=str(self.designer.id)))
        self.designer.delete()
        self.assertFalse(StaffProfile.objects.exists())
