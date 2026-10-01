"""A designer's attendance must not turn them into a second team member.

Attendance is recorded against a Tailor row, so a designer gets one of role
'Designer' reached through Designer.staff. It is never linked to their login
(that would change their role to 'Tailor') and it stays off the team list.
"""

from django.contrib.auth.models import User
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from core.roles import resolve_user_role
from crm_api.models import Tailor


class DesignerAttendanceTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@designer-att.test'
        tenant.name = 'Designer Attendance Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@designer-att.test', email='owner@designer-att.test',
            password='ownerpass12345')
        self.user = User.objects.create_user(
            username='dia', email='dia@designer-att.test', password='diapass12345')
        self.designer = Designer.objects.create(
            name='Dia', email='dia@designer-att.test', user=self.user)
        Tailor.objects.create(name='Anita', specialty='Blouses', role='Tailor')

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                        HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def call(self, user, method, path):
        response = getattr(self.client_for(user), method)(path, {}, format='json')
        connection.set_tenant(self.tenant)
        return response

    def names(self, path):
        response = self.call(self.owner, 'get', path)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return sorted(row['name'] for row in rows)

    def test_check_in_and_out_keep_the_designer_a_designer(self):
        for method, path in [('get', '/api/staff/attendance/current/'),
                             ('post', '/api/staff/attendance/check-in/'),
                             ('get', '/api/staff/attendance/'),
                             ('post', '/api/staff/attendance/check-out/')]:
            response = self.call(self.user, method, path)
            self.assertLess(response.status_code, 300, getattr(response, 'data', None))
        self.user.refresh_from_db()
        self.assertEqual(resolve_user_role(self.user), 'Designer')
        self.assertFalse(Tailor.objects.filter(user=self.user).exists())
        self.assertEqual(Tailor.objects.filter(role='Designer').count(), 1)
        self.designer.refresh_from_db()
        self.assertEqual(self.designer.staff.role, 'Designer')

    def test_the_team_list_shows_the_designer_once(self):
        self.call(self.user, 'post', '/api/staff/attendance/check-in/')
        self.assertEqual(self.names('/api/tailors/'), ['Anita'])
        self.assertEqual(self.names('/api/tailors/?attendance=1'), ['Anita', 'Dia'])

    def test_a_row_made_the_old_way_is_repaired(self):
        old = Tailor.objects.create(name='Dia', role='Tailor', specialty='',
                                    email='dia@designer-att.test', user=self.user)
        self.designer.staff = old
        self.designer.save(update_fields=['staff'])
        # Hidden from the team list even before the designer next signs in.
        self.assertEqual(self.names('/api/tailors/'), ['Anita'])
        self.assertEqual(self.names('/api/tailors/?attendance=1'), ['Anita', 'Dia'])

        self.call(self.user, 'get', '/api/staff/attendance/current/')
        old.refresh_from_db()
        self.assertIsNone(old.user)
        self.assertEqual(old.role, 'Designer')
        self.assertEqual(resolve_user_role(User.objects.get(pk=self.user.pk)), 'Designer')
        self.assertEqual(Tailor.objects.filter(name='Dia').count(), 1)

    def test_a_roster_member_is_untouched(self):
        user = User.objects.create_user(
            username='ravi', email='ravi@designer-att.test', password='ravipass12345')
        ravi = Tailor.objects.create(name='Ravi', specialty='Suits', role='Tailor', user=user)
        self.call(user, 'post', '/api/staff/attendance/check-in/')
        ravi.refresh_from_db()
        self.assertEqual((ravi.user_id, ravi.role), (user.pk, 'Tailor'))
        self.assertEqual(self.names('/api/tailors/'), ['Anita', 'Ravi'])
