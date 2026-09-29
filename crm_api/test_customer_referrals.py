from datetime import timedelta

from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase

from crm_api.models import Customer, CustomerReferral


class CustomerReferralModelTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@referral.test'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@referral.test', email='owner@referral.test', password='x')
        self.a = Customer.objects.create(first_name='Asha', last_name='Rao', mobile_number='9876500001')
        self.b = Customer.objects.create(first_name='Bina', last_name='Das', mobile_number='9876500002')
        self.c = Customer.objects.create(first_name='Chitra', last_name='Iyer', mobile_number='9876500003')

    def refer(self, referrer, referred, **extra):
        return CustomerReferral.objects.create(
            referrer=referrer, referred=referred, created_by=self.owner, **extra)

    def test_a_can_refer_b(self):
        referral = self.refer(self.a, self.b, note='Met at the wedding')
        referral.refresh_from_db()
        self.assertEqual(referral.referrer, self.a)
        self.assertEqual(referral.referred, self.b)
        self.assertEqual(referral.note, 'Met at the wedding')
        self.assertEqual(list(self.a.referrals_made.all()), [referral])
        self.assertEqual(list(self.b.referrals_received.all()), [referral])

    def test_a_can_refer_many_customers(self):
        self.refer(self.a, self.b)
        self.refer(self.a, self.c)
        self.assertEqual(self.a.referrals_made.count(), 2)

    def test_a_cannot_refer_themselves(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.refer(self.a, self.a)
        self.assertFalse(CustomerReferral.objects.exists())

    def test_b_cannot_have_a_second_referrer(self):
        self.refer(self.a, self.b)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.refer(self.c, self.b)
        self.assertEqual(CustomerReferral.objects.get().referrer, self.a)

    def test_the_same_referral_cannot_be_recorded_twice(self):
        self.refer(self.a, self.b)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.refer(self.a, self.b)
        self.assertEqual(CustomerReferral.objects.count(), 1)

    def test_the_referral_stores_who_recorded_it(self):
        referral = self.refer(self.a, self.b)
        referral.refresh_from_db()
        self.assertEqual(referral.created_by, self.owner)

    def test_the_referral_stores_when_it_was_recorded(self):
        before = timezone.now()
        referral = self.refer(self.a, self.b)
        referral.refresh_from_db()
        self.assertIsNotNone(referral.created_at)
        self.assertGreaterEqual(referral.created_at, before - timedelta(seconds=1))
        self.assertLessEqual(referral.created_at, timezone.now())

    def test_recording_a_referral_leaves_the_referred_profile_alone(self):
        stamp = Customer.objects.get(pk=self.b.pk).updated_at
        self.refer(self.a, self.b)
        b = Customer.objects.get(pk=self.b.pk)
        self.assertEqual((b.first_name, b.last_name, b.mobile_number, b.updated_at),
                         ('Bina', 'Das', '919876500002', stamp))

    def test_deleting_the_referrer_keeps_the_referral_and_who_it_was(self):
        referral = self.refer(self.a, self.b)
        self.a.delete()
        referral.refresh_from_db()
        self.assertIsNone(referral.referrer)
        self.assertEqual(referral.referred, self.b)
        self.assertEqual(referral.referrer_name_snapshot, 'Asha Rao')
        self.assertEqual(referral.referrer_mobile_snapshot, '919876500001')

    def test_the_snapshot_is_not_rewritten_when_the_referrer_changes(self):
        referral = self.refer(self.a, self.b)
        self.a.first_name = 'Ashwini'
        self.a.save()
        referral.note = 'Updated'
        referral.save()
        referral.refresh_from_db()
        self.assertEqual(referral.referrer_name_snapshot, 'Asha Rao')

    def test_deleting_the_referred_customer_removes_the_referral(self):
        self.refer(self.a, self.b)
        self.b.delete()
        self.assertFalse(CustomerReferral.objects.exists())
