"""Django's side of whatsapp_service's protected /whatsapp/status route. The answer
carries the pairing QR, so the secret must go with every request, and a refusal
must read as disconnected rather than crash the Settings page."""
from unittest import mock

from django.test import SimpleTestCase, override_settings

from crm_api.whatsapp_service import get_whatsapp_status


def a_response(status_code, body):
    response = mock.Mock(status_code=status_code, headers={'content-type': 'application/json'})
    response.json.return_value = body
    return response


@override_settings(INTERNAL_API_SECRET='the-secret', WHATSAPP_SERVICE_URL='https://wa.example')
class StatusClientTests(SimpleTestCase):

    def test_it_sends_the_secret(self):
        answer = {'success': True, 'connected': False, 'status': 'connecting', 'qrCode': 'data:image/png;base64,x'}
        with mock.patch('crm_api.whatsapp_service.requests.get', return_value=a_response(200, answer)) as get:
            self.assertEqual(get_whatsapp_status(session_id='acme'), answer)
        self.assertEqual(get.call_args.args[0], 'https://wa.example/whatsapp/status?sessionId=acme')
        self.assertEqual(get.call_args.kwargs['headers']['X-Internal-API-Secret'], 'the-secret')

    def test_a_refused_secret_reads_as_disconnected_with_no_qr(self):
        refusal = a_response(401, {'success': False, 'error': 'Unauthorized'})
        with mock.patch('crm_api.whatsapp_service.requests.get', return_value=refusal):
            result = get_whatsapp_status(session_id='acme')
        self.assertFalse(result['connected'])
        self.assertEqual(result['status'], 'disconnected')
        self.assertIsNone(result['qrCode'])
        self.assertIn('401', result['error'])
