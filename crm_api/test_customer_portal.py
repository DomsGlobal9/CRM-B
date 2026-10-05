"""The customer portal's public API, tested as an attacker would reach it.

Redis and WhatsApp are both replaced here. Neither is what these tests are
about: the questions are whether a boutique can be named by a stranger, whether
a code can be reused, and whether any reply says more about a customer than the
holder has proved they are entitled to.
"""

from unittest import mock

from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import connection, transaction
from django.test import SimpleTestCase, TransactionTestCase
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from crm_api import portal_otp, portal_tokens
from crm_api.models import Customer
from tenants import portal_credentials
from tenants.middleware import clear_tenant_cache
from tenants.models import BoutiqueTenant, PortalCredential
from tenants.provision import provision_tenant


class FakeRedis:
    """Enough of Upstash for the OTP store, with a switch to make it fail."""

    def __init__(self):
        self.data = {}
        self.broken = False

    def _check(self):
        if self.broken:
            raise RuntimeError('redis down')

    def get(self, key):
        self._check()
        return self.data.get(key)

    def set(self, key, value, ex=None, nx=False):
        self._check()
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    def delete(self, key):
        self._check()
        self.data.pop(key, None)
        return True

    def incr(self, key):
        self._check()
        value = int(self.data.get(key, 0)) + 1
        self.data[key] = value
        return value

    def expire(self, key, seconds):
        self._check()
        return True

    def ttl(self, key):
        self._check()
        return 300


class PortalTestCase(TransactionTestCase):
    """Two real boutiques, each with its own portal credential."""

    #: Fixed names, so the schemas are dropped by SQL rather than hoped away.
    #: BoutiqueTenant.delete(force_drop=True) can fail -- a connection still
    #: inside the schema is enough -- and a surviving schema makes the NEXT
    #: class clone into one that already has tables, which fails in ways that
    #: look nothing like the cause. Dropping before and after is cheap and
    #: leaves no order dependence between classes.
    SCHEMAS = ('pt_sarala', 'pt_royal')

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
                schema_name='pt_sarala', owner_email='sarala@example.test',
                name='Sarala Boutique', shop_slug='saralaboutique')
        with transaction.atomic():
            self.royal = provision_tenant(
                schema_name='pt_royal', owner_email='royal@example.test',
                name='Royal Fashion Boutique', shop_slug='royalfashionboutique')
        connection.set_schema_to_public()
        clear_tenant_cache()

        _, self.sarala_key = portal_credentials.issue(
            self.sarala, label='Sarala site', allowed_origin='https://sarala.example')
        _, self.royal_key = portal_credentials.issue(
            self.royal, label='Royal site', allowed_origin='https://royal.example')

        self.redis = FakeRedis()
        patcher = mock.patch('apps.email_service.services.redis_service.get_redis_client',
                             return_value=self.redis)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.sent = []
        sender = mock.patch(
            'crm_api.whatsapp_service.send_whatsapp_message',
            side_effect=lambda **kw: (self.sent.append(kw) or {'success': True}))
        sender.start()
        self.addCleanup(sender.stop)

        self.client = APIClient()

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

    def url(self, tail):
        return f'/intake/{tail}'

    def request_code(self, mobile='9876543210', key=None, **extra):
        return self.client.post(
            self.url('customer/verify/request/'),
            {'mobile_number': mobile, **extra}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key if key is None else key)

    def last_code(self):
        """The code as the customer received it -- the only place it is readable."""
        message = self.sent[-1]['message_text']
        return ''.join(ch for ch in message.split(' ', 1)[0] if ch.isdigit())

    def verify(self, mobile='9876543210', code=None, key=None):
        return self.client.post(
            self.url('customer/verify/'),
            {'mobile_number': mobile, 'code': code or self.last_code()}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key if key is None else key)

    def token_for(self, mobile='9876543210', key=None):
        self.request_code(mobile=mobile, key=key)
        res = self.verify(mobile=mobile, key=key)
        assert res.status_code == 200, res.content
        return res.json()['token']

    def make_customer(self, schema='pt_sarala', mobile='919876543210', **fields):
        with schema_context(schema):
            return Customer.objects.create(
                first_name=fields.pop('first_name', 'Asha'),
                last_name=fields.pop('last_name', 'Rao'),
                mobile_number=mobile, **fields)


