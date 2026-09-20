"""The workroom stages, per garment.

A saree with a blouse and a petticoat is three pieces of work: each has its
own Cutting through Master QC. The order-level stages stay one each, and
wait for every garment. These tests pin the split and the scoping of every
rule to a garment's own rows.
"""

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentJob, GarmentTemplate
from apps.production.models import ProductionTask
from crm_api.models import BoutiqueSettings, OrderStage
from crm_api.test_state_machine import StateMachineTestBase
from domains.orders import workflow
from domains.orders.services import (
    OrderService, ensure_garment_stages, fail_quality_check, reopen_order_stage,
)

WORKROOM = ['pattern_cutting', 'stitching_in_progress', 'finishing', 'pressing',
            'master_quality_check']


class PerGarmentStageTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        self.saree_t = GarmentTemplate.objects.create(key='saree', name='Saree', version=1, sequence=1)
        self.petti_t = GarmentTemplate.objects.create(key='petticoat', name='Petticoat', version=1, sequence=2)
        # _order() made the blouse; add the saree and petticoat, then split.
        self.blouse = self.order.garment_jobs.get()
        self.saree = GarmentJob.objects.create(
            order=self.order, template=self.saree_t, template_version=1,
            spec={}, measurements={}, sequence=1)
        self.petti = GarmentJob.objects.create(
            order=self.order, template=self.petti_t, template_version=1,
            spec={}, measurements={'petticoat_length': '40'}, sequence=2)
        ensure_garment_stages(self.order)
        self.move('created')

    def api(self):
        client = APIClient()
        token, _ = Token.objects.get_or_create(user=self.owner)
        client.credentials(HTTP_AUTHORIZATION="Token " + token.key,
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def row(self, key, job=None):
        return OrderStage.objects.get(order=self.order, stage_key=key, garment_job=job)

    def go(self, key, job, status='COMPLETED', user=None):
        return OrderService.transition_order_stage(
            order=self.order, stage_key=key, new_status=status,
            user=user or self.owner, garment_job=job)

    def finish_garment(self, job):
        for key in WORKROOM:
            self.go(key, job)

    def test_workroom_stages_split_per_garment_and_order_stages_stay_single(self):
        for key in WORKROOM:
            rows = OrderStage.objects.filter(order=self.order, stage_key=key)
            self.assertEqual(rows.count(), 3, key)
            self.assertFalse(rows.filter(garment_job__isnull=True).exists(), key)
            self.assertEqual(ProductionTask.objects.filter(order=self.order, stage_key=key).count(), 3)
        for key in ('created', 'trial_scheduled', 'ready_for_delivery', 'payment', 'delivered'):
            self.assertEqual(OrderStage.objects.filter(order=self.order, stage_key=key).count(), 1, key)
        # Idempotent: a second pass adds nothing.
        before = OrderStage.objects.filter(order=self.order).count()
        ensure_garment_stages(self.order)
        self.assertEqual(OrderStage.objects.filter(order=self.order).count(), before)
        self.assertIn('Stitching · Blouse', ProductionTask.objects.filter(
            order=self.order, garment_job=self.blouse).values_list('title', flat=True))

    def test_a_per_garment_stage_must_name_its_garment(self):
        with self.assertRaises(ValueError) as caught:
            self.move('pattern_cutting')
        self.assertIn('which garment', str(caught.exception))

    def test_each_garment_moves_on_its_own(self):
        self.go('pattern_cutting', self.saree)
        self.assertEqual(self.row('pattern_cutting', self.saree).status, 'COMPLETED')
        self.assertEqual(self.row('pattern_cutting', self.blouse).status, 'NOT_STARTED')
        # The saree can be stitched while the blouse is still uncut...
        self.go('stitching_in_progress', self.saree, 'IN_PROGRESS')
        # ...but the blouse cannot: its own cutting is outstanding.
        with self.assertRaises(ValueError) as caught:
            self.go('stitching_in_progress', self.blouse, 'IN_PROGRESS')
        self.assertIn('Cutting', str(caught.exception))

    def test_order_level_stages_wait_for_every_garment(self):
        self.finish_garment(self.saree)
        self.finish_garment(self.blouse)
        with self.assertRaises(ValueError) as caught:
            self.move('trial_scheduled')
        self.assertIn('not completed', str(caught.exception))
        self.finish_garment(self.petti)
        self.move('trial_scheduled')
        self.assertEqual(self.row('trial_scheduled').status, 'COMPLETED')

    def test_rollup_reads_the_order_as_a_whole(self):
        self.go('pattern_cutting', self.saree)
        self.assertEqual(workflow.rollup(self.order)['pattern_cutting'], 'IN_PROGRESS')
        self.go('pattern_cutting', self.blouse)
        self.go('pattern_cutting', self.petti)
        self.assertEqual(workflow.rollup(self.order)['pattern_cutting'], 'COMPLETED')
        self.assertEqual(workflow.rollup(self.order)['stitching_in_progress'], 'NOT_STARTED')

    def test_reopening_one_garment_leaves_the_others_alone(self):
        self.finish_garment(self.saree)
        self.finish_garment(self.blouse)
        reopen_order_stage(self.order, 'pattern_cutting', user=self.owner,
                           reason='Wrong length', garment_job=self.blouse)
        self.assertEqual(self.row('pattern_cutting', self.blouse).status, 'IN_PROGRESS')
        self.assertEqual(self.row('stitching_in_progress', self.blouse).status, 'NOT_STARTED')
        self.assertEqual(self.row('master_quality_check', self.saree).status, 'COMPLETED')
        self.assertEqual(self.row('stitching_in_progress', self.saree).status, 'COMPLETED')

    def test_failing_qc_on_one_garment_reworks_only_that_garment(self):
        self.finish_garment(self.saree)
        for key in WORKROOM[:-1]:
            self.go(key, self.blouse)
        fail_quality_check(self.order, user=self.owner, reason='Crooked hem',
                           garment_job=self.blouse)
        self.assertEqual(self.row('stitching_in_progress', self.blouse).status, 'IN_PROGRESS')
        self.assertEqual(self.row('pressing', self.blouse).status, 'NOT_STARTED')
        self.assertEqual(self.row('master_quality_check', self.saree).status, 'COMPLETED')
        self.assertEqual(self.row('pressing', self.saree).status, 'COMPLETED')

    def test_complete_all_finishes_every_garment(self):
        res = self.api().post(reverse('order-complete-all', args=[self.order.pk]), {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(OrderStage.objects.filter(order=self.order)
                         .exclude(status__in=('COMPLETED', 'SKIPPED')).exists())
        self.order.refresh_from_db()
        self.assertEqual(self.order.order_status, 'Delivered')

    def test_the_api_names_the_garment_on_each_row(self):
        client = self.api()
        res = client.get(reverse('order-detail', args=[self.order.pk]))
        self.assertEqual(res.status_code, 200)
        rows = [s for s in res.json()['stages'] if s['stage_key'] == 'stitching_in_progress']
        self.assertEqual(sorted(s['garment_name'] for s in rows), ['Blouse', 'Petticoat', 'Saree'])
        res = client.post(reverse('order-transition-stage', args=[self.order.pk]),
                          {'stage_key': 'pattern_cutting', 'status': 'COMPLETED',
                           'garment_job': str(self.saree.id)}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.row('pattern_cutting', self.saree).status, 'COMPLETED')

    def test_an_order_with_one_garment_keeps_the_key_alone_working(self):
        other = self._order(order_id='T2B-SM-2', with_materials=False)
        ensure_garment_stages(other)
        self.assertEqual(OrderStage.objects.filter(order=other, stage_key='pattern_cutting').count(), 1)
        OrderService.transition_order_stage(order=other, stage_key='created', new_status='COMPLETED', user=self.owner)
        OrderService.transition_order_stage(order=other, stage_key='pattern_cutting', new_status='COMPLETED', user=self.owner)
        self.assertEqual(OrderStage.objects.get(order=other, stage_key='pattern_cutting').status, 'COMPLETED')
