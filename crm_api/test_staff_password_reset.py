from django.contrib.auth.models import User
from django.urls import reverse
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from crm_api.models import Tailor


class StaffPasswordResetTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "reset-owner@test.com"
        tenant.name = "Reset Atelier"
        return tenant

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        from django.db import connection
        connection.set_tenant(self.tenant)
        cache.clear()
        self.owner = User.objects.create_user(
            username="reset-owner@test.com", email="reset-owner@test.com",
            password="owner-password-1")
        self.client = self._client_for(self.owner)

    def _client_for(self, user):
        client = APIClient()
        token = Token.objects.create(user=user)
        client.credentials(HTTP_AUTHORIZATION='Token ' + token.key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def _create_tailor(self, name, email, role="Tailor"):
        response = self.client.post(reverse('tailor-list'), {
            "name": name, "email": email, "specialty": "Blouses",
            "status": "Available", "role": role,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def _reset(self, client, tailor_id):
        return client.post(f'/api/tailors/{tailor_id}/reset-password/', {}, format='json')

    def test_owner_gets_a_new_working_password(self):
        created = self._create_tailor("Anya Sharma", "anya@test.com")
        old = created['bootstrap_password']
        response = self._reset(self.client, created['id'])
        self.assertEqual(response.status_code, 200, response.data)
        new = response.data['bootstrap_password']
        self.assertNotEqual(new, old)
        self.assertEqual(response.data['email'], "anya@test.com")
        user = User.objects.get(email="anya@test.com")
        self.assertTrue(user.check_password(new))
        self.assertFalse(user.check_password(old))

    def test_reset_signs_the_person_out(self):
        created = self._create_tailor("Anya Sharma", "anya@test.com")
        user = User.objects.get(email="anya@test.com")
        Token.objects.create(user=user)
        self._reset(self.client, created['id'])
        self.assertFalse(Token.objects.filter(user=user).exists())

    def test_the_new_password_is_not_readable_afterwards(self):
        created = self._create_tailor("Anya Sharma", "anya@test.com")
        self._reset(self.client, created['id'])
        detail = self.client.get(reverse('tailor-detail', kwargs={'pk': created['id']}))
        self.assertNotIn('bootstrap_password', detail.data)

    def test_staff_without_a_login_is_refused(self):
        tailor = Tailor.objects.create(name="No Login", role="Tailor", specialty="x")
        response = self._reset(self.client, tailor.pk)
        self.assertEqual(response.status_code, 400)

    def test_a_master_cannot_reset_passwords(self):
        master = self._create_tailor("Meera Master", "meera@test.com", role="Master")
        worker = self._create_tailor("Anya Sharma", "anya@test.com")
        master_client = self._client_for(User.objects.get(email="meera@test.com"))
        before = User.objects.get(email="anya@test.com").password
        response = self._reset(master_client, worker['id'])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.get(email="anya@test.com").password, before)
        self.assertTrue(master['id'])

    def test_the_owners_own_account_is_never_reset(self):
        tailor = Tailor.objects.create(name="Owner Row", role="Master",
                                       specialty="x", user=self.owner)
        response = self._reset(self.client, tailor.pk)
        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password("owner-password-1"))

    def test_designer_password_can_be_reset(self):
        designer = Designer.objects.create(name="Dia Designer", email="dia@test.com")
        login = self.client.post(
            f'/api/design-studio/designers/{designer.pk}/create-login/',
            {"email": "dia@test.com"}, format='json')
        self.assertEqual(login.status_code, 200, login.data)
        response = self.client.post(
            f'/api/design-studio/designers/{designer.pk}/reset-password/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        user = User.objects.get(email="dia@test.com")
        self.assertTrue(user.check_password(response.data['bootstrap_password']))
        self.assertFalse(user.check_password(login.data['bootstrap_password']))
