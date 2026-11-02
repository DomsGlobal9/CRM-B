"""The To-do: who posts daily updates and who reads them.

Staff post and read their own; the owner, Masters and Designers read
everyone's; the owner does not post. Files are not sent to real storage --
`_store` is stubbed, the checks before it are what is under test.
"""
from datetime import timedelta
from io import BytesIO
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from apps.staff.attendance import business_date
from apps.staff.tests import AttendanceTestCase

from .models import DailyUpdate

URL = '/api/daily-updates/'


def _png(name='work.png'):
    buf = BytesIO()
    Image.new('RGB', (4, 4), 'red').save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


def _fake_store(upload, folder, request, video=False):
    return f'https://media.test/{folder}/{upload.name}'


class DailyUpdateTestCase(AttendanceTestCase):

    def setUp(self):
        super().setUp()
        self.designer_user = User.objects.create_user(
            username='dia', email='dia@staff.test', password='diapass12345')
        Designer.objects.create(name='Dia', email='dia@staff.test', user=self.designer_user)

    def post(self, user, data, **kwargs):
        return self.client_for(user).post(URL, data, format='multipart', **kwargs)

    def listing(self, user, **params):
        return self.client_for(user).get(URL, params)

    def an_update(self, user, name, note='Stitched two blouses', days_ago=0):
        return DailyUpdate.objects.create(
            author=user, author_name=name, author_role='Tailor',
            date=business_date(timezone.now()) - timedelta(days=days_ago), note=note)


class PostingTests(DailyUpdateTestCase):

    def test_staff_post_a_note(self):
        response = self.post(self.anita_user, {'note': 'Cut the lehenga panels'})

        self.assertEqual(response.status_code, 201, response.data)
        row = DailyUpdate.objects.get()
        self.assertEqual(row.author, self.anita_user)
        self.assertEqual(row.author_name, 'Anita')
        self.assertEqual(row.author_role, 'Tailor')
        self.assertEqual(row.date, business_date(timezone.now()))
        self.assertTrue(response.data['mine'])

    @mock.patch('apps.daily_updates.views._store', side_effect=_fake_store)
    def test_photos_video_and_voice_note_are_kept(self, _store):
        clip = SimpleUploadedFile('day.mp4', b'\x00' * 64, content_type='video/mp4')
        response = self.post(self.anita_user, {
            'photos': [_png('a.png'), _png('b.png')], 'video': clip,
            'voice_note': 'https://media.test/voice/1.webm'})

        self.assertEqual(response.status_code, 201, response.data)
        row = DailyUpdate.objects.get()
        self.assertEqual(row.photos, ['https://media.test/photos/a.png', 'https://media.test/photos/b.png'])
        self.assertEqual(row.video, 'https://media.test/videos/day.mp4')
        self.assertEqual(row.voice_note, 'https://media.test/voice/1.webm')

    def test_master_and_designer_post_too(self):
        self.assertEqual(self.post(self.master_user, {'note': 'Checked fittings'}).status_code, 201)
        self.assertEqual(self.post(self.designer_user, {'note': 'Two sketches'}).status_code, 201)
        self.assertEqual(DailyUpdate.objects.count(), 2)

    def test_the_owner_does_not_post(self):
        response = self.post(self.owner, {'note': 'Hello'})

        self.assertEqual(response.status_code, 403)
        self.assertFalse(DailyUpdate.objects.exists())

    def test_an_empty_update_is_refused(self):
        response = self.post(self.anita_user, {'note': '   '})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(DailyUpdate.objects.exists())

    def test_a_video_that_is_not_a_video_is_refused(self):
        fake = SimpleUploadedFile('day.mp4', b'not a video', content_type='text/plain')
        response = self.post(self.anita_user, {'video': fake})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(DailyUpdate.objects.exists())

    def test_a_photo_that_is_not_an_image_is_refused(self):
        fake = SimpleUploadedFile('a.png', b'<svg></svg>', content_type='image/png')
        response = self.post(self.anita_user, {'photos': [fake]})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(DailyUpdate.objects.exists())

    def test_signed_out_is_refused(self):
        anonymous = APIClient()
        anonymous.credentials(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.assertIn(anonymous.post(URL, {'note': 'x'}).status_code, (401, 403))
        self.assertFalse(DailyUpdate.objects.exists())


class ReadingTests(DailyUpdateTestCase):

    def setUp(self):
        super().setUp()
        self.anitas = self.an_update(self.anita_user, 'Anita')
        self.balans = self.an_update(self.balan_user, 'Balan', note='Hemmed three sarees')

    def ids(self, response):
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in response.data['results']}

    def test_staff_see_only_their_own(self):
        response = self.listing(self.anita_user)

        self.assertEqual(self.ids(response), {self.anitas.id})
        self.assertFalse(response.data['sees_everyone'])
        self.assertTrue(response.data['can_post'])

    def test_staff_cannot_read_someone_else_by_person(self):
        response = self.listing(self.anita_user, person=self.balan_user.id)

        self.assertEqual(self.ids(response), {self.anitas.id})

    def test_owner_master_and_designer_see_everyone(self):
        for user in (self.owner, self.master_user, self.designer_user):
            response = self.listing(user)
            self.assertEqual(self.ids(response), {self.anitas.id, self.balans.id}, user.username)
            self.assertTrue(response.data['sees_everyone'])

    def test_the_owner_is_told_they_do_not_post(self):
        self.assertFalse(self.listing(self.owner).data['can_post'])

    def test_supervisors_filter_by_person(self):
        response = self.listing(self.master_user, person=self.balan_user.id)

        self.assertEqual(self.ids(response), {self.balans.id})

    def test_a_month_holds_only_its_own_days(self):
        today = business_date(timezone.now())
        last_month = (today.replace(day=1) - timedelta(days=1))
        old = DailyUpdate.objects.create(author=self.anita_user, author_name='Anita',
                                         date=last_month, note='Old work')

        this = self.listing(self.anita_user)
        that = self.listing(self.anita_user, month=last_month.strftime('%Y-%m'))

        self.assertEqual(this.data['month'], today.strftime('%Y-%m'))
        self.assertEqual(self.ids(this), {self.anitas.id})
        self.assertEqual(self.ids(that), {old.id})

    def test_a_bad_month_is_refused(self):
        self.assertEqual(self.listing(self.anita_user, month='soon').status_code, 400)


class DeletingTests(DailyUpdateTestCase):

    def test_staff_delete_their_own(self):
        row = self.an_update(self.anita_user, 'Anita')

        response = self.client_for(self.anita_user).delete(f'{URL}{row.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(DailyUpdate.objects.exists())

    def test_nobody_deletes_someone_elses(self):
        row = self.an_update(self.anita_user, 'Anita')

        for user in (self.balan_user, self.owner, self.master_user):
            self.assertEqual(self.client_for(user).delete(f'{URL}{row.id}/').status_code, 403, user.username)
        self.assertTrue(DailyUpdate.objects.filter(pk=row.pk).exists())
