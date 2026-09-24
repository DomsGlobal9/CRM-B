"""Access requests replace self-signup.

A request (website demo form or the app's Request access) is saved and the
requester is emailed. A platform administrator approves it in the console,
which creates the boutique with a temporary owner password and emails it.
The owner cannot use anything but the change-password screen until they
have chosen their own password.
"""

from django.core import mail
from django.core.cache import cache
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django_tenants.utils import schema_context
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from superadmin.models import AuditLog, PlatformSetting
from superadmin.tests import admin_client
from tenants.middleware import clear_platform_cache, clear_tenant_cache
from tenants.models import BoutiqueTenant, DemoRequest


LOCMEM = 'django.core.mail.backends.locmem.EmailBackend'

APPROVAL = {
    'first_name': 'Meera', 'last_name': 'Iyer',
    'email': 'meera@silkhouse.test', 'business_name': 'Meera Silk House',
    'phone': '9840011122', 'address': '12 Pondy Bazaar, Chennai 600017',
    'plan': 'atelier', 'reason': 'Signed contract',
}


def request_access(**overrides):
    body = {'name': 'Meera Iyer', 'boutique': 'Meera Silk House',
            'email': 'meera@silkhouse.test', 'phone': '9840011122',
            'source': 'app', 'address': '12 Pondy Bazaar, Chennai 600017'}
    body.update(overrides)
    return APIClient().post('/demo-request/', body)


def drop_boutiques(*emails):
    connection.set_schema_to_public()
    for tenant in BoutiqueTenant.objects.filter(owner_email__in=emails):
        tenant.delete(force_drop=True)
    clear_tenant_cache()


def login(email, password):
    cache.clear()  # LoginThrottle counts failures per address
    return APIClient().post('/api/auth/login/',
                            {'username': email, 'password': password}, format='json')


def signed_in(token, schema):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Token {token}', HTTP_X_TENANT_ID=schema)
    return client


@override_settings(EMAIL_BACKEND=LOCMEM)
class RequestIntakeTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        DemoRequest.objects.all().delete()
        mail.outbox = []

    def test_an_app_request_is_saved_and_the_requester_is_welcomed(self):
        response = request_access()
        self.assertEqual(response.status_code, 201, response.content)

        lead = DemoRequest.objects.get()
        self.assertEqual(lead.source, 'app')
        self.assertIn('Pondy Bazaar', lead.address)
        self.assertEqual(lead.status, 'NEW')
        self.assertIsNotNone(lead.welcome_emailed_at)

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['meera@silkhouse.test'])
        self.assertIn('Meera Silk House', message.body)
        self.assertNotIn('password', message.body.lower())

    def test_a_website_request_without_a_source_is_still_accepted(self):
        response = APIClient().post('/demo-request/', {
            'name': 'Ravi Kumar', 'boutique': 'Ravi Couture',
            'email': 'ravi@couture.test', 'phone': '9840099988',
        })
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(DemoRequest.objects.get().source, 'website')
        self.assertEqual(len(mail.outbox), 1)

    def test_names_in_the_welcome_email_are_escaped(self):
        request_access(boutique='<script>x</script> Silks')
        html = mail.outbox[0].alternatives[0][0]
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)

    def test_an_unknown_source_is_refused(self):
        response = request_access(source='admin')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(DemoRequest.objects.exists())

    def test_a_request_needs_a_boutique_name(self):
        response = request_access(boutique='  ')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(DemoRequest.objects.exists())

    def test_a_mail_outage_does_not_lose_the_request(self):
        from unittest import mock
        with mock.patch('tenants.views.send_request_received', side_effect=RuntimeError):
            response = request_access()
        self.assertEqual(response.status_code, 201)
        lead = DemoRequest.objects.get()
        self.assertIsNone(lead.welcome_emailed_at)


