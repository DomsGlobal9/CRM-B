"""A garment stitched elsewhere, brought in for work: no order of ours and no
garment job, yet an alteration like any other once it is in."""

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.alterations.models import AlterationRequest
from apps.alterations.testbase import AlterationTestCase

BASE = '/api/alterations/'


class OutsideGarmentTests(AlterationTestCase):

    def setUp(self):
        super().setUp()
        self.owner_api = self.api_client(self.owner)
        self.tailor_api = self.api_client(self.tailor.user)

    def intake(self, client=None, expect=status.HTTP_201_CREATED, **kw):
        payload = {
            'customer_id': str(self.customer.id),
            'garment_template_id': str(self.blouse_template.id),
            'garment_note': 'Green silk blouse, bought in Chennai',
            'issue_description': 'Sleeves too tight',
            'issue_scale': 'SMALL',
            'charge_amount': '300.00',
        }
        payload.update(kw)
        res = (client or self.owner_api).post(f'{BASE}outside/', payload, format='multipart')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def post(self, client, aid, path, body=None, expect=status.HTTP_200_OK):
        res = client.post(f'{BASE}{aid}/{path}/', body or {}, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def test_intake_without_an_order_is_a_paid_outside_alteration(self):
        data = self.intake(intake_photo=SimpleUploadedFile('as-received.png', b'\x89PNG\r\n\x1a\n',
                                                           content_type='image/png'))
        self.assertTrue(data['alteration_number'].startswith('ALT-OUT-'))
        self.assertEqual((data['origin'], data['origin_display']), ('OUTSIDE', 'Brought from outside'))
        self.assertIsNone(data['original_order'])
        self.assertIsNone(data['garment_job'])
        self.assertEqual(data['garment_name'], 'Blouse')
        self.assertEqual(data['garment_note'], 'Green silk blouse, bought in Chennai')
        self.assertIn('alteration_intake/', data['intake_photo_url'])
        self.assertEqual(data['alteration_type'], 'PAID_CLIENT_REQUEST')
        self.assertEqual(data['outstanding_balance'], '300.00')
        self.assertEqual(data['status'], 'RECEIVED')
        # It lists with the rest, and the register still separates it.
        res = self.owner_api.get(BASE, {'search': 'Chennai'})
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual([r['alteration_number'] for r in rows], [data['alteration_number']])

    def test_outside_garment_walks_the_small_flow_to_delivery(self):
        aid = self.intake()['id']
        self.post(self.owner_api, aid, 'start-inspection')
        self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id})
        self.post(self.tailor_api, aid, 'start-work')
        self.post(self.tailor_api, aid, 'work-complete')
        self.post(self.owner_api, aid, 'customer-approved')
        self.post(self.owner_api, aid, 'pressed')
        # Money still has to be taken before it is handed back.
        self.post(self.owner_api, aid, 'complete', {}, expect=status.HTTP_400_BAD_REQUEST)
        self.post(self.owner_api, aid, 'payments', {'amount': '300.00', 'payment_method': 'CASH'},
                  expect=status.HTTP_201_CREATED)
        data = self.post(self.owner_api, aid, 'complete')
        self.assertEqual(data['status'], 'COMPLETED')

    def test_outside_garment_can_take_the_big_flow_too(self):
        aid = self.intake(issue_scale='BIG')['id']
        self.post(self.owner_api, aid, 'start-inspection')
        data = self.post(self.owner_api, aid, 'submit-for-approval', {'charge_amount': '450.00'})
        self.assertEqual(data['status'], 'PENDING_APPROVAL')

    def test_refusals(self):
        # Something has to say what the garment is.
        self.intake(garment_template_id='', garment_note='', expect=status.HTTP_400_BAD_REQUEST)
        # A note alone is enough when the garment type is not in our list.
        data = self.intake(garment_template_id='', garment_note='A kaftan')
        self.assertEqual(data['garment_name'], '')
        # Only the counter takes garments in.
        self.intake(client=self.tailor_api, expect=status.HTTP_403_FORBIDDEN)
        self.intake(charge_amount='-1', expect=status.HTTP_400_BAD_REQUEST)

    def test_own_order_alterations_are_untouched(self):
        res = self.owner_api.post(BASE, {
            'customer_id': str(self.customer.id), 'order_id': self.order.order_id,
            'garment_job_id': str(self.blouse.id), 'issue_description': 'Loose.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual((res.data['origin'], res.data['garment_name']), ('OWN', 'Blouse'))
        self.assertTrue(res.data['alteration_number'].startswith('ALT-T2B-ALT-1-'))
        self.assertEqual(AlterationRequest.objects.filter(origin='OWN').count(), 1)
