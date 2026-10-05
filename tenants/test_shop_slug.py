"""The boutique portal path: /saralaboutique instead of /app.

The rule these tests exist to hold: the slug is an ALIAS. It labels a sign-in
screen and tidies the URL bar. It never decides which boutique a request
reads -- that stays with the token and the X-Tenant-ID header, neither of
which a browser can choose for itself.
"""

from importlib import import_module
from types import SimpleNamespace

from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import SimpleTestCase, TransactionTestCase
from django_tenants.utils import schema_context
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from tenants.middleware import clear_tenant_cache
from tenants.models import BoutiqueTenant
from tenants.provision import provision_tenant
from tenants.slugs import MAX_LENGTH, RESERVED, make_shop_slug, normalise

# The migration's own function, so the backfill is tested as it will run
# rather than as a second implementation of it. Imported this way because a
# module name cannot begin with a digit.
backfill_shop_slugs = import_module(
    'tenants.migrations.0009_boutiquetenant_shop_slug').backfill_shop_slugs


def register(schema_name, name, **fields):
    """A registry row with no database schema behind it.

    auto_create_schema off on purpose: every test here is about the public
    schema's slug column, and cloning a tenant schema per row would make this
    file minutes long to prove something that never touches one.
    """
    connection.set_schema_to_public()
    tenant = BoutiqueTenant(
        schema_name=schema_name,
        owner_email=fields.pop('owner_email', schema_name + '@example.test'),
        name=name,
        **fields,
    )
    tenant.auto_create_schema = False
    tenant.save()
    return tenant


class SlugRulesTests(SimpleTestCase):
    """No database. Normalisation and collision behaviour only."""

    def test_the_requested_shape(self):
        self.assertEqual(make_shop_slug('Sarala Boutique'), 'saralaboutique')
        self.assertEqual(make_shop_slug('Royal Fashion Boutique'),
                         'royalfashionboutique')

    def test_lowercase_and_url_safe(self):
        for name in ('Sarala Boutique', 'A/B Boutique', 'Sarala & Sons',
                     'My Boutique', 'Boutique  ???'):
            self.assertRegex(make_shop_slug(name), r'^[a-z0-9]+$', name)

    def test_separators_collapse_rather_than_becoming_hyphens(self):
        # The portal URL is one unbroken word, so 'Sarala-Boutique' and
        # 'Sarala Boutique' normalise alike -- which is precisely why the
        # collision suffix below has to exist.
        self.assertEqual(normalise('Sarala Boutique'),
                         normalise('Sarala-Boutique'))

    def test_digits_survive(self):
        self.assertEqual(make_shop_slug('Sarala Boutique 123'),
                         'saralaboutique123')

    def test_accents_transliterate_rather_than_vanish(self):
        # 'cafbutique' -- what stripping non-ASCII outright would give -- is
        # not a name anybody typed.
        self.assertEqual(make_shop_slug('Cafe Boutique'), 'cafeboutique')
        self.assertEqual(make_shop_slug('Café Böutique'), 'cafeboutique')

    def test_a_name_that_normalises_to_nothing_falls_back(self):
        # An empty slug would make the boutique's URL the site root.
        self.assertEqual(make_shop_slug('!!!', fallback='sarala_a1b2'),
                         'saralaa1b2')
        self.assertEqual(make_shop_slug('बुटीक',
                                        fallback='royal_c3d4'),
                         'royalc3d4')
        self.assertTrue(make_shop_slug('', fallback=''))

    def test_duplicates_are_suffixed_deterministically(self):
        first = make_shop_slug('Sarala Boutique', [])
        second = make_shop_slug('Sarala Boutique', [first])
        third = make_shop_slug('Sarala Boutique', [first, second])
        self.assertEqual([first, second, third],
                         ['saralaboutique', 'saralaboutique2', 'saralaboutique3'])
        # Same inputs, same answer, every time: the backfill must be re-runnable.
        self.assertEqual(make_shop_slug('Sarala Boutique', [first]), second)

    def test_a_hyphenated_twin_does_not_steal_the_slug(self):
        taken = [make_shop_slug('Sarala Boutique', [])]
        self.assertEqual(make_shop_slug('Sarala-Boutique', taken),
                         'saralaboutique2')

    def test_reserved_paths_are_never_handed_out(self):
        for reserved in ('app', 'api', 'admin', 'login', 'logout', 'static',
                         'media', 'superadmin', 'track', 'assets', 'faq',
                         'blog', 'demo', 'modules'):
            self.assertIn(reserved, RESERVED, reserved)
            slug = make_shop_slug(reserved)
            self.assertNotIn(slug, RESERVED, reserved)
            self.assertEqual(slug, reserved + '2', reserved)

    def test_every_reserved_entry_is_itself_a_path_shape(self):
        # A reserved word that could never be generated anyway is harmless,
        # but one with an uppercase letter or a space protects nothing.
        for reserved in RESERVED:
            self.assertEqual(reserved, reserved.lower().strip(), reserved)

    def test_long_names_stay_within_the_column(self):
        slug = make_shop_slug('Boutique ' * 40)
        self.assertLessEqual(len(slug), MAX_LENGTH)
        suffixed = make_shop_slug('Boutique ' * 40, [slug])
        self.assertLessEqual(len(suffixed), MAX_LENGTH)
        self.assertNotEqual(suffixed, slug)