@override_settings(EMAIL_BACKEND=LOCMEM, APP_LOGIN_URL='https://app.example.test/app')
class ApproveTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        DemoRequest.objects.all().delete()
        drop_boutiques(APPROVAL['email'])
        self.lead = DemoRequest.objects.create(
            name='Meera Iyer', boutique='Meera Silk House', email=APPROVAL['email'],
            phone='9840011122', source='app')
        self.console = admin_client()
        mail.outbox = []

    def tearDown(self):
        drop_boutiques(APPROVAL['email'], 'other@silkhouse.test')

    def approve(self, **overrides):
        return self.console.post(f'/api/superadmin/leads/{self.lead.pk}/approve/',
                                 {**APPROVAL, **overrides}, format='json')

    def test_approval_creates_the_boutique_and_emails_a_temporary_password(self):
        response = self.approve()
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        password = body['login']['temporary_password']
        schema = body['boutique']['schema_name']

        tenant = BoutiqueTenant.objects.get(schema_name=schema)
        self.assertEqual(tenant.owner_email, APPROVAL['email'])
        self.assertEqual(tenant.name, 'Meera Silk House')
        self.assertEqual(tenant.plan, 'atelier')
        self.assertTrue(tenant.owner_password_temporary)

        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, 'CONVERTED')
        self.assertEqual(self.lead.tenant_id, tenant.pk)
        self.assertEqual(self.lead.approved_by, 'platform@admin.test')

        from crm_api.models import BoutiqueSettings
        with schema_context(schema):
            settings_row = BoutiqueSettings.objects.get(id=1)
            self.assertFalse(settings_row.customer_messaging_enabled,
                             'a new boutique must not message customers until switched on')
            self.assertEqual(settings_row.phone, '9840011122')

        self.assertTrue(body['emailed'])
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, [APPROVAL['email']])
        self.assertIn(password, message.body)
        self.assertIn('https://app.example.test/app', message.body)

        entry = AuditLog.objects.get(action='lead.approve')
        self.assertEqual(entry.boutique, schema)
        self.assertNotIn(password, str(entry.before) + str(entry.after) + entry.reason)

    def test_a_request_cannot_be_approved_twice(self):
        self.assertEqual(self.approve().status_code, 201)
        second = self.approve(email='other@silkhouse.test')
        self.assertEqual(second.status_code, 409)
        self.assertFalse(BoutiqueTenant.objects.filter(
            owner_email='other@silkhouse.test').exists())

    def test_an_email_that_already_owns_a_boutique_is_refused(self):
        self.assertEqual(self.approve().status_code, 201)
        other = DemoRequest.objects.create(name='Meera Iyer', boutique='Second shop',
                                           email=APPROVAL['email'], phone='9840011122')
        response = self.console.post(f'/api/superadmin/leads/{other.pk}/approve/',
                                     APPROVAL, format='json')
        self.assertEqual(response.status_code, 409)
        other.refresh_from_db()
        self.assertIsNone(other.tenant_id)
        self.assertEqual(BoutiqueTenant.objects.filter(owner_email=APPROVAL['email']).count(), 1)

    def test_junk_is_refused_before_anything_is_provisioned(self):
        for field, value, expected in [
            ('first_name', 'M3era', 'letters'),
            ('email', 'meera@', 'valid email'),
            ('email', '', 'Owner email is required'),
            ('phone', '98400111221', '10-digit'),
            ('business_name', '', 'Boutique name is required'),
            ('business_name', 'b' * 101, '100'),
            ('plan', 'platinum', 'plan'),
        ]:
            response = self.approve(**{field: value})
            self.assertEqual(response.status_code, 400, (field, response.content))
            self.assertIn(expected, response.json()['error'], field)
        self.assertFalse(BoutiqueTenant.objects.filter(owner_email=APPROVAL['email']).exists())
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, 'NEW')

    def test_only_a_platform_admin_can_approve(self):
        response = APIClient().post(f'/api/superadmin/leads/{self.lead.pk}/approve/',
                                    APPROVAL, format='json')
        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(BoutiqueTenant.objects.filter(owner_email=APPROVAL['email']).exists())

    def test_a_failure_part_way_leaves_nothing_behind(self):
        from unittest import mock
        with mock.patch('crm_api.utils.seed_tenant_defaults', side_effect=RuntimeError('boom')):
            response = self.approve()
        self.assertEqual(response.status_code, 500)
        connection.set_schema_to_public()
        self.assertFalse(BoutiqueTenant.objects.filter(owner_email=APPROVAL['email']).exists())
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.tenant_id)
        self.assertEqual(self.lead.status, 'NEW')
        self.assertEqual(mail.outbox, [])

    def test_the_lead_list_shows_the_created_boutique(self):
        schema = self.approve().json()['boutique']['schema_name']
        rows = self.console.get('/api/superadmin/leads/').json()
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual(rows[0]['boutique_schema'], schema)
        self.assertEqual(rows[0]['source'], 'app')


