"""The console's outbound log: who the product messaged, written at the two places
everything leaves through, and never what it said."""
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.mail import EmailMultiAlternatives, get_connection, send_mail
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import get_public_schema_name
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.email_service.services.email_service import EmailService
from crm_api import whatsapp_service
from superadmin import outbound
from superadmin.models import AuditLog, OutboundMessage

LOGGED_EMAIL = dict(EMAIL_BACKEND='apps.email_service.backends.LoggingEmailBackend',
                    EMAIL_DELIVERY_BACKEND='django.core.mail.backends.locmem.EmailBackend')


def a_response(status_code=200, body=None):
    response = mock.Mock(status_code=status_code, headers={'content-type': 'application/json'})
    response.json.return_value = body if body is not None else {'data': {'messageId': 'w1'}}
    return response


class WhatsAppLogTests(TenantTestCase):

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)

    def test_a_sent_message_is_logged_under_the_boutique_without_its_text(self):
        with mock.patch('crm_api.whatsapp_service.requests.post', return_value=a_response()):
            whatsapp_service.send_whatsapp_message(
                '919876500001', '123456 is your verification code', tenant=self.tenant,
                purpose='portal_code')
        row = OutboundMessage.objects.get()
        self.assertEqual((row.channel, row.recipient, row.status, row.boutique, row.purpose),
                         ('whatsapp', '919876500001', 'sent', self.tenant.schema_name, 'portal_code'))
        for field in OutboundMessage._meta.fields:
            self.assertNotIn('123456', str(getattr(row, field.name)))

    def test_a_refusal_is_logged_with_the_reason(self):
        with mock.patch('crm_api.whatsapp_service.requests.post',
                        return_value=a_response(503, {'message': 'not connected'})):
            whatsapp_service.send_whatsapp_message('919876500001', 'hi', tenant=self.tenant)
        row = OutboundMessage.objects.get()
        self.assertEqual((row.status, row.error), ('failed', 'not connected'))

    def test_an_unreachable_service_is_logged_as_failed(self):
        with mock.patch('crm_api.whatsapp_service.requests.post', side_effect=OSError('refused')):
            result = whatsapp_service.send_whatsapp_message('919876500001', 'hi', tenant=self.tenant)
        self.assertFalse(result['success'])
        row = OutboundMessage.objects.get()
        self.assertEqual((row.status, row.error), ('failed', 'refused'))

    def test_a_document_is_logged_too(self):
        with mock.patch('crm_api.whatsapp_service.requests.post', return_value=a_response()):
            whatsapp_service.send_whatsapp_document(
                '919876500001', b'%PDF', 'a.pdf', tenant=self.tenant, purpose='invoice')
        self.assertEqual(OutboundMessage.objects.get().purpose, 'invoice')

    @override_settings(WHATSAPP_SENDING_ENABLED=False)
    def test_the_switch_being_off_is_logged_as_blocked(self):
        whatsapp_service.send_whatsapp_message('919876500001', 'hi', tenant=self.tenant)
        self.assertEqual(OutboundMessage.objects.get().status, 'blocked')

    def test_a_log_that_cannot_be_written_does_not_stop_the_message(self):
        with mock.patch('crm_api.whatsapp_service.requests.post', return_value=a_response()), \
                mock.patch.object(OutboundMessage.objects, 'bulk_create', side_effect=RuntimeError('no table')):
            result = whatsapp_service.send_whatsapp_message('919876500001', 'hi', tenant=self.tenant)
        self.assertTrue(result['success'])

    def test_the_connection_is_left_on_the_boutique(self):
        outbound.record('whatsapp', ['919876500001'], 'sent')
        self.assertEqual(connection.schema_name, self.tenant.schema_name)
        self.assertEqual(OutboundMessage.objects.get().boutique, self.tenant.schema_name)


