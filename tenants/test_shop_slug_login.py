"""Signing in at /<shop_slug>, and where a reset link comes back to.

The slug is a tenant HINT: it decides which boutique is tried first, and it
grants nothing on its own. Guessing a boutique's address must never produce a
session in it.
"""

from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import connection, transaction
from django.test import TransactionTestCase
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from crm_api.auth_views import make_reset_link
from tenants.middleware import clear_tenant_cache
from tenants.models import BoutiqueTenant
from tenants.provision import provision_tenant



class LoginSlugHintTests(TransactionTestCase):
    """Two real schemas, each able to hold an account on the same address.

    That is the case the slug exists to disambiguate, and the case where
    trusting the URL would be the security bug.
    """

    URL = '/api/auth/login/'
    EMAIL = 'shared@example.test'
    PASSWORD = 'shared-pass-123'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command('ensure_base_schema')

    def setUp(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()
        call_command('ensure_base_schema')
        with transaction.atomic():
            self.sanjeeb = provision_tenant(schema_name='hint_sanjeeb',
                                            owner_email='owner-sanjeeb@example.test',
                                            name='Sanjeeb Boutique',
                                            shop_slug='sanjeebboutique')
        with transaction.atomic():
            self.royal = provision_tenant(schema_name='hint_royal',
                                          owner_email='owner-royal@example.test',
                                          name='Royal Fashion Boutique',
                                          shop_slug='royalfashionboutique')
        connection.set_schema_to_public()
        clear_tenant_cache()

    def tearDown(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        for tenant in (self.sanjeeb, self.royal):
            try:
                tenant.delete(force_drop=True)
            except Exception:
                pass

    def _account(self, schema, email=None, password=None):
        with schema_context(schema):
            User.objects.create_user(username=email or self.EMAIL,
                                     email=email or self.EMAIL,
                                     password=password or self.PASSWORD)
        connection.set_schema_to_public()

    def _login(self, email=None, password=None, slug=None):
        body = {'username': email or self.EMAIL,
                'password': password or self.PASSWORD}
        if slug is not None:
            body['shop_slug'] = slug
        res = APIClient().post(self.URL, body, format='json')
        connection.set_schema_to_public()
        return res

    def test_the_owner_signs_in_at_their_own_slug(self):
        self._account('hint_sanjeeb', email='owner-sanjeeb@example.test')

        res = self._login(email='owner-sanjeeb@example.test',
                          slug='sanjeebboutique')

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_sanjeeb')
        self.assertEqual(res.json()['user']['shop_slug'], 'sanjeebboutique')

    def test_staff_sign_in_at_their_boutiques_slug(self):
        self._account('hint_sanjeeb', email='sonali@example.test')

        res = self._login(email='sonali@example.test', slug='sanjeebboutique')

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_sanjeeb')

    def test_the_slug_picks_the_intended_boutique(self):
        self._account('hint_sanjeeb')
        self._account('hint_royal')

        self.assertEqual(self._login(slug='sanjeebboutique').json()['tenant_id'],
                         'hint_sanjeeb')
        self.assertEqual(self._login(slug='royalfashionboutique').json()['tenant_id'],
                         'hint_royal')

    def test_an_account_elsewhere_lands_in_its_own_boutique(self):
        # Sonali belongs to Royal and opens Sanjeeb's URL. She must end up in
        # Royal, never in Sanjeeb.
        self._account('hint_royal')

        res = self._login(slug='sanjeebboutique')

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_royal')
        self.assertEqual(res.json()['user']['shop_slug'], 'royalfashionboutique')

    def test_a_guessed_slug_grants_nothing_without_credentials(self):
        self._account('hint_royal')

        res = self._login(password='not-the-password', slug='sanjeebboutique')

        self.assertEqual(res.status_code, 400, res.content)
        self.assertNotIn('token', res.json())

    def test_an_unknown_email_still_fails(self):
        res = self._login(email='nobody@example.test', slug='sanjeebboutique')

        self.assertEqual(res.status_code, 400, res.content)
        self.assertNotIn('token', res.json())

    def test_a_suspended_boutique_refuses_login_at_its_own_slug(self):
        self._account('hint_sanjeeb')
        BoutiqueTenant.objects.filter(pk=self.sanjeeb.pk).update(is_active=False)
        clear_tenant_cache()

        res = self._login(slug='sanjeebboutique')

        self.assertEqual(res.status_code, 403, res.content)
        self.assertNotIn('token', res.json())

    def test_login_works_with_no_slug_at_all(self):
        # A boutique with no portal path yet, and the reset screen, both post
        # no slug.
        self._account('hint_sanjeeb')

        res = self._login()

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_sanjeeb')

    def test_an_unknown_slug_is_ignored_rather_than_fatal(self):
        self._account('hint_sanjeeb')

        res = self._login(slug='nosuchboutique')

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_sanjeeb')

    def test_a_suspended_boutique_is_not_hinted_into_the_front(self):
        # The hint filters on is_active, so a suspended Sanjeeb does not get
        # tried first and Royal's own account still signs in.
        self._account('hint_royal')
        BoutiqueTenant.objects.filter(pk=self.sanjeeb.pk).update(is_active=False)
        clear_tenant_cache()

        res = self._login(slug='sanjeebboutique')

        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'hint_royal')

    def test_tenant_selection_is_deterministic_without_a_slug(self):
        # The ambiguity this replaced: `others` had no ordering, so which
        # boutique an address in two of them resolved to was row order.
        self._account('hint_sanjeeb')
        self._account('hint_royal')

        landings = {self._login().json()['tenant_id'] for _ in range(3)}

        self.assertEqual(len(landings), 1)


class ResetLinkSlugTests(TransactionTestCase):
    """A reset link must come back to the boutique, not to /app.

    Real schemas: make_reset_link enters the tenant to mint the token, and
    tenants.schema_guard refuses a registry row with no schema behind it.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        call_command('ensure_base_schema')

    def setUp(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()
        call_command('ensure_base_schema')
        self.created = []

    def tearDown(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        for tenant in self.created:
            try:
                tenant.delete(force_drop=True)
            except Exception:
                pass

    def _boutique(self, schema_name, name, **fields):
        with transaction.atomic():
            tenant = provision_tenant(schema_name=schema_name,
                                      owner_email=schema_name + '@example.test',
                                      name=name, **fields)
        connection.set_schema_to_public()
        self.created.append(tenant)
        return tenant

    def _user(self, schema_name, username):
        with schema_context(schema_name):
            user = User.objects.create_user(username=username, email=username,
                                            password='reset-pass-123')
        connection.set_schema_to_public()
        return user

    def test_the_link_carries_the_boutique_slug(self):
        tenant = self._boutique('rl_sarala', 'Sarala Boutique',
                                shop_slug='saralaboutique')
        user = self._user('rl_sarala', 'rl@example.test')

        with self.settings(PORTAL_BASE_URL='https://boutique.scaleezy.com'):
            link = make_reset_link(tenant, user)

        self.assertTrue(
            link.startswith('https://boutique.scaleezy.com/saralaboutique?reset='),
            link)
        self.assertNotIn('/app', link)

    def test_a_boutique_with_no_slug_keeps_the_slugless_entry_point(self):
        tenant = self._boutique('rl_noslug', 'No Slug Boutique')
        user = self._user('rl_noslug', 'rl2@example.test')

        with self.settings(PORTAL_BASE_URL='https://boutique.scaleezy.com',
                           PASSWORD_RESET_BASE_URL='https://boutique.scaleezy.com/app'):
            link = make_reset_link(tenant, user)

        self.assertTrue(link.startswith('https://boutique.scaleezy.com/app?reset='),
                        link)


class PortalOriginTests(TransactionTestCase):
    """PORTAL_BASE_URL is derived so no deploy has to change its config."""

    def test_the_entry_point_is_stripped_off_the_reset_base(self):
        from boutique_crm.settings import _portal_origin

        self.assertEqual(_portal_origin('https://boutique.scaleezy.com/app'),
                         'https://boutique.scaleezy.com')
        self.assertEqual(_portal_origin('http://localhost:5173/app.html'),
                         'http://localhost:5173')

    def test_an_origin_with_no_entry_point_is_left_alone(self):
        from boutique_crm.settings import _portal_origin

        self.assertEqual(_portal_origin('https://boutique.scaleezy.com'),
                         'https://boutique.scaleezy.com')
        self.assertEqual(_portal_origin('https://boutique.scaleezy.com/'),
                         'https://boutique.scaleezy.com')
