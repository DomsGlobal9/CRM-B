"""The console's bell: new-boutique notices, listed and marked read."""
from django.contrib.auth.models import User
from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from superadmin.models import PlatformNotification

URL = '/api/superadmin/notifications/'


class NotificationsTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        PlatformNotification.objects.all().delete()
        User.objects.filter(username='bell@admin.test').delete()
        User.objects.create_superuser(username='bell@admin.test', email='bell@admin.test',
                                      password='bell-admin-pass')
        self.client = APIClient()
        response = self.client.post('/api/superadmin/auth/login/',
                                    {'username': 'bell@admin.test', 'password': 'bell-admin-pass'},
                                    format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + response.json()['token'])
        self.first = PlatformNotification.objects.create(
            kind=PlatformNotification.BOUTIQUE_SIGNUP, title='New boutique: One', boutique='one_x')
        self.second = PlatformNotification.objects.create(
            kind=PlatformNotification.BOUTIQUE_SIGNUP, title='New boutique: Two', boutique='two_x')

    def test_lists_newest_first_with_the_unread_count(self):
        data = self.client.get(URL).json()
        self.assertEqual(data['unread'], 2)
        self.assertEqual([n['title'] for n in data['notifications']],
                         ['New boutique: Two', 'New boutique: One'])

    def test_marks_chosen_ids_read_then_the_rest(self):
        response = self.client.post(URL, {'ids': [self.first.id]}, format='json')
        self.assertEqual(response.json()['marked'], 1)
        self.first.refresh_from_db()
        self.assertEqual(self.first.read_by, 'bell@admin.test')
        self.assertEqual(self.client.get(URL).json()['unread'], 1)

        self.assertEqual(self.client.post(URL, {}, format='json').json()['marked'], 1)
        self.assertEqual(self.client.get(URL).json()['unread'], 0)

    def test_rejects_ids_that_are_not_a_list_of_numbers(self):
        response = self.client.post(URL, {'ids': 'all'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PlatformNotification.objects.filter(read_at__isnull=True).count(), 2)

    def test_a_boutique_account_cannot_read_the_bell(self):
        User.objects.create_user(username='plain@boutique.test', password='plain-pass-123')
        client = APIClient()
        client.force_authenticate(User.objects.get(username='plain@boutique.test'))
        self.assertIn(client.get(URL).status_code, (401, 403))
