"""The import's `referred_by_mobile` column.

The referrer is named by mobile and must already be in the book or be another
row of the same sheet. A referral that cannot be recorded never costs the row
its import: the customer lands, and the reason is a note on the row.
"""
from django.contrib.auth.models import User
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from crm_api.models import BoutiqueSettings, Customer, CustomerReferral, Tailor
from crm_api.test_customer_import import sheet

HEADERS = ['mobile', 'full_name', 'source', 'referred_by_mobile']


class CustomerImportReferralTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@import-referral.test'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(
            id=1, defaults={'name': 'Referral Import Atelier', 'phone': '9876500011'})
        self.owner = User.objects.create_user(
            username='owner@import-referral.test', email='owner@import-referral.test', password='x')
        self.client = APIClient(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.client.force_authenticate(self.owner)
        self.asha = Customer.objects.create(first_name='Asha', last_name='Rao',
                                            mobile_number='9000000001')

    def post(self, rows, commit=True, headers=None, user=None):
        if user is not None:
            self.client.force_authenticate(user)
        data = {'file': sheet(headers or HEADERS, rows)}
        if commit:
            data['commit'] = '1'
        response = self.client.post('/api/customers/import/', data, format='multipart')
        connection.set_tenant(self.tenant)
        return response.json()

    def notes_for(self, result, mobile):
        row = next(v for v in result['valid'] if v['mobile'] == mobile)
        return ' '.join(row['notes'])

    def referrer_of(self, mobile):
        referral = CustomerReferral.objects.filter(referred__mobile_number=mobile).first()
        return referral.referrer if referral else None

    # Nothing in the column

    def test_a_sheet_without_the_column_imports_exactly_as_before(self):
        result = self.post([['9000000002', 'Bina Das', 'Walk In']],
                           headers=['mobile', 'full_name', 'source'])
        self.assertEqual((result['created'], result['updated']), (1, 0))
        self.assertFalse(CustomerReferral.objects.exists())

    def test_an_empty_cell_records_no_referral(self):
        result = self.post([['9000000002', 'Bina Das', 'Walk In', '']])
        self.assertEqual(result['created'], 1)
        self.assertEqual(self.notes_for(result, '919000000002'), '')
        self.assertFalse(CustomerReferral.objects.exists())

    # The referrer is found

    def test_a_referrer_already_in_the_book_is_recorded(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']])
        self.assertEqual(result['created'], 1)
        self.assertEqual(self.notes_for(result, '919000000002'), '')
        referral = CustomerReferral.objects.get()
        self.assertEqual(referral.referrer, self.asha)
        self.assertEqual(referral.referred.mobile_number, '919000000002')
        self.assertEqual(referral.created_by, self.owner)
        self.assertEqual(referral.referrer_name_snapshot, 'Asha Rao')

    def test_the_referrers_own_profile_is_not_touched(self):
        before = Customer.objects.get(pk=self.asha.pk)
        self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']])
        after = Customer.objects.get(pk=self.asha.pk)
        self.assertEqual((after.first_name, after.source, after.notes, after.updated_at),
                         (before.first_name, before.source, before.notes, before.updated_at))

    def test_the_referrer_may_be_written_any_way_the_book_reads_it(self):
        self.post([['9000000002', 'Bina Das', 'Referral', '+91 90000 00001']])
        self.assertEqual(self.referrer_of('919000000002'), self.asha)

    def test_the_referrer_may_be_another_row_of_the_same_sheet(self):
        result = self.post([
            ['9000000002', 'Bina Das', 'Walk In', ''],
            ['9000000003', 'Chitra Iyer', 'Referral', '9000000002'],
        ])
        self.assertEqual(result['created'], 2)
        self.assertEqual(self.notes_for(result, '919000000003'), '')
        self.assertEqual(self.referrer_of('919000000003').mobile_number, '919000000002')

    def test_a_referrer_further_down_the_sheet_is_still_found(self):
        self.post([
            ['9000000003', 'Chitra Iyer', 'Referral', '9000000002'],
            ['9000000002', 'Bina Das', 'Walk In', ''],
        ])
        self.assertEqual(self.referrer_of('919000000003').mobile_number, '919000000002')

    def test_several_rows_may_share_one_referrer(self):
        result = self.post([
            ['9000000002', 'Bina Das', 'Referral', '9000000001'],
            ['9000000003', 'Chitra Iyer', 'Referral', '9000000001'],
            ['9000000004', 'Divya Nair', 'Referral', '9000000001'],
        ])
        self.assertEqual(result['created'], 3)
        self.assertEqual(self.asha.referrals_made.count(), 3)

    # The referrer cannot be used

    def test_a_referrer_nobody_knows_is_noted_and_the_customer_still_lands(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9876543210']])
        self.assertEqual(result['created'], 1)
        self.assertEqual(result['errors'], [])
        self.assertEqual(self.notes_for(result, '919000000002'),
                         'Referrer 9876543210 not found, so no referral was recorded.')
        self.assertTrue(Customer.objects.filter(mobile_number='919000000002').exists())
        self.assertFalse(CustomerReferral.objects.exists())

    def test_a_referrer_mobile_that_is_not_a_mobile_is_noted(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '12345']])
        self.assertEqual(result['created'], 1)
        self.assertIn('not a valid mobile number', self.notes_for(result, '919000000002'))
        self.assertFalse(CustomerReferral.objects.exists())
        self.assertFalse(Customer.objects.filter(mobile_number='12345').exists())

    def test_a_row_that_refers_itself_is_noted(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000002']])
        self.assertEqual(result['created'], 1)
        self.assertEqual(self.notes_for(result, '919000000002'),
                         'A customer cannot refer themselves.')
        self.assertFalse(CustomerReferral.objects.exists())

    def test_nothing_creates_a_referrer_out_of_a_mobile_number(self):
        before = Customer.objects.count()
        self.post([['9000000002', 'Bina Das', 'Referral', '9876543210']])
        self.assertEqual(Customer.objects.count(), before + 1)

    # A customer the book already holds

    def test_an_existing_customer_with_no_referrer_gains_one(self):
        bina = Customer.objects.create(first_name='Bina', last_name='Das',
                                       mobile_number='9000000002', city_region='Pune')
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']])
        self.assertEqual((result['created'], result['updated']), (0, 1))
        self.assertEqual(self.referrer_of('919000000002'), self.asha)
        bina.refresh_from_db()
        self.assertEqual(bina.city_region, 'Pune')

    def test_an_existing_referrer_is_never_replaced(self):
        bina = Customer.objects.create(first_name='Bina', last_name='Das', mobile_number='9000000002')
        chitra = Customer.objects.create(first_name='Chitra', last_name='Iyer', mobile_number='9000000003')
        CustomerReferral.objects.create(referrer=chitra, referred=bina)
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']])
        self.assertEqual((result['created'], result['updated']), (0, 1))
        self.assertEqual(self.notes_for(result, '919000000002'),
                         'They already have a referrer on file, which was kept.')
        self.assertEqual(CustomerReferral.objects.count(), 1)
        self.assertEqual(self.referrer_of('919000000002'), chitra)

    # Permissions

    def test_a_master_imports_customers_but_records_no_referrals(self):
        master = User.objects.create_user(username='master@import-referral.test', password='x')
        Tailor.objects.create(name='Meena', specialty='Lehenga', role='Master', user=master)
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']], user=master)
        self.assertEqual(result['created'], 1)
        self.assertEqual(result['ignored_columns'], ['referred_by_mobile'])
        self.assertEqual(self.notes_for(result, '919000000002'), '')
        self.assertFalse(CustomerReferral.objects.exists())

    def test_the_owner_does_not_see_the_column_listed_as_ignored(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9000000001']], commit=False)
        self.assertEqual(result['ignored_columns'], [])

    # Preview

    def test_the_preview_reports_the_notes_and_saves_nothing(self):
        result = self.post([['9000000002', 'Bina Das', 'Referral', '9876543210']], commit=False)
        self.assertEqual(self.notes_for(result, '919000000002'),
                         'Referrer 9876543210 not found, so no referral was recorded.')
        self.assertFalse(Customer.objects.filter(mobile_number='919000000002').exists())
        self.assertFalse(CustomerReferral.objects.exists())
