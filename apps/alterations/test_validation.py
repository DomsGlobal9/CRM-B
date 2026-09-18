"""What the alteration API refuses at the door, and what it tidies on the way in."""

from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.alterations.models import AlterationRequest, AlterationType
from apps.alterations.testbase import AlterationTestCase
from domains.alterations import services

BASE = '/api/alterations/'


def _error_text(response):
    data = response.data
    if isinstance(data, dict):
        return ' '.join(str(v) for values in data.values() for v in (
            values if isinstance(values, list) else [values]))
    return ' '.join(str(v) for v in data)


class AlterationInputValidationTests(AlterationTestCase):

    def setUp(self):
        super().setUp()
        self.client = self.api_client(self.owner)

    def payload(self, **kw):
        body = {
            'customer_id': str(self.customer.id),
            'order_id': self.order.order_id,
            'garment_job_id': str(self.blouse.id),
            'alteration_type': AlterationType.PAID_CLIENT_REQUEST,
            'issue_description': 'The waist is loose.',
            'charge_amount': '750.00',
        }
        body.update(kw)
        return body

    def test_a_charge_above_the_ceiling_is_refused(self):
        res = self.client.post(BASE, self.payload(charge_amount='99999999.00'), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('Charge amount cannot be more than 10,000,000.', _error_text(res))
        self.assertFalse(AlterationRequest.objects.exists())

    def test_a_negative_charge_is_refused(self):
        res = self.client.post(BASE, self.payload(charge_amount='-1'), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('Charge amount cannot be negative.', _error_text(res))

    def test_an_issue_description_has_an_end_and_is_trimmed(self):
        res = self.client.post(BASE, self.payload(issue_description='x' * 2001), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('2000 characters', _error_text(res))

        res = self.client.post(BASE, self.payload(issue_description='  Hem too long.  '),
                               format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(AlterationRequest.objects.get().issue_description, 'Hem too long.')

    def test_a_payment_reference_has_an_end(self):
        alteration_id = self.client.post(BASE, self.payload(), format='json').data['id']
        res = self.client.post(f'{BASE}{alteration_id}/payments/',
                               {'amount': '100.00', 'transaction_reference': 'R' * 101},
                               format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('100 characters', _error_text(res))

    def test_a_payment_above_the_ceiling_is_refused_before_the_balance_check(self):
        alteration_id = self.client.post(BASE, self.payload(), format='json').data['id']
        res = self.client.post(f'{BASE}{alteration_id}/payments/',
                               {'amount': '99999999.00'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('Payment amount cannot be more than 10,000,000.', _error_text(res))

    def test_an_outside_intake_photo_must_be_an_image(self):
        res = self.client.post(f'{BASE}outside/', {
            'customer_id': str(self.customer.id), 'garment_note': 'Blouse from elsewhere',
            'issue_description': 'Sleeve tight.',
            'intake_photo': SimpleUploadedFile('a.txt', b'hi', content_type='text/plain'),
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('Intake photo must be an image (JPG, PNG or WebP).', _error_text(res))
        self.assertFalse(AlterationRequest.objects.exists())

    def test_a_cancellation_reason_has_an_end(self):
        alteration_id = self.client.post(BASE, self.payload(), format='json').data['id']
        res = self.client.post(f'{BASE}{alteration_id}/cancel/',
                               {'reason': 'r' * 501}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn('500 characters', _error_text(res))


class ServiceMoneyCeilingTests(AlterationTestCase):
    """The service is the last door: a caller that skips the API still cannot
    write a crore against a blouse."""

    def test_the_service_refuses_an_absurd_charge(self):
        with self.assertRaises(ValueError) as ctx:
            services.create_alteration_request(
                customer_id=self.customer.id, order_id=self.order.order_id,
                garment_job_id=self.blouse.id,
                alteration_type=AlterationType.PAID_CLIENT_REQUEST,
                charge_amount=Decimal('10000001'), performed_by=self.owner, role='Owner')
        self.assertIn('Charge amount cannot be more than', str(ctx.exception))
