"""The small-issue flow, at the API.

A small issue: received -> verified -> assigned -> worked -> customer review
-> pressed -> packed -> delivered, with the customer's "no" sending it back
to the bench. A big issue -- or one whose size was never decided -- walks the
full flow exactly as it always has.
"""

from rest_framework import status

from apps.alterations.models import AlterationType
from apps.alterations.testbase import AlterationTestCase

BASE = '/api/alterations/'


class SmallIssueFlowTests(AlterationTestCase):

    def setUp(self):
        super().setUp()
        self.owner_api = self.api_client(self.owner)
        self.tailor_api = self.api_client(self.tailor.user)

    def create(self, **kw):
        payload = {
            'customer_id': str(self.customer.id),
            'order_id': self.order.order_id,
            'garment_job_id': str(self.blouse.id),
            'alteration_type': AlterationType.FREE_BOUTIQUE_FAULT,
            'issue_description': 'Hem a touch long.',
        }
        payload.update(kw)
        res = self.owner_api.post(BASE, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res.data

    def post(self, client, alteration_id, path, body=None, expect=status.HTTP_200_OK):
        res = client.post(f'{BASE}{alteration_id}/{path}/', body or {}, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def test_small_issue_walks_its_own_flow(self):
        data = self.create(issue_scale='SMALL')
        aid = data['id']
        self.assertEqual(data['available_actions'][:1], ['start-inspection'])

        # Verify, then straight to a tailor: no estimate, no approval.
        data = self.post(self.owner_api, aid, 'start-inspection')
        self.assertEqual(data['status'], 'INSPECTION')
        self.assertIn('assign', data['available_actions'])
        self.assertNotIn('submit-for-approval', data['available_actions'])

        data = self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id})
        self.assertEqual(data['status'], 'ASSIGNED')

        # The bench works it and says it is done: customer review, not QC.
        data = self.post(self.tailor_api, aid, 'start-work')
        self.assertEqual(data['status'], 'IN_PROGRESS')
        self.assertIn('work-complete', data['available_actions'])
        self.assertNotIn('send-to-qc', data['available_actions'])
        data = self.post(self.tailor_api, aid, 'work-complete')
        self.assertEqual((data['status'], data['status_display']), ('CUSTOMER_REVIEW', 'Customer Review'))

        # The counter records the customer's answer; the bench cannot.
        self.assertNotIn('customer-approved', data['available_actions'])   # tailor's view
        res = self.owner_api.get(f'{BASE}{aid}/')
        self.assertIn('customer-approved', res.data['available_actions'])
        self.assertIn('customer-rejected', res.data['available_actions'])

        data = self.post(self.owner_api, aid, 'customer-approved')
        self.assertEqual(data['status'], 'PRESSING')
        data = self.post(self.owner_api, aid, 'pressed')
        self.assertEqual(data['status'], 'PACKAGING')
        self.assertEqual(data['available_actions'], ['complete', 'cancel', 'record-material'])
        data = self.post(self.owner_api, aid, 'complete')
        self.assertEqual(data['status'], 'COMPLETED')
        self.assertTrue(all(t['status'] == 'COMPLETED' for t in data['tasks']))

    def test_customer_not_satisfied_sends_it_back_to_the_bench(self):
        aid = self.create(issue_scale='SMALL')['id']
        self.post(self.owner_api, aid, 'start-inspection')
        self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id})
        self.post(self.tailor_api, aid, 'start-work')
        self.post(self.tailor_api, aid, 'work-complete')

        # A reason is required, and only the counter may record it.
        self.post(self.owner_api, aid, 'customer-rejected', {}, expect=status.HTTP_400_BAD_REQUEST)
        self.post(self.tailor_api, aid, 'customer-rejected', {'reason': 'Still long.'},
                  expect=status.HTTP_403_FORBIDDEN)
        data = self.post(self.owner_api, aid, 'customer-rejected', {'reason': 'Still a touch long.'})
        self.assertEqual(data['status'], 'IN_PROGRESS')
        self.assertEqual(data['tasks'][0]['status'], 'IN_PROGRESS')
        self.assertEqual(data['activities'][0]['event_type'], 'CUSTOMER_REJECTED')

        # Round two: the same loop, then through to the end.
        data = self.post(self.tailor_api, aid, 'work-complete')
        self.assertEqual(data['status'], 'CUSTOMER_REVIEW')
        self.post(self.owner_api, aid, 'customer-approved')
        self.post(self.owner_api, aid, 'pressed')
        data = self.post(self.owner_api, aid, 'complete')
        self.assertEqual(data['status'], 'COMPLETED')

    def test_small_issue_refuses_the_big_flow_steps(self):
        aid = self.create(issue_scale='SMALL')['id']
        self.post(self.owner_api, aid, 'start-inspection')
        self.post(self.owner_api, aid, 'submit-for-approval', {}, expect=status.HTTP_400_BAD_REQUEST)
        self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id})
        self.post(self.tailor_api, aid, 'start-work')
        self.post(self.tailor_api, aid, 'send-to-qc', {}, expect=status.HTTP_400_BAD_REQUEST)
        # A small issue cannot be delivered before it is pressed and packed.
        self.post(self.owner_api, aid, 'complete', {}, expect=status.HTTP_400_BAD_REQUEST)

    def test_big_and_undecided_issues_walk_the_full_flow_as_before(self):
        for scale in ('BIG', ''):
            with self.subTest(scale=scale):
                aid = self.create(issue_scale=scale)['id']
                data = self.post(self.owner_api, aid, 'start-inspection')
                self.assertIn('submit-for-approval', data['available_actions'])
                self.assertNotIn('assign', data['available_actions'])
                # None of the small stops are ever offered or accepted.
                self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id},
                          expect=status.HTTP_400_BAD_REQUEST)
                self.post(self.owner_api, aid, 'submit-for-approval')
                self.post(self.owner_api, aid, 'approve')
                self.post(self.owner_api, aid, 'assign', {'tailor_id': self.tailor.id})
                data = self.post(self.tailor_api, aid, 'start-work')
                self.assertIn('send-to-qc', data['available_actions'])
                self.assertNotIn('work-complete', data['available_actions'])
                self.post(self.tailor_api, aid, 'work-complete', {}, expect=status.HTTP_400_BAD_REQUEST)
                self.post(self.tailor_api, aid, 'send-to-qc')
                data = self.post(self.owner_api, aid, 'pass-qc')
                self.assertEqual(data['status'], 'READY_FOR_PICKUP')
                self.post(self.owner_api, aid, 'pressed', {}, expect=status.HTTP_400_BAD_REQUEST)
                data = self.post(self.owner_api, aid, 'complete')
                self.assertEqual(data['status'], 'COMPLETED')