@override_settings(**LOGGED_EMAIL)
class EmailLogTests(TestCase):

    def test_send_mail_is_logged_and_still_delivered(self):
        send_mail('Your order', 'the secret body', 'from@x.test', ['a@x.test'])
        self.assertEqual(len(mail.outbox), 1)
        row = OutboundMessage.objects.get()
        self.assertEqual((row.channel, row.recipient, row.status, row.subject),
                         ('email', 'a@x.test', 'sent', 'Your order'))
        for field in OutboundMessage._meta.fields:
            self.assertNotIn('secret', str(getattr(row, field.name)))

    def test_a_multipart_email_sent_directly_is_logged(self):
        email = EmailMultiAlternatives('Stage update', 'body', 'from@x.test', ['a@x.test'])
        email.attach_alternative('<p>body</p>', 'text/html')
        email.send()
        self.assertEqual(OutboundMessage.objects.get().recipient, 'a@x.test')

    def test_every_recipient_gets_a_row(self):
        result = EmailService.send_bulk_email('News', ['a@x.test', 'b@x.test'], 'body', from_email='from@x.test')
        self.assertTrue(result['success'])
        self.assertEqual(set(OutboundMessage.objects.values_list('recipient', flat=True)),
                         {'from@x.test', 'a@x.test', 'b@x.test'})

    def test_a_failure_is_logged_and_still_raised(self):
        with mock.patch('django.core.mail.backends.locmem.EmailBackend.send_messages',
                        side_effect=OSError('smtp down')):
            with self.assertRaises(OSError):
                get_connection().send_messages([mail.EmailMessage('S', 'b', 'f@x.test', ['a@x.test'])])
        row = OutboundMessage.objects.get()
        self.assertEqual((row.status, row.error), ('failed', 'smtp down'))

    def test_a_platform_email_has_no_boutique(self):
        connection.set_schema(get_public_schema_name())
        send_mail('Welcome', 'body', 'from@x.test', ['a@x.test'])
        self.assertEqual(OutboundMessage.objects.get().boutique, '')


class ConsoleTests(TestCase):

    def setUp(self):
        self.admin = User.objects.create_superuser('platform@x.test', 'platform@x.test', 'x')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.admin).key}')
        self.url = reverse('superadmin-outbound-messages')
        for channel, recipient, status_, boutique in (
                ('whatsapp', '919876500001', 'sent', 'acme'),
                ('whatsapp', '919876500002', 'failed', 'acme'),
                ('email', 'a@x.test', 'sent', 'other'),
                ('whatsapp', '919876500003', 'blocked', '')):
            OutboundMessage.objects.create(channel=channel, recipient=recipient, status=status_,
                                           boutique=boutique, purpose='birthday')

    def test_it_lists_newest_first_with_the_day_counted(self):
        data = self.client.get(self.url).json()
        self.assertEqual(data['count'], 4)
        self.assertEqual(data['entries'][0]['recipient'], '919876500003')
        self.assertEqual(data['entries'][0]['what'], 'Birthday wish')
        self.assertEqual(data['summary'], {'whatsapp_sent': 1, 'email_sent': 1, 'failed': 1, 'blocked': 1})

    def test_it_filters(self):
        def recipients(**params):
            return {e['recipient'] for e in self.client.get(self.url, params).json()['entries']}
        self.assertEqual(recipients(channel='email'), {'a@x.test'})
        self.assertEqual(recipients(status='failed'), {'919876500002'})
        self.assertEqual(recipients(boutique='other'), {'a@x.test'})
        self.assertEqual(recipients(q='500003'), {'919876500003'})

    def test_it_pages(self):
        data = self.client.get(self.url, {'page_size': 3, 'page': 2}).json()
        self.assertEqual((data['pages'], len(data['entries'])), (2, 1))

    def test_an_unknown_filter_value_is_refused_not_answered_with_nothing(self):
        self.assertEqual(self.client.get(self.url, {'channel': 'sms'}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {'status': 'nope'}).status_code, 400)

    def test_each_look_is_audited(self):
        self.client.get(self.url, {'q': '500003'})
        entry = AuditLog.objects.filter(action='data.view', target='outbound-messages').get()
        self.assertEqual(entry.after['search'], '500003')

    def test_only_a_platform_admin_can_read_it(self):
        self.assertIn(APIClient().get(self.url).status_code, (401, 403))
        user = User.objects.create_user('staff@x.test', 'staff@x.test', 'x')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        self.assertIn(client.get(self.url).status_code, (401, 403))
