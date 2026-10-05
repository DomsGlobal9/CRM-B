"""Superadmin granting and withdrawing Customer Portal API access.

The questions here are whether access defaults to closed, whether withdrawing
it actually stops the key working, and whether the plaintext key escapes
anywhere other than the one reply that mints it.
"""

from unittest import mock

from django.core.management import call_command
from django.db import connection, transaction
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from superadmin import portal_access
from superadmin.tests import admin_client
from tenants import portal_credentials
from tenants.middleware import clear_tenant_cache
from tenants.models import BoutiqueTenant, PortalCredential
from tenants.provision import provision_tenant


class FakeRedis:
    """Enough of Upstash for the portal's OTP store."""

    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    def delete(self, key):
        self.data.pop(key, None)
        return True

    def incr(self, key):
        self.data[key] = int(self.data.get(key, 0)) + 1
        return self.data[key]

    def expire(self, key, seconds):
        return True

    def ttl(self, key):
        return 300


class PortalAccessTestCase(TransactionTestCase):

    SCHEMAS = ('pa_sarala', 'pa_royal')

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command('ensure_base_schema')

    def _drop_schemas(self):
        connection.set_schema_to_public()
        with connection.cursor() as cursor:
            for schema in self.SCHEMAS:
                cursor.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')

    def setUp(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()
        self._drop_schemas()
        call_command('ensure_base_schema')

        with transaction.atomic():
            self.sarala = provision_tenant(
                schema_name='pa_sarala', owner_email='sarala@example.test',
                name='Sarala Boutique', shop_slug='saralaboutique')
        with transaction.atomic():
            self.royal = provision_tenant(
                schema_name='pa_royal', owner_email='royal@example.test',
                name='Royal Fashion Boutique', shop_slug='royalfashionboutique')
        connection.set_schema_to_public()
        clear_tenant_cache()

        self.console = admin_client()
        self.redis = FakeRedis()
        patcher = mock.patch(
            'apps.email_service.services.redis_service.get_redis_client',
            return_value=self.redis)
        patcher.start()
        self.addCleanup(patcher.stop)
        sender = mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                            return_value={'success': True})
        sender.start()
        self.addCleanup(sender.stop)

    def tearDown(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        for tenant in (getattr(self, 'sarala', None), getattr(self, 'royal', None)):
            if tenant is None:
                continue
            try:
                tenant.delete(force_drop=True)
            except Exception:
                pass
        self._drop_schemas()

    # -- helpers ---------------------------------------------------------

    def url(self, schema='pa_sarala'):
        return f'/api/superadmin/boutiques/{schema}/portal-access/'

    def act(self, action, schema='pa_sarala', **body):
        payload = {'action': action, 'reason': 'Granting portal access for the pilot.'}
        payload.update(body)
        res = self.console.post(self.url(schema), payload, format='json')
        connection.set_schema_to_public()
        return res

    def portal_call(self, key, slug='saralaboutique'):
        """One real portal request, which is the only honest test of access."""
        res = APIClient().post(
            f'/intake/{slug}/customer/verify/request/',
            {'mobile_number': '9876543210'}, format='json',
            HTTP_X_PORTAL_KEY=key)
        connection.set_schema_to_public()
        return res


class AccessStateTests(PortalAccessTestCase):

    def test_access_is_closed_until_it_is_granted(self):
        body = self.console.get(self.url()).json()
        self.assertFalse(body['enabled'])
        self.assertIsNone(body['api_key'])
        self.assertIsNone(body['key_id'])

    def test_a_new_boutique_cannot_use_the_portal_api(self):
        self.assertEqual(self.portal_call('anything.at.all').status_code, 404)

    def test_enabling_generates_a_key_and_opens_the_api(self):
        res = self.act('enable')
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(body['enabled'])
        self.assertTrue(body['show_once'])
        self.assertIn('.', body['api_key'])

        self.assertEqual(self.portal_call(body['api_key']).status_code, 200)

    def test_revoking_stops_the_key_at_once(self):
        key = self.act('enable').json()['api_key']
        self.assertEqual(self.portal_call(key).status_code, 200)

        revoked = self.act('revoke')
        self.assertEqual(revoked.status_code, 200, revoked.content)
        self.assertFalse(revoked.json()['enabled'])
        self.assertEqual(self.portal_call(key).status_code, 404)

    def test_re_enabling_issues_a_new_key_and_the_old_stays_dead(self):
        first = self.act('enable').json()['api_key']
        self.act('revoke')
        second = self.act('enable').json()['api_key']

        self.assertNotEqual(first, second)
        self.assertEqual(self.portal_call(first).status_code, 404)
        self.assertEqual(self.portal_call(second).status_code, 200)

    def test_rotating_replaces_the_key(self):
        first = self.act('enable').json()['api_key']
        second = self.act('rotate').json()['api_key']

        self.assertNotEqual(first, second)
        self.assertEqual(self.portal_call(first).status_code, 404)
        self.assertEqual(self.portal_call(second).status_code, 200)

    def test_rotating_without_access_is_refused(self):
        res = self.act('rotate')
        self.assertEqual(res.status_code, 400)
        self.assertNotIn('api_key', res.json())

    def test_an_unknown_action_is_refused(self):
        self.assertEqual(self.act('delete_everything').status_code, 400)

    def test_the_website_origin_is_kept_and_reported(self):
        self.act('enable', allowed_origin='https://sarala.example')
        body = self.console.get(self.url()).json()
        self.assertEqual(body['allowed_origin'], 'https://sarala.example')

    def test_revoking_closes_the_module_gate_as_well(self):
        self.act('enable')
        self.act('revoke')
        connection.set_schema_to_public()
        tenant = BoutiqueTenant.objects.get(schema_name='pa_sarala')
        self.assertIs(tenant.enabled_modules.get('customer_portal'), False)


class KeySecrecyTests(PortalAccessTestCase):

    def test_the_key_is_returned_only_when_it_is_minted(self):
        minted = self.act('enable').json()
        self.assertTrue(minted['api_key'])

        later = self.console.get(self.url()).json()
        self.assertIsNone(later['api_key'])
        self.assertNotIn('show_once', later)

    def test_only_a_hash_is_stored(self):
        key = self.act('enable').json()['api_key']
        secret = key.partition('.')[2]
        connection.set_schema_to_public()
        row = PortalCredential.objects.get(key_id=key.partition('.')[0])
        self.assertNotEqual(row.secret_hash, secret)
        self.assertNotIn(secret, row.secret_hash)

    def test_the_secret_is_not_in_the_audit_trail(self):
        key = self.act('enable').json()['api_key']
        secret = key.partition('.')[2]
        connection.set_schema_to_public()
        from superadmin.models import AuditLog
        entries = AuditLog.objects.filter(action__startswith='boutique.portal_access')
        self.assertTrue(entries.exists())
        for entry in entries:
            self.assertNotIn(secret, str(entry.before) + str(entry.after))

    def test_the_boutique_list_never_carries_a_key(self):
        key = self.act('enable').json()['api_key']
        secret = key.partition('.')[2]
        for path in ('/api/superadmin/boutiques/',
                     '/api/superadmin/boutiques/pa_sarala/',
                     '/api/superadmin/support/pa_sarala/'):
            res = self.console.get(path)
            self.assertNotIn(secret, res.content.decode(), path)


class AccessAuthorisationTests(PortalAccessTestCase):

    def test_an_anonymous_caller_is_refused(self):
        anon = APIClient()
        self.assertIn(anon.get(self.url()).status_code, (401, 403))
        self.assertIn(
            anon.post(self.url(), {'action': 'enable'}, format='json').status_code,
            (401, 403))

    def test_a_boutique_owner_token_is_refused(self):
        from django.contrib.auth.models import User
        from django_tenants.utils import schema_context
        from rest_framework.authtoken.models import Token

        with schema_context('pa_sarala'):
            owner = User.objects.create_user(username='sarala@example.test',
                                             email='sarala@example.test',
                                             password='owner-pass-123')
            token = Token.objects.create(user=owner).key
        connection.set_schema_to_public()

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertIn(client.get(self.url()).status_code, (401, 403))
        self.assertIn(
            client.post(self.url(), {'action': 'enable'}, format='json').status_code,
            (401, 403))

        connection.set_schema_to_public()
        self.assertFalse(portal_access.status(self.sarala)['enabled'])

    def test_an_unknown_boutique_is_404(self):
        self.assertEqual(self.console.get(self.url('nosuch')).status_code, 404)


class CrossBoutiqueTests(PortalAccessTestCase):

    def test_one_boutiques_key_does_not_work_at_another(self):
        sarala_key = self.act('enable', schema='pa_sarala').json()['api_key']
        self.act('enable', schema='pa_royal')

        self.assertEqual(self.portal_call(sarala_key, 'saralaboutique').status_code, 200)
        self.assertEqual(
            self.portal_call(sarala_key, 'royalfashionboutique').status_code, 404)

    def test_revoking_one_boutique_leaves_the_other_working(self):
        sarala_key = self.act('enable', schema='pa_sarala').json()['api_key']
        royal_key = self.act('enable', schema='pa_royal').json()['api_key']

        self.act('revoke', schema='pa_sarala')

        self.assertEqual(self.portal_call(sarala_key, 'saralaboutique').status_code, 404)
        self.assertEqual(
            self.portal_call(royal_key, 'royalfashionboutique').status_code, 200)

    def test_an_invalid_key_is_refused(self):
        self.act('enable')
        for bogus in ('', 'nonsense', 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbb'):
            self.assertEqual(self.portal_call(bogus).status_code, 404, bogus)


class PortalStillWorksTests(PortalAccessTestCase):
    """Granting access must change who may call, and nothing about the flow."""

    def test_the_whole_otp_and_intake_flow_runs_once_access_is_granted(self):
        from django_tenants.utils import schema_context

        from crm_api.models import Customer

        key = self.act('enable').json()['api_key']
        client = APIClient()
        headers = {'HTTP_X_PORTAL_KEY': key}

        sent = []
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                        side_effect=lambda **kw: (sent.append(kw) or {'success': True})):
            res = client.post('/intake/saralaboutique/customer/verify/request/',
                              {'mobile_number': '9876543210'}, format='json', **headers)
            self.assertEqual(res.status_code, 200, res.content)
        code = ''.join(c for c in sent[-1]['message_text'].split(' ', 1)[0] if c.isdigit())

        res = client.post('/intake/saralaboutique/customer/verify/',
                          {'mobile_number': '9876543210', 'code': code},
                          format='json', **headers)
        self.assertEqual(res.status_code, 200, res.content)
        token = res.json()['token']

        res = client.get('/intake/saralaboutique/customer/profile/',
                         HTTP_AUTHORIZATION=f'Bearer {token}', **headers)
        self.assertEqual(res.json(), {'exists': False, 'profile': None})

        res = client.post('/intake/saralaboutique/customers/',
                          {'first_name': 'Asha', 'last_name': 'Rao'},
                          format='json', HTTP_AUTHORIZATION=f'Bearer {token}', **headers)
        self.assertEqual(res.status_code, 201, res.content)

        connection.set_schema_to_public()
        with schema_context('pa_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
            self.assertEqual(customer.first_name, 'Asha')
            self.assertEqual(customer.source, 'Website')
        connection.set_schema_to_public()