@override_settings(EMAIL_BACKEND=LOCMEM)
class TemporaryPasswordTests(TransactionTestCase):

    EMAIL = 'owner@temppass.test'

    def setUp(self):
        connection.set_schema_to_public()
        drop_boutiques(self.EMAIL)
        lead = DemoRequest.objects.create(name='Tara Das', boutique='Tara Weaves',
                                          email=self.EMAIL, phone='9840022233')
        body = admin_client().post(f'/api/superadmin/leads/{lead.pk}/approve/', {
            **APPROVAL, 'email': self.EMAIL, 'business_name': 'Tara Weaves',
            'first_name': 'Tara', 'last_name': 'Das',
        }, format='json').json()
        self.schema = body['boutique']['schema_name']
        self.temporary = body['login']['temporary_password']

    def tearDown(self):
        drop_boutiques(self.EMAIL)

    def test_the_owner_signs_in_and_is_told_to_change_the_password(self):
        response = login(self.EMAIL, self.temporary)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['user']['must_change_password'])
        self.assertEqual(response.data['user']['role'], 'Owner')

    def test_nothing_but_the_change_screen_works_until_it_is_changed(self):
        token = login(self.EMAIL, self.temporary).data['token']
        client = signed_in(token, self.schema)

        refused = client.get('/api/customers/')
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.data['code'], 'password_change_required')

        me = client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.data['must_change_password'])

    def test_changing_it_unlocks_the_app_and_retires_the_old_password(self):
        old_token = login(self.EMAIL, self.temporary).data['token']
        client = signed_in(old_token, self.schema)

        response = client.post('/api/auth/change-password/', {
            'current_password': self.temporary, 'new_password': 'Kanjivaram-Silk-2026',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['user']['must_change_password'])
        new_token = response.data['token']
        self.assertNotEqual(new_token, old_token)

        connection.set_schema_to_public()
        self.assertFalse(BoutiqueTenant.objects.get(schema_name=self.schema)
                         .owner_password_temporary)

        self.assertEqual(signed_in(new_token, self.schema).get('/api/customers/').status_code, 200)
        with schema_context(self.schema):
            self.assertFalse(Token.objects.filter(key=old_token).exists())

        self.assertEqual(login(self.EMAIL, self.temporary).status_code, 400)
        self.assertEqual(login(self.EMAIL, 'Kanjivaram-Silk-2026').status_code, 200)

    def test_a_wrong_current_password_or_a_weak_new_one_is_refused(self):
        client = signed_in(login(self.EMAIL, self.temporary).data['token'], self.schema)
        wrong = client.post('/api/auth/change-password/', {
            'current_password': 'not-it', 'new_password': 'Kanjivaram-Silk-2026'}, format='json')
        self.assertEqual(wrong.status_code, 400)
        self.assertIn('current password', wrong.data['error'])

        for weak in ('short1', '12345678901', 'password123'):
            response = client.post('/api/auth/change-password/', {
                'current_password': self.temporary, 'new_password': weak}, format='json')
            self.assertEqual(response.status_code, 400, weak)

        same = client.post('/api/auth/change-password/', {
            'current_password': self.temporary, 'new_password': self.temporary}, format='json')
        self.assertEqual(same.status_code, 400)

        connection.set_schema_to_public()
        self.assertTrue(BoutiqueTenant.objects.get(schema_name=self.schema)
                        .owner_password_temporary)

    def test_a_reset_link_also_ends_the_temporary_password(self):
        from crm_api.auth_views import make_reset_link
        from django.contrib.auth.models import User
        tenant = BoutiqueTenant.objects.get(schema_name=self.schema)
        with schema_context(self.schema):
            user = User.objects.get(username=self.EMAIL)
        token = make_reset_link(tenant, user).split('?reset=')[1]

        response = APIClient().post('/api/auth/password-reset/confirm/', {
            'token': token, 'password': 'Banarasi-Weave-2026'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        connection.set_schema_to_public()
        self.assertFalse(BoutiqueTenant.objects.get(schema_name=self.schema)
                         .owner_password_temporary)

    def test_staff_of_the_boutique_are_not_held_by_the_owners_flag(self):
        from django.contrib.auth.models import User
        from crm_api.models import Tailor
        with schema_context(self.schema):
            user = User.objects.create_user(username='tailor@temppass.test',
                                            email='tailor@temppass.test',
                                            password='Stitching-Hand-77')
            Tailor.objects.create(name='Ravi', specialty='Blouses', role='Tailor',
                                  status='Available', user=user)
        response = login('tailor@temppass.test', 'Stitching-Hand-77')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['user']['must_change_password'])
        client = signed_in(response.data['token'], self.schema)
        self.assertNotEqual(client.get('/api/auth/me/').status_code, 403)


class ReplyToTests(TransactionTestCase):

    def test_every_message_without_its_own_reply_to_gets_the_platforms(self):
        from django.core.mail import EmailMessage
        from core.mail import apply_reply_to
        plain = EmailMessage('s', 'b', 'no-reply@x.test', ['a@x.test'])
        own = EmailMessage('s', 'b', 'no-reply@x.test', ['a@x.test'],
                           reply_to=['boutique@x.test'])
        apply_reply_to([plain, own], 'team@x.test')
        self.assertEqual(plain.reply_to, ['team@x.test'])
        self.assertEqual(own.reply_to, ['boutique@x.test'])

    def test_no_setting_means_no_header(self):
        from django.core.mail import EmailMessage
        from core.mail import apply_reply_to
        message = EmailMessage('s', 'b', 'no-reply@x.test', ['a@x.test'])
        apply_reply_to([message], '')
        self.assertEqual(message.reply_to, [])


class PricingSwitchTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        PlatformSetting.objects.filter(key='pricing_enabled').delete()
        clear_platform_cache()

    def tearDown(self):
        connection.set_schema_to_public()
        PlatformSetting.objects.filter(key='pricing_enabled').delete()
        clear_platform_cache()

    def test_pricing_is_off_until_the_console_switches_it_on(self):
        self.assertFalse(APIClient().get('/api/auth/platform/').data['pricing_enabled'])

        response = admin_client().put('/api/superadmin/config/', {
            'key': 'pricing_enabled', 'value': {'enabled': True}}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(APIClient().get('/api/auth/platform/').data['pricing_enabled'])

    def test_anything_but_enabled_true_is_off(self):
        for value in ({'enabled': 'yes'}, True, 'on', None, {'enabled': 1}):
            PlatformSetting.objects.update_or_create(key='pricing_enabled',
                                                     defaults={'value': value})
            clear_platform_cache()
            self.assertFalse(APIClient().get('/api/auth/platform/').data['pricing_enabled'],
                             value)