class TenantResolutionTests(PortalTestCase):
    """The key names the boutique. Nothing the caller writes does."""

    def test_the_key_reaches_its_own_boutique(self):
        res = self.request_code()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['sent'])
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_sarala')

    def test_each_key_reaches_a_different_boutique(self):
        self.request_code(key=self.sarala_key)
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_sarala')
        self.request_code(mobile='9000000001', key=self.royal_key)
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_royal')

    def test_no_key_is_refused(self):
        res = self.client.post(self.url('customer/verify/request/'),
                               {'mobile_number': '9876543210'}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertNotIn('sent', res.json())

    def test_an_inactive_boutique_is_refused(self):
        BoutiqueTenant.objects.filter(pk=self.sarala.pk).update(is_active=False)
        clear_tenant_cache()
        self.assertEqual(self.request_code().status_code, 404)

    def test_a_switched_off_module_is_refused(self):
        BoutiqueTenant.objects.filter(pk=self.sarala.pk).update(
            enabled_modules={'customer_portal': False})
        clear_tenant_cache()
        self.assertEqual(self.request_code().status_code, 404)

    def test_x_tenant_id_cannot_choose_the_boutique(self):
        res = self.client.post(
            self.url('customer/verify/request/'),
            {'mobile_number': '9876543210'}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key, HTTP_X_TENANT_ID='pt_royal')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_sarala')

    def test_a_tenant_named_in_the_body_is_ignored(self):
        res = self.client.post(
            self.url('customer/verify/request/'),
            {'mobile_number': '9876543210', 'tenant': 'pt_royal',
             'schema_name': 'pt_royal', 'shop_slug': 'royalfashionboutique'},
            format='json', HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_sarala')

    def test_a_tenant_named_in_the_query_string_is_ignored(self):
        res = self.client.post(
            self.url('customer/verify/request/') + '?tenant=pt_royal&shop_slug=royalfashionboutique',
            {'mobile_number': '9876543210'}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.sent[-1]['tenant'].schema_name, 'pt_sarala')

    def test_the_old_slug_urls_are_gone(self):
        res = self.client.post(
            '/intake/saralaboutique/customer/verify/request/',
            {'mobile_number': '9876543210'}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 404)


class PortalCredentialTests(PortalTestCase):

    def test_a_missing_credential_is_refused(self):
        res = self.client.post(
            self.url('customer/verify/request/'),
            {'mobile_number': '9876543210'}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_an_invalid_credential_is_refused(self):
        self.assertEqual(self.request_code(key='abcdef.nonsense').status_code, 404)
        self.assertEqual(self.request_code(key='not-even-shaped-right').status_code, 404)

    def test_a_revoked_credential_is_refused(self):
        row = PortalCredential.objects.get(tenant=self.sarala)
        portal_credentials.revoke(row)
        self.assertEqual(self.request_code().status_code, 404)

    def test_rotation_replaces_the_value(self):
        row = PortalCredential.objects.get(tenant=self.sarala)
        fresh = portal_credentials.rotate(row)
        self.assertEqual(self.request_code(key=self.sarala_key).status_code, 404)
        self.assertEqual(self.request_code(key=fresh).status_code, 200)

    def test_only_the_hash_is_stored(self):
        row = PortalCredential.objects.get(tenant=self.sarala)
        secret = self.sarala_key.partition('.')[2]
        self.assertNotIn(secret, row.secret_hash)
        self.assertNotEqual(row.secret_hash, secret)

    def test_the_credential_is_never_echoed_in_a_reply(self):
        res = self.request_code()
        self.assertNotIn(self.sarala_key, res.content.decode())
        self.assertNotIn(self.sarala_key.partition('.')[2], res.content.decode())

    def test_a_credential_cannot_name_a_boutique_it_does_not_belong_to(self):
        row = PortalCredential.objects.get(tenant=self.sarala)
        self.assertIsNone(portal_credentials.resolve(self.sarala_key, self.royal))
        self.assertIsNotNone(portal_credentials.resolve(self.sarala_key, self.sarala))
        self.assertEqual(row.tenant_id, self.sarala.pk)


class OtpTests(PortalTestCase):

    def test_a_code_is_sent_over_whatsapp(self):
        self.request_code()
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]['phone'], '919876543210')
        self.assertRegex(self.last_code(), r'^\d{6}$')

    def test_the_plaintext_code_is_not_in_redis(self):
        self.request_code()
        code = self.last_code()
        for value in self.redis.data.values():
            self.assertNotIn(code, str(value))

    def test_a_correct_code_verifies(self):
        self.request_code()
        res = self.verify()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['verified'])
        self.assertTrue(res.json()['token'])

    def test_a_wrong_code_is_refused(self):
        self.request_code()
        res = self.verify(code='000000')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['error'], 'That code is not valid.')

    def test_a_code_cannot_be_used_twice(self):
        self.request_code()
        code = self.last_code()
        self.assertEqual(self.verify(code=code).status_code, 200)
        self.assertEqual(self.verify(code=code).status_code, 400)

    def test_a_code_cannot_be_used_for_another_mobile(self):
        self.request_code(mobile='9876543210')
        code = self.last_code()
        res = self.verify(mobile='9000000001', code=code)
        self.assertEqual(res.status_code, 400)

    def test_a_code_cannot_be_used_at_another_boutique(self):
        self.request_code()
        code = self.last_code()
        res = self.verify(code=code, key=self.royal_key)
        self.assertEqual(res.status_code, 400)

    def test_too_many_wrong_answers_destroy_the_code(self):
        self.request_code()
        code = self.last_code()
        for _ in range(portal_otp.MAX_ATTEMPTS):
            self.assertEqual(self.verify(code='000000').status_code, 400)
        # Even the right answer no longer works.
        self.assertEqual(self.verify(code=code).status_code, 400)

    def test_an_expired_code_is_refused(self):
        self.request_code()
        code = self.last_code()
        self.redis.data.clear()  # what expiry leaves behind
        self.assertEqual(self.verify(code=code).status_code, 400)

    def test_issuing_again_invalidates_the_previous_code(self):
        self.request_code()
        first = self.last_code()
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            self.request_code()
        second = self.last_code()
        self.assertNotEqual(first, second)
        self.assertEqual(self.verify(code=first).status_code, 400)
        self.assertEqual(self.verify(code=second).status_code, 200)

    def test_resend_is_rate_limited(self):
        self.assertEqual(self.request_code().status_code, 200)
        res = self.request_code()
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.json()['error'], 'Too many attempts. Please try again later.')

    def test_sends_per_mobile_are_capped(self):
        limit = portal_otp.PER_MOBILE[0]
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            for _ in range(limit):
                self.assertEqual(self.request_code().status_code, 200)
            self.assertEqual(self.request_code().status_code, 429)

    def test_sends_per_ip_are_capped_across_mobiles(self):
        limit = portal_otp.PER_IP[0]
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            for index in range(limit):
                self.request_code(mobile=f'90000{index:05d}')
            res = self.request_code(mobile='9111111111')
        self.assertEqual(res.status_code, 429)

    def test_a_bad_mobile_is_refused_before_anything_is_sent(self):
        res = self.request_code(mobile='123')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.sent, [])


