"""The Send button on an invoice: the PDF to the customer's WhatsApp, and
an answer saying how it went."""
from unittest import mock

from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import BoutiqueSettings, CustomerMessage, OrderActivity
from crm_api.test_workflow import WorkflowTestBase

SENT = {'success': True, 'data': {'messageId': 'd1'}}


class SendInvoiceTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Send Invoice Atelier"
        return tenant

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )
        return client

    def send(self, order, user=None):
        return self.client_for(user or self.owner).post(f"/api/orders/{order.id}/send-invoice/")

    def test_sends_the_pdf_and_says_so(self):
        order = self.make_order()
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_document', return_value=SENT) as document:
            res = self.send(order)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['outcome'], 'sent')
        self.assertEqual(res.json()['message']['status'], 'SENT')
        pdf = document.call_args.kwargs
        self.assertTrue(pdf['content'].startswith(b'%PDF'))
        self.assertTrue(pdf['filename'].endswith('.pdf'))
        self.assertTrue(OrderActivity.objects.filter(order=order, event_type='INVOICE_SENT').exists())

    def test_a_failed_first_try_is_reported_and_retried_later(self):
        order = self.make_order()
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_document',
                        return_value={'success': False, 'error': 'WhatsApp is not connected'}):
            res = self.send(order)
        self.assertEqual(res.json()['outcome'], 'retrying')
        self.assertIn('not connected', res.json()['message']['error'])
        message = CustomerMessage.objects.get(order=order, template_key='invoice')
        self.assertEqual(message.status, 'QUEUED')
        self.assertIsNotNone(message.next_attempt_at)

    @override_settings(CUSTOMER_MESSAGE_BACKEND='')
    def test_without_a_sender_it_is_left_to_send_by_hand(self):
        res = self.send(self.make_order())
        self.assertEqual(res.json()['outcome'], 'manual')
        self.assertTrue(res.json()['message']['whatsapp_url'].startswith('https://wa.me/'))

    def test_messaging_switched_off_is_refused(self):
        BoutiqueSettings.objects.update_or_create(id=1, defaults={'customer_messaging_enabled': False})
        res = self.send(self.make_order())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(CustomerMessage.objects.filter(template_key='invoice').exists())

    def test_only_owner_or_master(self):
        res = self.send(self.make_order(), user=self.tailor_user)
        self.assertEqual(res.status_code, 403)
