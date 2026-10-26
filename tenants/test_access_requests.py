"""Request access instead of sign-up: intake, emails, approval, first sign-in."""
from django.contrib.auth.models import User
from django.core import mail
from django.db import connection
from django.test import Client, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from superadmin.models import PlatformNotification
from tenants.middleware import clear_tenant_cache
from tenants.models import BoutiqueTenant, DemoRequest

TEAM = 'team@platform.test'

APP_REQUEST = {
    'name': 'Meera Iyer',
    'boutique': 'Meera Couture',
    'email': 'meera@couture.test',
    'phone': '9600012345',
    'address': '12 Anna Salai, Chennai',
    'source': 'app',
    'terms_accepted': 'true',
}


def _drop_boutiques(*emails):
    connection.set_schema_to_public()
    for tenant in BoutiqueTenant.objects.filter(owner_email__in=[e.lower() for e in emails]):
        tenant.delete(force_drop=True)
    clear_tenant_cache()


@override_settings(PLATFORM_ALERT_EMAIL=TEAM)
class RequestIntakeTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        DemoRequest.objects.all().delete()
        PlatformNotification.objects.all().delete()

    def test_an_app_request_needs_the_terms(self):
        response = Client().post('/demo-request/', dict(APP_REQUEST, terms_accepted='false'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('Terms', str(response.json()['errors']))
        self.assertEqual(DemoRequest.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_an_app_request_welcomes_the_requester_and_alerts_the_team(self):
        response = Client().post('/demo-request/', APP_REQUEST)
        self.assertEqual(response.status_code, 201, response.content)

        lead = DemoRequest.objects.get(email=APP_REQUEST['email'])
        self.assertEqual(lead.source, 'app')
        self.assertEqual(lead.address, APP_REQUEST['address'])
        self.assertIsNotNone(lead.terms_accepted_at)
        self.assertIsNotNone(lead.welcome_emailed_at)
        self.assertIsNotNone(lead.team_alerted_at)

        welcome = next(m for m in mail.outbox if m.to == [APP_REQUEST['email']])
        self.assertIn('under review', welcome.body)
        self.assertIn('login credentials', welcome.body)

        alert = next(m for m in mail.outbox if m.to == [TEAM])
        self.assertIn('access request', alert.subject)
        for detail in ('Meera Iyer', 'Meera Couture', 'meera@couture.test', '9600012345',
                       'Anna Salai', 'Accepted'):
            self.assertIn(detail, alert.body)

        notice = PlatformNotification.objects.get(lead_id=lead.pk)
        self.assertEqual(notice.kind, PlatformNotification.ACCESS_REQUEST)
        self.assertIn('Meera Couture', notice.title)

    def test_the_websites_demo_form_gets_its_own_welcome_and_the_same_alert(self):
        response = Client().post('/demo-request/', {
            'name': 'Aarti Rao', 'boutique': 'Rao Couture', 'email': 'aarti@rao.test',
            'phone': '9000000001', 'problem': 'Orders live in a register.',
        })
        self.assertEqual(response.status_code, 201, response.content)
        welcome = next(m for m in mail.outbox if m.to == ['aarti@rao.test'])
        self.assertIn('demo request', welcome.subject)
        alert = next(m for m in mail.outbox if m.to == [TEAM])
        self.assertIn('Orders live in a register.', alert.body)
        lead = DemoRequest.objects.get(email='aarti@rao.test')
        self.assertEqual(lead.source, 'website')
        self.assertEqual(PlatformNotification.objects.get(lead_id=lead.pk).kind,
                         PlatformNotification.DEMO_REQUEST)

    @override_settings(PLATFORM_ALERT_EMAIL='')
    def test_no_alert_address_means_no_alert_but_the_request_is_kept(self):
        self.assertEqual(Client().post('/demo-request/', APP_REQUEST).status_code, 201)
        lead = DemoRequest.objects.get(email=APP_REQUEST['email'])
        self.assertIsNone(lead.team_alerted_at)
        self.assertEqual([m.to for m in mail.outbox], [[APP_REQUEST['email']]])


@override_settings(PLATFORM_ALERT_EMAIL=TEAM)
class ApprovalTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        DemoRequest.objects.all().delete()
        User.objects.filter(username='approver@admin.test').delete()
        User.objects.create_superuser(username='approver@admin.test', email='approver@admin.test',
                                      password='approver-pass-1')
        self.console = APIClient()
        response = self.console.post('/api/superadmin/auth/login/', {
            'username': 'approver@admin.test', 'password': 'approver-pass-1'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.console.credentials(HTTP_AUTHORIZATION='Token ' + response.json()['token'])
        Client().post('/demo-request/', APP_REQUEST)
        self.lead = DemoRequest.objects.get(email=APP_REQUEST['email'])
        mail.outbox.clear()

    def tearDown(self):
        _drop_boutiques(APP_REQUEST['email'])

    def _approve(self):
        return self.console.post(f'/api/superadmin/leads/{self.lead.pk}/approve/', {
            'first_name': 'Meera', 'last_name': 'Iyer', 'email': APP_REQUEST['email'],
            'business_name': 'Meera Couture', 'phone': APP_REQUEST['phone'],
            'address': APP_REQUEST['address'], 'plan': 'atelier',
        }, format='json')

    def _login(self, password):
        return APIClient().post('/api/auth/login/', {
            'username': APP_REQUEST['email'], 'password': password}, format='json')

    def test_approve_creates_the_boutique_and_emails_the_login(self):
        response = self._approve()
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        password = body['login']['temporary_password']
        self.assertTrue(body['emailed'])

        connection.set_schema_to_public()
        tenant = BoutiqueTenant.objects.get(owner_email=APP_REQUEST['email'])
        self.assertTrue(tenant.owner_password_temporary)
        self.assertIsNotNone(tenant.terms_accepted_at)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.tenant_id, tenant.pk)
        self.assertEqual(self.lead.status, 'CONVERTED')
        self.assertIsNotNone(self.lead.credentials_emailed_at)

        login_mail = next(m for m in mail.outbox if m.to == [APP_REQUEST['email']])
        self.assertIn(password, login_mail.body)
        self.assertIn(f'/{tenant.shop_slug}', login_mail.body)

        self.assertEqual(self._approve().status_code, 409, 'a second approve made a second boutique')

    def test_the_temporary_password_only_opens_the_change_password_screen(self):
        password = self._approve().json()['login']['temporary_password']

        login = self._login(password)
        self.assertEqual(login.status_code, 200, login.content)
        self.assertTrue(login.json()['user']['must_change_password'])
        owner = APIClient()
        owner.credentials(HTTP_AUTHORIZATION='Token ' + login.json()['token'],
                          HTTP_X_TENANT_ID=login.json()['tenant_id'])
        self.assertEqual(owner.get('/api/auth/me/').status_code, 200)
        refused = owner.get('/api/customers/')
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.json()['code'], 'password_change_required')

        changed = owner.post('/api/auth/change-password/', {
            'current_password': password, 'new_password': 'Meera-own-pass-2026'}, format='json')
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertFalse(changed.json()['user']['must_change_password'])
        owner.credentials(HTTP_AUTHORIZATION='Token ' + changed.json()['token'],
                          HTTP_X_TENANT_ID=login.json()['tenant_id'])
        self.assertEqual(owner.get('/api/customers/').status_code, 200)
        self.assertNotEqual(self._login(password).status_code, 200)

    def test_resend_issues_a_new_password_and_ends_the_old_one(self):
        first = self._approve().json()['login']['temporary_password']
        mail.outbox.clear()

        response = self.console.post(f'/api/superadmin/leads/{self.lead.pk}/credentials/', {},
                                     format='json')
        self.assertEqual(response.status_code, 200, response.content)
        second = response.json()['login']['temporary_password']
        self.assertNotEqual(first, second)
        self.assertIn(second, mail.outbox[0].body)
        self.assertNotEqual(self._login(first).status_code, 200)
        self.assertTrue(self._login(second).json()['user']['must_change_password'])

    def test_resend_needs_an_approved_request(self):
        response = self.console.post(f'/api/superadmin/leads/{self.lead.pk}/credentials/', {},
                                     format='json')
        self.assertEqual(response.status_code, 409)

    def test_a_boutique_account_cannot_approve(self):
        plain = APIClient()
        plain.force_authenticate(User.objects.create_user(username='plain@x.test', password='x-pass-123'))
        self.assertIn(plain.post(f'/api/superadmin/leads/{self.lead.pk}/approve/', {}).status_code,
                      (401, 403))
