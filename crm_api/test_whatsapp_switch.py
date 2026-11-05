"""The two WhatsApp switches: WHATSAPP_SENDING_ENABLED in the .env, and the boutique's
own in Settings. Either one off and nothing leaves; back on and no backlog fires."""
from datetime import date, datetime
from unittest import mock

from django.contrib.auth.models import User
from django.db import connection
from django.test import override_settings
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from django_tenants.test.client import TenantClient
from rest_framework.authtoken.models import Token

from apps.daily_summary import send as daily_summary
from core.formatting import tenant_timezone
from crm_api import whatsapp_service
from crm_api.models import BirthdayGreeting, BoutiqueSettings, Customer, CustomerMessage, Order
from domains.customers import birthdays
from domains.orders import messaging

BACKEND = 'domains.orders.messaging.whatsapp_backend'
SEND = 'crm_api.whatsapp_service.send_whatsapp_message'
OK = {'success': True, 'data': {'messageId': 'w1'}}


class SwitchTestCase(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@switch.test'
        tenant.name = 'Switch Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(id=1, defaults={'name': 'Switch Atelier'})
        self.customer = Customer.objects.create(
            first_name='Asha', last_name='K', mobile_number='919876500001')
        self.order = Order.objects.create(customer=self.customer)

    def boutique_off(self):
        BoutiqueSettings.objects.filter(id=1).update(customer_messaging_enabled=False)


class PlatformSwitchTests(SwitchTestCase):

    @override_settings(WHATSAPP_SENDING_ENABLED=False)
    def test_nothing_reaches_the_whatsapp_service(self):
        with mock.patch('crm_api.whatsapp_service.requests.post') as post:
            text = whatsapp_service.send_whatsapp_message('919876500001', 'hello', tenant=self.tenant)
            document = whatsapp_service.send_whatsapp_document(
                '919876500001', b'%PDF', 'a.pdf', tenant=self.tenant)
        post.assert_not_called()
        for result in (text, document):
            self.assertFalse(result['success'])
            self.assertTrue(result['blocked'])

    @override_settings(WHATSAPP_SENDING_ENABLED=False, CUSTOMER_MESSAGE_BACKEND=BACKEND)
    def test_an_order_message_waits_for_staff_and_is_not_scheduled(self):
        with self.captureOnCommitCallbacks(execute=True), mock.patch(SEND) as send:
            message = messaging.send_customer_message(self.order, 'manual', 'hello')
        send.assert_not_called()
        message.refresh_from_db()
        self.assertEqual((message.status, message.attempts), ('QUEUED', 0))
        self.assertIsNone(message.next_attempt_at)

    def test_a_retry_due_when_it_goes_off_never_fires_once_it_is_back_on(self):
        message = CustomerMessage.objects.create(
            order=self.order, template_key='manual', to_number='919876500001', body='hello',
            attempts=1, next_attempt_at=timezone.now())
        with override_settings(WHATSAPP_SENDING_ENABLED=False, CUSTOMER_MESSAGE_BACKEND=BACKEND):
            self.assertEqual(messaging.send_due(), {})
        with override_settings(CUSTOMER_MESSAGE_BACKEND=BACKEND), mock.patch(SEND, return_value=OK) as send:
            self.assertEqual(messaging.send_due(), {})
        send.assert_not_called()
        message.refresh_from_db()
        self.assertEqual(message.status, 'QUEUED')
        self.assertIsNone(message.next_attempt_at)

    @override_settings(WHATSAPP_SENDING_ENABLED=False)
    def test_a_birthday_is_skipped_for_good_rather_than_sent_late(self):
        Customer.objects.create(first_name='Mira', last_name='K', mobile_number='919876500002',
                                date_of_birth=date(1995, 10, 25))
        now = datetime(2026, 10, 25, 0, 10, tzinfo=tenant_timezone(self.tenant))
        with mock.patch(SEND) as send:
            birthdays.send_for_tenant(self.tenant, now)
        send.assert_not_called()
        self.assertEqual(BirthdayGreeting.objects.get().status, 'SKIPPED')

    @override_settings(WHATSAPP_SENDING_ENABLED=False)
    def test_the_daily_summary_falls_back_to_email(self):
        with mock.patch('crm_api.whatsapp_service.get_whatsapp_status',
                        return_value={'connected': True}), \
                mock.patch('apps.daily_summary.send.is_enabled', return_value=True):
            self.assertIsNone(daily_summary.whatsapp_session(self.tenant))


class BoutiqueSwitchTests(SwitchTestCase):

    def setUp(self):
        super().setUp()
        self.client = TenantClient(self.tenant)
        self.owner = User.objects.create_user('owner@switch.test', 'owner@switch.test', 'x')
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=self.owner).key}'
        self.url = '/api/boutique-settings/whatsapp-sending/'

    def put(self, body):
        return self.client.put(self.url, body, content_type='application/json')

    def test_the_owner_switches_it_off_and_on(self):
        res = self.put({'enabled': False})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(res.json()['boutiqueSendingEnabled'])
        self.assertFalse(whatsapp_service.boutique_sending_enabled())
        self.assertTrue(self.put({'enabled': True}).json()['boutiqueSendingEnabled'])
        self.assertTrue(whatsapp_service.boutique_sending_enabled())

    def test_anything_but_true_or_false_is_refused(self):
        self.assertEqual(self.put({'enabled': 'maybe'}).status_code, 400)
        self.assertEqual(self.put({}).status_code, 400)
        self.assertTrue(whatsapp_service.boutique_sending_enabled())

    def test_someone_else_cannot_switch_it(self):
        from crm_api.models import Tailor
        user = User.objects.create_user('tailor@switch.test', 'tailor@switch.test', 'x')
        Tailor.objects.create(user=user, name='T', role='Tailor')
        client = TenantClient(self.tenant)
        client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=user).key}'
        res = client.put(self.url, {'enabled': False}, content_type='application/json')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(whatsapp_service.boutique_sending_enabled())

    def test_going_off_stands_down_what_is_waiting_to_retry(self):
        message = CustomerMessage.objects.create(
            order=self.order, template_key='manual', to_number='919876500001', body='hello',
            attempts=1, next_attempt_at=timezone.now())
        self.put({'enabled': False})
        message.refresh_from_db()
        self.assertIsNone(message.next_attempt_at)

        self.put({'enabled': True})
        with override_settings(CUSTOMER_MESSAGE_BACKEND=BACKEND), mock.patch(SEND, return_value=OK) as send:
            self.assertEqual(messaging.send_due(), {})
        send.assert_not_called()

    @override_settings(CUSTOMER_MESSAGE_BACKEND=BACKEND)
    def test_a_message_queued_before_it_went_off_does_not_leave_after(self):
        with self.captureOnCommitCallbacks(execute=False):
            message = messaging.send_customer_message(self.order, 'manual', 'hello')
        self.boutique_off()
        with mock.patch(SEND, return_value=OK) as send:
            messaging.attempt(message.pk)
        send.assert_not_called()
        message.refresh_from_db()
        self.assertEqual(message.status, 'QUEUED')
        self.assertIn('switched off', message.error)

    def test_off_means_a_connected_boutique_sends_no_order_message(self):
        self.boutique_off()
        with mock.patch(SEND) as send:
            self.assertIsNone(messaging.send_customer_message(self.order, 'manual', 'hello'))
        send.assert_not_called()
        self.assertFalse(CustomerMessage.objects.exists())

    def test_off_sends_the_daily_summary_by_email(self):
        self.boutique_off()
        with mock.patch('crm_api.whatsapp_service.get_whatsapp_status',
                        return_value={'connected': True}), \
                mock.patch('apps.daily_summary.send.is_enabled', return_value=True):
            self.assertIsNone(daily_summary.whatsapp_session(self.tenant))

    def test_the_status_answers_both_switches(self):
        with mock.patch('crm_api.whatsapp_views.get_whatsapp_status',
                        return_value={'connected': True, 'status': 'connected', 'qrCode': None}):
            self.boutique_off()
            with override_settings(WHATSAPP_SENDING_ENABLED=True):
                data = self.client.get('/api/whatsapp/status/').json()
        self.assertTrue(data['connected'])
        self.assertTrue(data['sendingEnabled'])
        self.assertFalse(data['boutiqueSendingEnabled'])

    def test_the_send_endpoint_respects_the_boutique_switch(self):
        self.boutique_off()
        with mock.patch('crm_api.whatsapp_service.requests.post') as post:
            res = self.client.post('/api/whatsapp/send/', {'phone': '919876500001', 'message': 'hi'},
                                   content_type='application/json')
        self.assertEqual(res.status_code, 403)
        post.assert_not_called()