class FailClosedTests(PortalTestCase):

    def test_redis_down_refuses_to_send(self):
        self.redis.broken = True
        res = self.request_code()
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()['error'],
                         'Phone verification is currently unavailable for this boutique.')
        self.assertEqual(self.sent, [])

    def test_redis_down_refuses_to_verify(self):
        self.request_code()
        code = self.last_code()
        self.redis.broken = True
        res = self.verify(code=code)
        self.assertEqual(res.status_code, 503)
        self.assertNotIn('token', res.json())

    def test_whatsapp_failure_is_reported_without_internals(self):
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                        return_value={'success': False,
                                      'error': 'session pt_sarala disconnected'}):
            res = self.request_code()
        self.assertEqual(res.status_code, 503)
        body = res.content.decode()
        self.assertNotIn('pt_sarala', body)
        self.assertNotIn('session', body)

    def test_whatsapp_exception_does_not_leak(self):
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                        side_effect=RuntimeError('connect to 127.0.0.1:3001 failed')):
            res = self.request_code()
        self.assertEqual(res.status_code, 503)
        self.assertNotIn('3001', res.content.decode())


class EnumerationTests(PortalTestCase):

    def test_the_reply_is_identical_for_a_known_and_unknown_mobile(self):
        self.make_customer(mobile='919876543210')
        known = self.request_code(mobile='9876543210')
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            unknown = self.request_code(mobile='9000000001')
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json(), unknown.json())

    def test_the_send_reply_carries_nothing_about_a_customer(self):
        self.make_customer(mobile='919876543210', first_name='Asha',
                           email_address='asha@example.test')
        body = self.request_code(mobile='9876543210').json()
        self.assertEqual(set(body), {'sent', 'channel', 'expires_in'})
        self.assertNotIn('Asha', str(body))

    def test_a_wrong_code_reads_the_same_for_a_known_and_unknown_mobile(self):
        self.make_customer(mobile='919876543210')
        self.request_code(mobile='9876543210')
        known = self.verify(mobile='9876543210', code='000000')
        unknown = self.verify(mobile='9000000001', code='000000')
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json(), unknown.json())

    def test_there_is_no_public_customer_lookup(self):
        for path in ('/intake/saralaboutique/customer/',
                     '/intake/saralaboutique/customer/check/',
                     '/intake/saralaboutique/customers/search/'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_the_staff_endpoint_is_still_closed(self):
        self.assertIn(self.client.get('/api/customers/').status_code, (400, 401, 403))


class ProfileTests(PortalTestCase):

    def test_an_existing_customer_is_returned_after_verifying(self):
        self.make_customer(mobile='919876543210', first_name='Asha',
                           last_name='Rao', email_address='asha@example.test',
                           city_region='Hyderabad')
        token = self.token_for()
        res = self.client.get(self.url('customer/profile/'),
                              HTTP_AUTHORIZATION=f'Bearer {token}',
                              HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(body['exists'])
        self.assertEqual(body['profile']['first_name'], 'Asha')
        self.assertEqual(body['profile']['city_region'], 'Hyderabad')

    def test_an_unknown_mobile_says_so_without_detail(self):
        token = self.token_for(mobile='9000000001')
        res = self.client.get(self.url('customer/profile/'),
                              HTTP_AUTHORIZATION=f'Bearer {token}',
                              HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.json(), {'exists': False, 'profile': None})

    def test_only_the_approved_fields_come_back(self):
        self.make_customer(mobile='919876543210', notes='Difficult customer',
                           customer_type='Platinum', source='Walk In',
                           occupation='Architect')
        token = self.token_for()
        body = self.client.get(self.url('customer/profile/'),
                               HTTP_AUTHORIZATION=f'Bearer {token}',
                               HTTP_X_PORTAL_KEY=self.sarala_key).json()
        self.assertEqual(set(body['profile']), {
            'first_name', 'last_name', 'email_address', 'address', 'city_region',
            'gender', 'date_of_birth', 'occupation', 'preferred_communication'})
        raw = str(body)
        for leaked in ('Difficult customer', 'Platinum', 'Walk In', 'pt_sarala'):
            self.assertNotIn(leaked, raw, leaked)

    def test_the_customer_id_is_never_exposed(self):
        customer = self.make_customer(mobile='919876543210')
        token = self.token_for()
        raw = self.client.get(self.url('customer/profile/'),
                              HTTP_AUTHORIZATION=f'Bearer {token}',
                              HTTP_X_PORTAL_KEY=self.sarala_key).content.decode()
        self.assertNotIn(str(customer.pk), raw)

    def test_no_token_is_refused(self):
        res = self.client.get(self.url('customer/profile/'),
                              HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 401)

    def test_a_tampered_token_is_refused(self):
        token = self.token_for()
        res = self.client.get(self.url('customer/profile/'),
                              HTTP_AUTHORIZATION=f'Bearer {token[:-3]}xyz',
                              HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 401)

    def test_an_expired_token_is_refused(self):
        token = self.token_for()
        with mock.patch.object(portal_tokens, 'MAX_AGE', -1):
            res = self.client.get(self.url('customer/profile/'),
                                  HTTP_AUTHORIZATION=f'Bearer {token}',
                                  HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 401)

    def test_a_token_from_one_boutique_is_refused_at_another(self):
        token = self.token_for()
        res = self.client.get(self.url('customer/profile/'),
                              HTTP_AUTHORIZATION=f'Bearer {token}',
                              HTTP_X_PORTAL_KEY=self.royal_key)
        self.assertEqual(res.status_code, 401)

    def test_a_token_reads_only_its_own_mobile(self):
        self.make_customer(mobile='919876543210', first_name='Asha')
        self.make_customer(mobile='919000000001', first_name='Other')
        token = self.token_for(mobile='9000000001')
        body = self.client.get(self.url('customer/profile/'),
                               HTTP_AUTHORIZATION=f'Bearer {token}',
                               HTTP_X_PORTAL_KEY=self.sarala_key).json()
        self.assertEqual(body['profile']['first_name'], 'Other')


class IntakeTests(PortalTestCase):

    def submit(self, token, key=None, **fields):
        return self.client.post(
            self.url('customer/'),
            {'first_name': 'Asha', **fields}, format='json',
            HTTP_AUTHORIZATION=f'Bearer {token}',
            HTTP_X_PORTAL_KEY=self.sarala_key if key is None else key)

    def test_a_verified_mobile_can_create_a_customer(self):
        token = self.token_for()
        res = self.submit(token, last_name='Rao', email_address='asha@example.test')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json(), {'saved': True, 'created': True})
        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
        self.assertEqual(customer.first_name, 'Asha')
        self.assertEqual(customer.source, 'Website')

    def test_an_unverified_request_cannot_create_anything(self):
        res = self.client.post(
            self.url('customer/'),
            {'first_name': 'Asha', 'mobile_number': '9876543210'}, format='json',
            HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 401)
        with schema_context('pt_sarala'):
            self.assertEqual(Customer.objects.count(), 0)

    def test_the_client_cannot_choose_the_source(self):
        token = self.token_for()
        self.submit(token, source='Referral')
        with schema_context('pt_sarala'):
            self.assertEqual(
                Customer.objects.get(mobile_number='919876543210').source, 'Website')

    def test_the_client_cannot_write_for_another_mobile(self):
        token = self.token_for(mobile='9876543210')
        res = self.submit(token, mobile_number='9000000001')
        self.assertEqual(res.status_code, 403)
        with schema_context('pt_sarala'):
            self.assertEqual(Customer.objects.count(), 0)

    def test_a_second_submission_does_not_create_a_duplicate(self):
        self.submit(self.token_for())
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            self.submit(self.token_for())
        with schema_context('pt_sarala'):
            self.assertEqual(
                Customer.objects.filter(mobile_number='919876543210').count(), 1)

    def test_an_existing_customer_is_not_overwritten(self):
        self.make_customer(mobile='919876543210', first_name='Asha',
                           last_name='Rao', city_region='Hyderabad')
        token = self.token_for()
        res = self.submit(token, first_name='Someone', last_name='Else',
                          city_region='Mumbai', email_address='new@example.test')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['created'], False)
        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
        self.assertEqual(customer.first_name, 'Asha')
        self.assertEqual(customer.city_region, 'Hyderabad')
        # A field the boutique left blank is allowed to be filled.
        self.assertEqual(customer.email_address, 'new@example.test')

    def test_internal_fields_cannot_be_written(self):
        self.make_customer(mobile='919876543210', notes='Staff note',
                           customer_type='Platinum')
        token = self.token_for()
        self.submit(token, notes='wiped', customer_type='Silver',
                    custom_requirements='x', referred_by='y')
        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
        self.assertEqual(customer.notes, 'Staff note')
        self.assertEqual(customer.customer_type, 'Platinum')

    def test_a_token_is_single_use_for_writing(self):
        token = self.token_for()
        self.assertEqual(self.submit(token).status_code, 201)
        self.assertEqual(self.submit(token).status_code, 401)

    def test_a_concurrent_duplicate_lands_as_one_customer(self):
        # The second insert is what two simultaneous requests produce: the
        # unique index refuses it and the code must fall through to the update
        # rather than 500.
        from crm_api.portal_views import _save
        with schema_context('pt_sarala'):
            self.assertTrue(_save('919876543210', {'first_name': 'Asha'}))
            self.assertFalse(_save('919876543210', {'first_name': 'Asha'}))
            self.assertEqual(Customer.objects.count(), 1)

    def test_tenant_isolation_holds_on_write(self):
        self.submit(self.token_for())
        with schema_context('pt_royal'):
            self.assertEqual(Customer.objects.count(), 0)
        with schema_context('pt_sarala'):
            self.assertEqual(Customer.objects.count(), 1)

    def test_a_token_from_one_boutique_cannot_write_to_another(self):
        # Sarala's token, presented with Royal's key: the key picks Royal, and
        # the token does not belong to Royal, so it is refused.
        token = self.token_for()
        res = self.submit(token, key=self.royal_key)
        self.assertEqual(res.status_code, 401)
        with schema_context('pt_royal'):
            self.assertEqual(Customer.objects.count(), 0)

    def test_the_reply_carries_no_identifiers(self):
        res = self.submit(self.token_for())
        self.assertEqual(set(res.json()), {'saved', 'created'})

    def test_the_honeypot_rejects_a_bot(self):
        token = self.token_for()
        res = self.submit(token, company_website='http://spam.example')
        self.assertEqual(res.status_code, 400)
        with schema_context('pt_sarala'):
            self.assertEqual(Customer.objects.count(), 0)


