"""Customer birthdays: a WhatsApp wish at 12 AM on the day, the boutique told
on the day and three days ahead, each once per customer per year."""
from datetime import date, datetime
from unittest import mock

from django.db import connection
from django_tenants.test.cases import TenantTestCase

from core.formatting import tenant_timezone
from crm_api.models import BirthdayGreeting, BoutiqueSettings, Customer, Notification
from domains.customers import birthdays

SEND = 'crm_api.whatsapp_service.send_whatsapp_message'
OK = {'success': True, 'data': {'messageId': 'w1'}}


class BirthdayTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@birthdays.test'
        tenant.name = 'Birthday Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(id=1, defaults={'name': 'Birthday Atelier'})
        # 12:10 AM on 25 Oct 2026, the boutique's own clock.
        self.now = datetime(2026, 10, 25, 0, 10, tzinfo=tenant_timezone(self.tenant))

    def customer(self, first, mobile, dob, **extra):
        return Customer.objects.create(first_name=first, last_name='K', mobile_number=mobile,
                                       date_of_birth=dob, **extra)

    def titles(self):
        return sorted(Notification.objects.values_list('title', flat=True))

    def test_the_customer_is_wished_once_and_the_boutique_told(self):
        self.customer('Vanshika', '919876500001', date(1995, 10, 25))
        with mock.patch(SEND, return_value=OK) as send:
            birthdays.send_for_tenant(self.tenant, self.now)
            birthdays.send_for_tenant(self.tenant, self.now)  # the next 15-minute run
        self.assertEqual(send.call_count, 1)
        self.assertIn('happy birthday', send.call_args.kwargs['message_text'].lower())
        self.assertIn('Vanshika', send.call_args.kwargs['message_text'])
        self.assertEqual(self.titles(), ['Birthday today: Vanshika K'])
        self.assertEqual(BirthdayGreeting.objects.get().status, 'SENT')

    def test_the_boutique_is_reminded_three_days_ahead_without_messaging_the_customer(self):
        self.customer('Priya', '919876500002', date(1990, 10, 28))
        with mock.patch(SEND, return_value=OK) as send:
            birthdays.send_for_tenant(self.tenant, self.now)
            birthdays.send_for_tenant(self.tenant, self.now)
        send.assert_not_called()
        self.assertEqual(self.titles(), ['Birthday in 3 days: Priya K'])

    def test_a_failed_wish_is_tried_again_in_the_same_hour(self):
        self.customer('Anita', '919876500003', date(1988, 10, 25))
        with mock.patch(SEND, return_value={'success': False, 'error': 'not connected'}):
            birthdays.send_for_tenant(self.tenant, self.now)
        self.assertEqual(BirthdayGreeting.objects.get().status, 'FAILED')
        with mock.patch(SEND, return_value=OK) as send:
            birthdays.send_for_tenant(self.tenant, self.now)
        send.assert_called_once()
        self.assertEqual(BirthdayGreeting.objects.get().status, 'SENT')
        self.assertEqual(len(self.titles()), 1)

    def test_leads_and_people_without_a_birthday_are_left_out(self):
        self.customer('Lead', '919876500004', date(1999, 10, 25), is_lead=True)
        self.customer('NoDob', '919876500005', None)
        with mock.patch(SEND, return_value=OK) as send:
            birthdays.send_for_tenant(self.tenant, self.now)
        send.assert_not_called()
        self.assertEqual(self.titles(), [])

    def test_with_messaging_off_the_boutique_is_still_told(self):
        BoutiqueSettings.objects.filter(id=1).update(customer_messaging_enabled=False)
        self.customer('Riya', '919876500006', date(2000, 10, 25))
        with mock.patch(SEND, return_value=OK) as send:
            birthdays.send_for_tenant(self.tenant, self.now)
        send.assert_not_called()
        self.assertEqual(BirthdayGreeting.objects.get().status, 'SKIPPED')
        self.assertEqual(self.titles(), ['Birthday today: Riya K'])

    def test_a_29_february_birthday_is_kept_on_28_february_in_other_years(self):
        leap = self.customer('Leap', '919876500007', date(2000, 2, 29))
        self.assertIn(leap, birthdays.birthdays_on(date(2027, 2, 28)))
        self.assertNotIn(leap, birthdays.birthdays_on(date(2028, 2, 28)))
        self.assertIn(leap, birthdays.birthdays_on(date(2028, 2, 29)))

    def test_only_the_12_am_hour_is_due(self):
        self.assertTrue(birthdays.due(self.tenant, self.now))
        self.assertFalse(birthdays.due(self.tenant, self.now.replace(hour=1)))
        self.assertFalse(birthdays.due(self.tenant, self.now.replace(hour=23)))
