"""What the design studio refuses at the door, and what it tidies on the way in."""

import io
from datetime import date, timedelta

from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentTemplate
from crm_api.models import Customer

from .models import DesignAsset, DesignAssignment
from .test_assignments import AssignmentTestCase


def png(name='sketch.png'):
    # Real bytes: the validator opens the file with Pillow, not just the header.
    buffer = io.BytesIO()
    Image.new('RGB', (2, 2)).save(buffer, 'PNG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/png')


def _error_text(response):
    data = response.data
    if isinstance(data, dict):
        return ' '.join(str(v) for values in data.values() for v in (
            values if isinstance(values, list) else [values]))
    return ' '.join(str(v) for v in data)


class DesignAssetValidationTests(AssignmentTestCase):
    def _post(self, **overrides):
        payload = {'title': 'Maroon Bridal Lehenga', 'image_url': 'https://cdn.test/l.jpg'}
        payload.update(overrides)
        return self.client.post('/api/design-studio/assets/', payload, format='json')

    def test_a_link_must_be_http(self):
        response = self._post(image_url='javascript:alert(1)')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Image link must start with http:// or https://.', _error_text(response))

    def test_a_video_link_must_be_http(self):
        response = self._post(video_url='javascript:alert(1)')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Video link must start with http:// or https://.', _error_text(response))

    def test_a_link_has_an_end(self):
        response = self._post(source_url='https://cdn.test/' + 'a' * 500)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(DesignAsset.objects.filter(title='Maroon Bridal Lehenga').exists())

    def test_estimated_price_cannot_be_negative(self):
        response = self._post(estimated_price='-1')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Estimated price cannot be negative.', _error_text(response))

    def test_a_title_is_trimmed_and_bounded(self):
        response = self._post(title='  Maroon Bridal Lehenga  ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['title'], 'Maroon Bridal Lehenga')
        self.assertEqual(self._post(title='t' * 201).status_code, 400)

    def test_an_upload_must_be_an_image(self):
        response = self.client.post('/api/design-studio/assets/', {
            'title': 'Not a picture',
            'images': SimpleUploadedFile('evil.exe', b'MZ', content_type='application/octet-stream'),
        }, format='multipart')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Photos must be an image (JPG, PNG or WebP).', _error_text(response))

    def test_a_reference_picture_is_checked_by_its_bytes(self):
        url = '/api/design-studio/reference-upload/'
        response = self.client.post(url, {'image': SimpleUploadedFile(
            'evil.jpg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', content_type='image/jpeg')},
            format='multipart')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Reference picture must be an image (JPG, PNG or WebP).', _error_text(response))
        response = self.client.post(url, {'image': png()}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)


class AssignmentValidationTests(AssignmentTestCase):
    def test_a_due_date_in_the_past_is_refused(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        response = self._assign(self.lehenga_job, self.meera, due_date=yesterday)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Due date cannot be in the past.', _error_text(response))

    def test_a_brief_has_an_end(self):
        response = self._assign(self.lehenga_job, self.meera, brief='b' * 2001)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Brief is limited to 2000 characters.', _error_text(response))

    def test_sending_a_design_back_needs_a_note(self):
        self._assign(self.lehenga_job, self.meera)
        assignment = DesignAssignment.objects.get(garment_job=self.lehenga_job)
        design = self._design_by(self.meera, 'First pass')
        self._submit(assignment.id, design, self.meera_client)

        refused = self._review(assignment.id, 'changes')
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn('Review note is required.', _error_text(refused))
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, DesignAssignment.Status.SUBMITTED)

        accepted = self._review(assignment.id, 'changes', note='  Border too thin.  ')
        self.assertEqual(accepted.status_code, 200, accepted.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.review_note, 'Border too thin.')


class CustomerDesignValidationTests(TenantTestCase):
    """The same fixture as tests_customer_design, without inheriting its tests."""

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "cd@test.com"
        tenant.name = "Customer Design Atelier"
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.client = APIClient()
        user = User.objects.create_user(username="cd@test.com", email="cd@test.com", password="pw")
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key,
                                HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.priya = Customer.objects.create(first_name='Priya', last_name='S', mobile_number='9000000001')
        self.blouse = GarmentTemplate.resolve('blouse')

    def create(self, **over):
        data = {'title': 'Bridal Blouse', 'customer': str(self.priya.id),
                'template': str(self.blouse.id), 'notes': 'Deep back neck.', 'image': png()}
        data.update(over)
        return self.client.post('/api/design-studio/customer-designs/', data, format='multipart')

    def test_a_sketch_must_be_an_image(self):
        response = self.create(image=SimpleUploadedFile(
            'sketch.pdf', b'%PDF-1.4', content_type='application/pdf'))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn('Design picture must be an image (JPG, PNG or WebP).', _error_text(response))

    def test_notes_have_an_end(self):
        response = self.create(notes='n' * 2001)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn('Notes is limited to 2000 characters.', _error_text(response))