class TokenUnitTests(SimpleTestCase):

    def test_a_token_carries_no_customer_data(self):
        from django.core import signing
        token = portal_tokens.issue('pt_sarala', '919876543210')
        payload = signing.loads(token, salt=portal_tokens.SALT)
        self.assertEqual(set(payload), {'s', 'm', 'p', 'j'})
        self.assertEqual(payload['p'], portal_tokens.PURPOSE_PROFILE)

    def test_the_purpose_is_checked(self):
        token = portal_tokens.issue('pt_sarala', '919876543210', purpose='something_else')
        self.assertIsNone(portal_tokens.read(token, schema_name='pt_sarala'))

    def test_the_schema_is_checked(self):
        token = portal_tokens.issue('pt_sarala', '919876543210')
        self.assertIsNone(portal_tokens.read(token, schema_name='pt_royal'))
        self.assertIsNotNone(portal_tokens.read(token, schema_name='pt_sarala'))

    def test_codes_are_six_digits_and_not_repeated(self):
        codes = {portal_otp.new_code() for _ in range(200)}
        self.assertGreater(len(codes), 150)
        for code in codes:
            self.assertRegex(code, r'^\d{6}$')


class ProductsTests(PortalTestCase):
    """The garment menu the website offers comes from the boutique's own catalogue."""

    def setUp(self):
        super().setUp()
        from apps.catalog.services import sync_global_templates
        with schema_context('pt_sarala'):
            sync_global_templates()
        connection.set_schema_to_public()

    def test_the_catalogue_is_listed(self):
        res = self.client.get(self.url('products/'),
                              HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 200, res.content)
        products = res.json()['products']
        self.assertTrue(products)
        self.assertEqual(set(products[0]), {'key', 'name'})

    def test_no_key_is_refused(self):
        self.assertEqual(self.client.get(self.url('products/')).status_code, 404)

    def test_nothing_but_key_and_name_is_exposed(self):
        body = self.client.get(self.url('products/'),
                               HTTP_X_PORTAL_KEY=self.sarala_key).content.decode()
        for leaked in ('sections', 'fields', 'base_price', 'design_parts', 'pt_sarala'):
            self.assertNotIn(leaked, body, leaked)