class BackfillTests(TransactionTestCase):
    """The data migration, run as the migration runs it."""

    def setUp(self):
        connection.set_schema_to_public()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()

    def _backfill(self):
        backfill_shop_slugs(django_apps, SimpleNamespace(connection=connection))

    def test_existing_boutiques_are_given_slugs(self):
        register('bf_sarala', 'Sarala Boutique')
        register('bf_royal', 'Royal Fashion Boutique')

        self._backfill()

        self.assertEqual(
            BoutiqueTenant.objects.get(schema_name='bf_sarala').shop_slug,
            'saralaboutique')
        self.assertEqual(
            BoutiqueTenant.objects.get(schema_name='bf_royal').shop_slug,
            'royalfashionboutique')

    def test_duplicate_names_get_distinct_slugs(self):
        # Neither boutique name is unique in this product, so this is the
        # ordinary case rather than an edge one.
        first = register('bf_dup_a', 'Sarala Boutique')
        second = register('bf_dup_b', 'Sarala Boutique')

        self._backfill()

        self.assertEqual(
            {BoutiqueTenant.objects.get(pk=first.pk).shop_slug,
             BoutiqueTenant.objects.get(pk=second.pk).shop_slug},
            {'saralaboutique', 'saralaboutique2'})

    def test_a_slug_already_set_is_not_overwritten(self):
        kept = register('bf_kept', 'Sarala Boutique', shop_slug='saralas')

        self._backfill()

        self.assertEqual(BoutiqueTenant.objects.get(pk=kept.pk).shop_slug,
                         'saralas')

    def test_a_reserved_name_does_not_become_a_reserved_path(self):
        register('bf_admin', 'Admin')

        self._backfill()

        slug = BoutiqueTenant.objects.get(schema_name='bf_admin').shop_slug
        self.assertNotIn(slug, RESERVED)

    def test_an_unnameable_boutique_still_gets_a_usable_slug(self):
        register('bf_blank', '!!!')

        self._backfill()

        slug = BoutiqueTenant.objects.get(schema_name='bf_blank').shop_slug
        self.assertTrue(slug)
        self.assertRegex(slug, r'^[a-z0-9]+$')

    def test_re_running_renames_nobody(self):
        register('bf_again_a', 'Sarala Boutique')
        register('bf_again_b', 'Sarala Boutique')

        self._backfill()
        before = dict(BoutiqueTenant.objects.values_list('schema_name', 'shop_slug'))
        self._backfill()

        self.assertEqual(
            dict(BoutiqueTenant.objects.values_list('schema_name', 'shop_slug')),
            before)

    def test_the_column_is_unique(self):
        register('uniq_a', 'Sarala Boutique', shop_slug='saralaboutique')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                register('uniq_b', 'Other Boutique', shop_slug='saralaboutique')

    def test_many_boutiques_may_have_no_slug_at_all(self):
        # A nullable unique column permits many NULLs, which is what lets a
        # boutique keep using /app instead of a portal path of its own.
        register('null_a', 'A')
        register('null_b', 'B')
        self.assertEqual(
            BoutiqueTenant.objects.filter(shop_slug=None).count(), 2)


