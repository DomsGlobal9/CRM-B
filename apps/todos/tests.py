from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from core.test_images import JPEG
from crm_api.models import Notification, Tailor

from .models import Todo


class TodoTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@todos.test'
        tenant.name = 'To-do Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = self._user('owner@todos.test')
        self.master = self._staff('Meera', 'Master')
        self.tailor = self._staff('Anita', 'Tailor')
        self.other = self._staff('Ravi', 'Tailor')
        self.designer = self._user('dia@todos.test')
        Designer.objects.create(name='Dia', email='dia@todos.test', user=self.designer)

    def _user(self, email):
        return User.objects.create_user(username=email, email=email, password='pass12345678')

    def _staff(self, name, role):
        user = self._user(f'{name.lower()}@todos.test')
        Tailor.objects.create(name=name, specialty='x', role=role, user=user, email=user.email)
        return user

    def call(self, user, method, path, data=None, fmt='json'):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                        HTTP_X_TENANT_ID=self.tenant.schema_name)
        response = getattr(api, method)(path, data or {}, format=fmt)
        connection.set_tenant(self.tenant)
        return response

    def make(self, user, **body):
        response = self.call(user, 'post', '/api/todos/', {'title': 'Finish hem', **body})
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def titles(self, user):
        response = self.call(user, 'get', '/api/todos/')
        self.assertEqual(response.status_code, 200, response.data)
        return sorted(row['title'] for row in response.data)

    def test_staff_create_their_own_todo_with_photos_text_and_voice(self):
        photos = [SimpleUploadedFile(f'p{i}.jpg', JPEG, content_type='image/jpeg')
                  for i in range(2)]
        response = self.call(self.tailor, 'post', '/api/todos/', {
            'title': 'Blouse hand work', 'text': 'Half done',
            'voice_note': 'https://media.test/voice_notes/a.webm',
            'photos': photos,
        }, fmt='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        todo = response.data
        self.assertEqual(todo['status'], 'OPEN')
        self.assertEqual(todo['assigned_to'], self.tailor.id)
        self.assertEqual(todo['assigned_to_name'], 'Anita')
        note = todo['updates'][0]
        self.assertEqual(note['text'], 'Half done')
        self.assertEqual(len(note['photos']), 2)
        self.assertTrue(note['voice_note'].endswith('a.webm'))

    def test_a_title_is_required(self):
        response = self.call(self.tailor, 'post', '/api/todos/', {'title': '  '})
        self.assertEqual(response.status_code, 400)

    def test_ordinary_staff_cannot_assign_to_someone_else(self):
        response = self.call(self.tailor, 'post', '/api/todos/',
                             {'title': 'x', 'assigned_to': self.other.id})
        self.assertEqual(response.status_code, 400)
        people = self.call(self.tailor, 'get', '/api/todos/people/').data
        self.assertFalse(people['can_assign'])
        self.assertEqual([p['id'] for p in people['people']], [self.tailor.id])

    def test_owner_master_and_designer_can_assign(self):
        for assigner in (self.owner, self.master, self.designer):
            todo = self.make(assigner, assigned_to=self.tailor.id)
            self.assertEqual(todo['assigned_to_name'], 'Anita')
            self.assertEqual(todo['assigned_to_role'], 'Tailor')
        self.assertEqual(
            Notification.objects.filter(recipient_email='anita@todos.test',
                                        title__startswith='New to-do').count(), 3)

    def test_a_master_assigns_to_the_floor_only(self):
        ids = {p['id'] for p in self.call(self.master, 'get', '/api/todos/people/').data['people']}
        self.assertEqual(ids, {self.master.id, self.tailor.id, self.other.id})
        response = self.call(self.master, 'post', '/api/todos/',
                             {'title': 'x', 'assigned_to': self.designer.id})
        self.assertEqual(response.status_code, 400)

    def test_the_owner_can_assign_to_everyone(self):
        ids = {p['id'] for p in self.call(self.owner, 'get', '/api/todos/people/').data['people']}
        self.assertEqual(ids, {self.owner.id, self.master.id, self.tailor.id,
                               self.other.id, self.designer.id})

    def test_who_sees_what(self):
        self.make(self.tailor, title='mine')
        self.make(self.owner, title='given', assigned_to=self.tailor.id)
        self.make(self.other, title='ravis')
        self.make(self.designer, title='design')
        self.assertEqual(self.titles(self.tailor), ['given', 'mine'])
        # A designer can look at the floor's to-dos, like the Owner and a Master.
        self.assertEqual(self.titles(self.designer), ['design', 'given', 'mine', 'ravis'])
        self.assertEqual(self.titles(self.other), ['ravis'])
        self.assertEqual(self.titles(self.owner), ['design', 'given', 'mine', 'ravis'])
        self.assertEqual(self.titles(self.master), ['design', 'given', 'mine', 'ravis'])

    def test_a_designer_can_look_but_not_change(self):
        todo = self.make(self.tailor)
        path = f"/api/todos/{todo['id']}/"
        seen = self.call(self.designer, 'get', path)
        self.assertEqual(seen.status_code, 200)
        self.assertFalse(seen.data['can_change_status'])
        self.assertEqual(self.call(self.designer, 'post', path + 'status/',
                                   {'status': 'CLOSED'}).status_code, 403)
        self.assertEqual(self.call(self.designer, 'patch', path, {'title': 'x'}).status_code, 403)
        self.assertEqual(self.call(self.designer, 'delete', path).status_code, 403)
        own = self.make(self.owner, title='owners own')
        self.assertEqual(self.call(self.designer, 'get',
                                   f"/api/todos/{own['id']}/").status_code, 404)

    def test_someone_elses_todo_cannot_be_opened_or_changed(self):
        todo = self.make(self.other)
        for method, path, body in [
                ('get', f"/api/todos/{todo['id']}/", None),
                ('post', f"/api/todos/{todo['id']}/status/", {'status': 'CLOSED'}),
                ('post', f"/api/todos/{todo['id']}/updates/", {'text': 'hi'}),
                ('delete', f"/api/todos/{todo['id']}/", None)]:
            self.assertEqual(self.call(self.tailor, method, path, body).status_code, 404)
        self.assertEqual(Todo.objects.get(pk=todo['id']).status, 'OPEN')

    def test_status_buttons_and_history(self):
        todo = self.make(self.owner, assigned_to=self.tailor.id)
        path = f"/api/todos/{todo['id']}/status/"
        progress = self.call(self.tailor, 'post', path, {'status': 'IN_PROGRESS'})
        self.assertEqual(progress.data['status'], 'IN_PROGRESS')
        closed = self.call(self.tailor, 'post', path, {'status': 'CLOSED'})
        self.assertEqual(closed.data['status'], 'CLOSED')
        self.assertIsNotNone(closed.data['closed_at'])
        self.assertEqual([u['status_to'] for u in closed.data['updates']],
                         ['IN_PROGRESS', 'CLOSED'])
        self.assertTrue(Notification.objects.filter(
            recipient_role='Owner', title__startswith='To-do closed').exists())
        reopened = self.call(self.owner, 'post', path, {'status': 'OPEN'})
        self.assertIsNone(reopened.data['closed_at'])
        self.assertEqual(self.call(self.tailor, 'post', path, {'status': 'DONE'}).status_code, 400)

    def test_start_and_end_dates(self):
        todo = self.make(self.tailor, start_date='2026-10-01', due_date='2026-10-05')
        self.assertEqual((todo['start_date'], todo['due_date']), ('2026-10-01', '2026-10-05'))
        backwards = self.call(self.tailor, 'post', '/api/todos/', {
            'title': 'x', 'start_date': '2026-10-05', 'due_date': '2026-10-01'})
        self.assertEqual(backwards.status_code, 400)
        self.assertEqual(self.call(self.tailor, 'post', '/api/todos/', {
            'title': 'x', 'start_date': 'soon'}).status_code, 400)
        self.assertIsNone(self.make(self.tailor)['start_date'])

    def test_an_update_needs_something_in_it(self):
        todo = self.make(self.tailor)
        path = f"/api/todos/{todo['id']}/updates/"
        self.assertEqual(self.call(self.tailor, 'post', path, {}).status_code, 400)
        added = self.call(self.tailor, 'post', path, {'text': 'Stitched the sleeves'})
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual(added.data['updates'][-1]['author_name'], 'Anita')
        bad = self.call(self.tailor, 'post', path, {
            'photos': [SimpleUploadedFile('x.jpg', b'not an image', content_type='image/jpeg')],
        }, fmt='multipart')
        self.assertEqual(bad.status_code, 400)

    def test_edit_reassign_and_delete_rules(self):
        todo = self.make(self.owner, assigned_to=self.tailor.id)
        path = f"/api/todos/{todo['id']}/"
        self.assertEqual(self.call(self.tailor, 'patch', path, {'title': 'x'}).status_code, 403)
        self.assertEqual(self.call(self.tailor, 'delete', path).status_code, 403)
        moved = self.call(self.master, 'patch', path, {'assigned_to': self.other.id})
        self.assertEqual(moved.status_code, 200, moved.data)
        self.assertEqual(moved.data['assigned_to_name'], 'Ravi')
        self.assertEqual(moved.data['updates'][-1]['kind'], 'ASSIGNED')
        self.assertEqual(self.call(self.master, 'delete', path).status_code, 403)
        self.assertEqual(self.call(self.owner, 'delete', path).status_code, 204)
        self.assertFalse(Todo.objects.filter(pk=todo['id']).exists())

    def test_the_owner_can_switch_todos_off_for_a_role(self):
        from crm_api.models import BoutiqueSettings
        settings = BoutiqueSettings.objects.get_or_create(id=1)[0]
        settings.role_modules = {'Tailor': {'todos': False}}
        settings.save()
        self.assertEqual(self.call(self.tailor, 'get', '/api/todos/').status_code, 403)
        self.assertEqual(self.call(self.master, 'get', '/api/todos/').status_code, 200)