class RequirementTests(PortalTestCase):
    """What the customer wants made, recorded without becoming an order."""

    def submit(self, token, key=None, **fields):
        return self.client.post(
            self.url('customer/product/'), fields, format='json',
            HTTP_AUTHORIZATION=f'Bearer {token}',
            HTTP_X_PORTAL_KEY=self.sarala_key if key is None else key)

    def customer_and_token(self):
        token = self.token_for()
        self.client.post(self.url('customer/'), {'first_name': 'Asha'}, format='json',
                         HTTP_AUTHORIZATION=f'Bearer {token}',
                         HTTP_X_PORTAL_KEY=self.sarala_key)
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            return self.token_for()

    def test_a_requirement_is_recorded(self):
        from crm_api.models import DesignPreference

        token = self.customer_and_token()
        res = self.submit(token, garment_type='Saree', occasion='Wedding',
                          custom_requirements='Gold border please',
                          notes='Something traditional',
                          reference_links=['https://example.test/a.jpg'])
        self.assertEqual(res.status_code, 201, res.content)

        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
            self.assertEqual(customer.garment_type, 'Saree')
            self.assertEqual(customer.occasion, 'Wedding')
            self.assertEqual(customer.custom_requirements, 'Gold border please')
            pref = DesignPreference.objects.get(customer=customer)
            self.assertEqual(pref.source, 'CUSTOM_DESIGN')
            self.assertFalse(pref.is_approved)
            self.assertIn('Something traditional', pref.notes)
            self.assertEqual(pref.reference_links, ['https://example.test/a.jpg'])

    def test_no_order_is_created(self):
        from crm_api.models import Order

        token = self.customer_and_token()
        self.submit(token, garment_type='Saree')
        with schema_context('pt_sarala'):
            self.assertEqual(Order.objects.count(), 0)

    def test_an_unverified_request_is_refused(self):
        res = self.client.post(self.url('customer/product/'),
                               {'garment_type': 'Saree'}, format='json',
                               HTTP_X_PORTAL_KEY=self.sarala_key)
        self.assertEqual(res.status_code, 401)

    def test_a_requirement_before_the_details_form_is_refused(self):
        token = self.token_for()
        res = self.submit(token, garment_type='Saree')
        self.assertEqual(res.status_code, 409)

    def test_internal_fields_cannot_be_written(self):
        token = self.customer_and_token()
        self.submit(token, garment_type='Saree', source='Referral',
                    customer_type='Platinum', notes='mine', total_spend=999)
        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
            self.assertEqual(customer.source, 'Website')
            self.assertEqual(customer.customer_type, 'Silver')
            # `notes` on the customer is staff-owned; the submission's words
            # land on the DesignPreference instead.
            self.assertFalse(customer.notes)

    def test_an_empty_requirement_is_refused(self):
        token = self.customer_and_token()
        self.assertEqual(self.submit(token).status_code, 400)

    def test_a_dangerous_reference_link_is_refused(self):
        token = self.customer_and_token()
        for bad in ('javascript:alert(1)', 'data:text/html,x', '/etc/passwd'):
            res = self.submit(token, garment_type='Saree', reference_links=[bad])
            self.assertEqual(res.status_code, 400, bad)

    def test_each_submission_keeps_its_own_record(self):
        from crm_api.models import DesignPreference

        token = self.customer_and_token()
        self.submit(token, garment_type='Saree', notes='first')
        with mock.patch.object(portal_otp, 'cooling_down', return_value=False):
            second = self.token_for()
        self.submit(second, garment_type='Lehenga', notes='second')

        with schema_context('pt_sarala'):
            customer = Customer.objects.get(mobile_number='919876543210')
            # The latest intent wins on the customer row...
            self.assertEqual(customer.garment_type, 'Lehenga')
            # ...and neither submission is lost.
            notes = [p.notes for p in DesignPreference.objects.filter(customer=customer)]
            self.assertEqual(len(notes), 2)
            self.assertTrue(any('first' in n for n in notes))
            self.assertTrue(any('second' in n for n in notes))

    def test_tenant_isolation_holds(self):
        token = self.customer_and_token()
        self.submit(token, garment_type='Saree')
        with schema_context('pt_royal'):
            from crm_api.models import DesignPreference
            self.assertEqual(DesignPreference.objects.count(), 0)
