from django.contrib.auth.models import User
from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from superadmin.models import AuditLog
from tenants.models import BoutiqueTenant, Domain


def schema_exists(name):
    with connection.cursor() as cur:
        cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", [name])
        return cur.fetchone() is not None


class DeleteBoutiqueTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        User.objects.filter(username='del@admin.test').delete()
        User.objects.create_superuser(username='del@admin.test', email='del@admin.test', password='del-admin-pass')
        self.client = APIClient()
        token = self.client.post('/api/superadmin/auth/login/',
                                 {'username': 'del@admin.test', 'password': 'del-admin-pass'},
                                 format='json').json()['token']
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)
        self.tenant = BoutiqueTenant(schema_name='del_atelier', owner_email='owner@del.test', name='Del Atelier')
        self.tenant.save()
        Domain.objects.create(domain='del_atelier.localhost', tenant=self.tenant, is_primary=True)

    def tearDown(self):
        connection.set_schema_to_public()
        for tenant in BoutiqueTenant.objects.filter(schema_name='del_atelier'):
            tenant.delete(force_drop=True)

    def delete(self, body):
        return self.client.delete('/api/superadmin/boutiques/del_atelier/', body, format='json')

    def test_the_wrong_name_deletes_nothing(self):
        for body in ({}, {'confirm_name': 'del atelier'}, {'confirm_name': 'Other'}):
            self.assertEqual(self.delete(body).status_code, 400, body)
        self.assertTrue(BoutiqueTenant.objects.filter(schema_name='del_atelier').exists())
        self.assertTrue(schema_exists('del_atelier'))

    def test_the_exact_name_drops_the_row_the_schema_and_leaves_an_audit_line(self):
        response = self.delete({'confirm_name': 'Del Atelier', 'reason': 'closed down'})
        self.assertEqual(response.status_code, 204)
        self.assertFalse(BoutiqueTenant.objects.filter(schema_name='del_atelier').exists())
        self.assertFalse(schema_exists('del_atelier'))
        entry = AuditLog.objects.filter(action='boutique.delete', target='del_atelier').latest('id')
        self.assertEqual(entry.before['owner_email'], 'owner@del.test')
        self.assertEqual(self.client.get('/api/superadmin/boutiques/del_atelier/').status_code, 404)

    def test_the_template_schema_is_refused_even_with_its_name(self):
        from django.conf import settings
        tenant = BoutiqueTenant.objects.filter(schema_name=settings.TENANT_BASE_SCHEMA).first()
        if tenant is None:
            self.skipTest('no template schema in this database')
        response = self.client.delete(f'/api/superadmin/boutiques/{tenant.schema_name}/',
                                      {'confirm_name': tenant.name}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(BoutiqueTenant.objects.filter(pk=tenant.pk).exists())

    def test_the_public_schema_cannot_be_deleted(self):
        response = self.client.delete('/api/superadmin/boutiques/public/', {'confirm_name': 'public'}, format='json')
        self.assertEqual(response.status_code, 404)
