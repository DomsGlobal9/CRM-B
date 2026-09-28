"""Revoking a leaver's access without deleting them from the roster.

Deleting a staff member closed their login but also took their employment
terms, attendance and documents with it. revoke-access closes the login only,
and restore-access reopens it with a new password.
"""

from django.contrib.auth.models import User
from django.core.cache import cache
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.staff.models import StaffProfile
from crm_api.models import Tailor


class RevokeAccessTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@revoke.test'
        tenant.name = 'Revoke Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        cache.clear()
        self.owner = User.objects.create_user(username='owner@revoke.test',
                                              email='owner@revoke.test',
                                              password='ownerpass123')
        self.user = User.objects.create_user(username='ravi', email='ravi@revoke.test',
                                             password='Stitch-Hand-2026')
        self.tailor = Tailor.objects.create(name='Ravi', specialty='Blouses', role='Tailor',
                                            user=self.user)
        StaffProfile.objects.create(staff=self.tailor, phone='9840011111')
        self.master_user = User.objects.create_user(username='lakshmi', email='lakshmi@revoke.test',
                                                    password='Master-Hand-2026')
        Tailor.objects.create(name='Lakshmi', specialty='All', role='Master', user=self.master_user)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                        HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def action(self, user, name, tailor=None):
        tailor = tailor or self.tailor
        return self.client_for(user).post(f'/api/tailors/{tailor.pk}/{name}/')

    def login(self, username, password):
        cache.clear()
        return APIClient().post(reverse('auth-login'),
                                {'username': username, 'password': password}, format='json')

    def test_revoking_signs_them_out_now_and_keeps_their_record(self):
        staff_session = self.client_for(self.user)
        self.assertEqual(staff_session.get('/api/auth/me/').status_code, 200)

        response = self.action(self.owner, 'revoke-access')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIs(response.data['login_active'], False)

        self.assertEqual(staff_session.get('/api/auth/me/').status_code, 401)
        # Before the login below: it carries no tenant header, so the
        # middleware leaves the connection on the public schema.
        self.assertTrue(Tailor.objects.filter(pk=self.tailor.pk).exists())
        self.assertTrue(StaffProfile.objects.filter(staff=self.tailor).exists())
        self.assertEqual(self.login('ravi', 'Stitch-Hand-2026').status_code, 400)

    def test_the_roster_shows_the_owner_who_can_sign_in(self):
        self.action(self.owner, 'revoke-access')
        rows = self.client_for(self.owner).get(reverse('tailor-list')).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        by_name = {row['name']: row for row in rows}
        self.assertIs(by_name['Ravi']['login_active'], False)
        self.assertIs(by_name['Lakshmi']['login_active'], True)

        master_rows = self.client_for(self.master_user).get(reverse('tailor-list')).data
        master_rows = master_rows['results'] if isinstance(master_rows, dict) else master_rows
        self.assertNotIn('login_active', master_rows[0])

    def test_restoring_issues_a_new_password_and_the_old_one_stays_dead(self):
        self.action(self.owner, 'revoke-access')
        response = self.action(self.owner, 'restore-access')
        self.assertEqual(response.status_code, 200, response.data)
        new_password = response.data['bootstrap_password']
        self.assertIs(response.data['login_active'], True)

        self.assertEqual(self.login('ravi', 'Stitch-Hand-2026').status_code, 400)
        self.assertEqual(self.login('ravi', new_password).status_code, 200)

    def test_only_the_owner_can_revoke(self):
        response = self.action(self.master_user, 'revoke-access')
        self.assertEqual(response.status_code, 403)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_the_owners_own_account_cannot_be_revoked(self):
        owner_row = Tailor.objects.create(name='Owner', specialty='All', role='Master',
                                          user=self.owner)
        response = self.action(self.owner, 'revoke-access', owner_row)
        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_someone_without_a_login_is_refused_with_a_sentence(self):
        helper = Tailor.objects.create(name='Helper', specialty='Pressing', role='Tailor')
        response = self.action(self.owner, 'revoke-access', helper)
        self.assertEqual(response.status_code, 400)
        self.assertIn('no login', response.data['error'])

    def test_restoring_someone_who_can_already_sign_in_is_refused(self):
        response = self.action(self.owner, 'restore-access')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.login('ravi', 'Stitch-Hand-2026').status_code, 200)