class SlugLookupTests(TransactionTestCase):
    """GET /api/auth/boutique/<slug>/ -- the sign-in screen's label."""

    URL = '/api/auth/boutique/{}/'

    def setUp(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()
        self.sarala = register('lk_sarala', 'Sarala Boutique',
                               shop_slug='saralaboutique')
        self.royal = register('lk_royal', 'Royal Fashion Boutique',
                              shop_slug='royalfashionboutique')
        self.client = APIClient()

    def tearDown(self):
        connection.set_schema_to_public()
        clear_tenant_cache()

    def test_a_slug_resolves_to_its_own_boutique(self):
        res = self.client.get(self.URL.format('saralaboutique'))
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['name'], 'Sarala Boutique')

    def test_each_slug_resolves_to_a_different_boutique(self):
        # Boutique A's slug must never answer with boutique B.
        self.assertEqual(
            self.client.get(self.URL.format('royalfashionboutique')).json()['name'],
            'Royal Fashion Boutique')
        self.assertEqual(
            self.client.get(self.URL.format('saralaboutique')).json()['name'],
            'Sarala Boutique')

    def test_it_answers_with_no_tenant_context_and_no_token(self):
        # /api/auth/ is in ALWAYS_ON and TENANT_OPTIONAL_PREFIXES, which is
        # what a sign-in screen needs: there is no boutique yet.
        res = self.client.get(self.URL.format('saralaboutique'))
        self.assertEqual(res.status_code, 200, res.content)

    def test_an_unknown_slug_is_404(self):
        self.assertEqual(
            self.client.get(self.URL.format('nosuchboutique')).status_code, 404)

    def test_a_suspended_boutique_is_404_not_403(self):
        # An anonymous caller is not owed the platform's suspension decisions.
        BoutiqueTenant.objects.filter(pk=self.sarala.pk).update(is_active=False)
        self.assertEqual(
            self.client.get(self.URL.format('saralaboutique')).status_code, 404)

    def test_the_response_carries_nothing_but_the_name_and_the_slug(self):
        body = self.client.get(self.URL.format('saralaboutique')).json()
        self.assertEqual(set(body), {'name', 'shop_slug'})
        for leaked in ('schema_name', 'owner_email', 'plan', 'enabled_modules',
                       'is_active', 'modules'):
            self.assertNotIn(leaked, body, leaked)

    def test_a_malformed_path_does_not_reach_the_view(self):
        for path in ('/api/auth/boutique/has%20space/',
                     '/api/auth/boutique/with.dot/',
                     '/api/auth/boutique/a/b/'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_a_missing_trailing_slash_redirects_rather_than_404s(self):
        res = self.client.get('/api/auth/boutique/saralaboutique')
        self.assertIn(res.status_code, (301, 302))
        self.assertTrue(res['Location'].endswith('/api/auth/boutique/saralaboutique/'))

    def test_the_lookup_leaves_the_connection_on_the_public_schema(self):
        self.client.get(self.URL.format('saralaboutique'))
        self.assertEqual(connection.schema_name, 'public')


class SlugIsNotTenantResolutionTests(TransactionTestCase):
    """A slug in the URL cannot move a session to another boutique.

    These two boutiques get real schemas, because the point is what an
    authenticated request resolves to. Provisioned by cloning tenant_base --
    the same fast path signup uses, and the same setUpClass tenants/
    test_provision.py relies on. Replaying every migration twice per test
    method instead would cost minutes to prove the same thing.
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
        with transaction.atomic():
            self.sarala = provision_tenant(schema_name='iso_sarala',
                                           owner_email='sarala@example.test',
                                           name='Sarala Boutique',
                                           shop_slug='saralaboutique')
        with transaction.atomic():
            self.royal = provision_tenant(schema_name='iso_royal',
                                          owner_email='royal@example.test',
                                          name='Royal Fashion Boutique',
                                          shop_slug='royalfashionboutique')
        connection.set_schema_to_public()
        clear_tenant_cache()

        with schema_context('iso_sarala'):
            user = User.objects.create_user(username='sarala@example.test',
                                            email='sarala@example.test',
                                            password='sarala-pass-123')
            self.token = Token.objects.create(user=user).key
        connection.set_schema_to_public()

    def tearDown(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        for tenant in (self.sarala, self.royal):
            try:
                tenant.delete(force_drop=True)
            except Exception:
                pass

    def _me(self, **headers):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Token ' + self.token, **headers)
        return client.get('/api/auth/me/')

    def test_a_token_resolves_to_its_own_boutique(self):
        res = self._me(HTTP_X_TENANT_ID='iso_sarala')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'iso_sarala')

    def test_the_payload_carries_the_boutiques_own_slug(self):
        # What the workspace uses to put the URL bar right after sign-in.
        res = self._me(HTTP_X_TENANT_ID='iso_sarala')
        self.assertEqual(res.json()['shop_slug'], 'saralaboutique')

    def test_claiming_another_boutique_does_not_reach_it(self):
        # The authtoken table is per schema, so Sarala's token simply does not
        # exist in Royal's. This is the guarantee the slug must not weaken.
        res = self._me(HTTP_X_TENANT_ID='iso_royal')
        self.assertIn(res.status_code, (401, 403), res.content)

    def test_with_no_header_the_token_still_decides(self):
        res = self._me()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['tenant_id'], 'iso_sarala')

    def test_no_url_path_selects_a_tenant(self):
        # /app and /<slug> are frontend paths that Django does not route at
        # all: the portal change adds no server route and leaves /api/ alone.
        client = APIClient()
        for path in ('/app', '/app/', '/saralaboutique', '/saralaboutique/',
                     '/royalfashionboutique/'):
            self.assertEqual(client.get(path).status_code, 404, path)


class SignupSlugTests(TransactionTestCase):
    """A new boutique receives a valid unique slug without being asked for one."""

    URL = '/api/auth/signup/'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # So signup takes its own clone path rather than replaying every
        # migration per boutique.
        call_command('ensure_base_schema')

    def setUp(self):
        connection.set_schema_to_public()
        clear_tenant_cache()
        BoutiqueTenant.objects.exclude(schema_name='public').delete()
        call_command('ensure_base_schema')
        self.created = []

    def tearDown(self):
        connection.set_schema_to_public()
        for tenant in self.created:
            try:
                tenant.delete(force_drop=True)
            except Exception:
                pass
        clear_tenant_cache()

    def _signup(self, email, business_name):
        res = APIClient().post(self.URL, {
            'first_name': 'Sarala', 'last_name': 'Devi',
            'email_address': email, 'mobile_number': '9876543210',
            'password': 'a-long-enough-pass-123',
            'business_name': business_name,
        }, format='json')
        connection.set_schema_to_public()
        tenant = BoutiqueTenant.objects.filter(owner_email=email).first()
        if tenant is not None:
            self.created.append(tenant)
        return res, tenant

    def test_signup_assigns_a_slug(self):
        res, tenant = self._signup('sarala@example.test', 'Sarala Boutique')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(tenant.shop_slug, 'saralaboutique')

    def test_the_slug_is_returned_to_the_workspace(self):
        res, _ = self._signup('sarala@example.test', 'Sarala Boutique')
        self.assertEqual(res.json()['user']['shop_slug'], 'saralaboutique')

    def test_a_second_boutique_of_the_same_name_still_signs_up(self):
        # The regression that would hurt: an IntegrityError here rolls back the
        # whole provisioning and the owner is told to try again, forever.
        first, first_tenant = self._signup('one@example.test', 'Sarala Boutique')
        second, second_tenant = self._signup('two@example.test', 'Sarala Boutique')

        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertEqual(first_tenant.shop_slug, 'saralaboutique')
        self.assertEqual(second_tenant.shop_slug, 'saralaboutique2')
