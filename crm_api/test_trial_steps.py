"""Trial Required: a garment answered No has no trial steps in its workflow.

Answered Yes -- or never asked, as on orders from before the question was
required -- it keeps Trial booking and Trial, as every garment did.
"""
from apps.catalog.models import GarmentJob, GarmentTemplate
from apps.production.models import ProductionTask
from core.templates import SpecValidationError, validate_spec
from crm_api.models import OrderStage
from crm_api.test_state_machine import StateMachineTestBase
from domains.orders.services import OrderService, TRIAL_STAGES, ensure_garment_stages

WORKROOM = ['pattern_cutting', 'stitching_in_progress', 'finishing', 'pressing',
            'master_quality_check']


class TrialStepTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        self.saree_t = GarmentTemplate.objects.create(key='saree', name='Saree', version=1, sequence=1)
        self.blouse = self.order.garment_jobs.get()

    def add(self, trial, template=None, sequence=1):
        return GarmentJob.objects.create(
            order=self.order, template=template or self.saree_t, template_version=1,
            spec={} if trial is None else {'trial_required': trial}, measurements={},
            sequence=sequence)

    def trial_rows(self, job=None, order=None):
        rows = OrderStage.objects.filter(order=order or self.order, stage_key__in=TRIAL_STAGES)
        return rows.filter(garment_job=job) if job is not None else rows

    def go(self, key, job):
        return OrderService.transition_order_stage(
            order=self.order, stage_key=key, new_status='COMPLETED',
            user=self.owner, garment_job=job)

    def test_a_garment_without_a_trial_gets_no_trial_steps(self):
        self.blouse.spec = {'trial_required': True}
        self.blouse.save()
        saree = self.add(False)

        ensure_garment_stages(self.order)

        self.assertEqual(self.trial_rows(self.blouse).count(), 2)
        self.assertFalse(self.trial_rows(saree).exists())
        self.assertFalse(ProductionTask.objects.filter(
            order=self.order, garment_job=saree, stage_key__in=TRIAL_STAGES).exists())
        # Every other step is still there for the saree.
        self.assertTrue(OrderStage.objects.filter(
            order=self.order, garment_job=saree, stage_key='ready_for_delivery').exists())

    def test_when_no_garment_wants_a_trial_the_steps_are_gone_from_the_order(self):
        self.blouse.spec = {'trial_required': False}
        self.blouse.save()
        self.add(False)

        ensure_garment_stages(self.order)

        self.assertFalse(self.trial_rows().exists())
        self.assertFalse(ProductionTask.objects.filter(
            order=self.order, stage_key__in=TRIAL_STAGES).exists())

    def test_unanswered_keeps_the_trial_steps_as_before(self):
        saree = self.add(None)

        ensure_garment_stages(self.order)

        self.assertEqual(self.trial_rows(self.blouse).count(), 2)
        self.assertEqual(self.trial_rows(saree).count(), 2)

    def test_without_a_trial_delivery_prep_follows_the_quality_check(self):
        self.blouse.spec = {'trial_required': False}
        self.blouse.save()
        ensure_garment_stages(self.order)
        self.move('created')
        for key in WORKROOM:
            self.go(key, self.blouse)

        self.go('ready_for_delivery', self.blouse)

        self.assertEqual(OrderStage.objects.get(
            order=self.order, garment_job=self.blouse, stage_key='ready_for_delivery').status,
            'COMPLETED')

    def test_with_a_trial_delivery_prep_still_waits_for_it(self):
        self.blouse.spec = {'trial_required': True}
        self.blouse.save()
        ensure_garment_stages(self.order)
        self.move('created')
        for key in WORKROOM:
            self.go(key, self.blouse)

        with self.assertRaisesMessage(ValueError, 'Trial'):
            self.go('ready_for_delivery', self.blouse)

    def test_a_garment_added_later_that_wants_a_trial_gets_the_steps(self):
        self.blouse.spec = {'trial_required': False}
        self.blouse.save()
        ensure_garment_stages(self.order)
        self.assertFalse(self.trial_rows().exists())

        saree = self.add(True)
        ensure_garment_stages(self.order)

        rows = self.trial_rows(saree)
        self.assertEqual(rows.count(), 2)
        qc = OrderStage.objects.get(order=self.order, garment_job=saree, stage_key='master_quality_check')
        delivery = OrderStage.objects.get(order=self.order, garment_job=saree, stage_key='ready_for_delivery')
        for row in rows:
            self.assertGreater(row.sequence, qc.sequence)
            self.assertLess(row.sequence, delivery.sequence)
        self.assertFalse(self.trial_rows(self.blouse).exists())


class TrialRequiredQuestionTests(StateMachineTestBase):
    """The order form's Trial Required must be answered, Yes or No."""

    def global_template(self):
        # The synced one, with its questions -- not a bare test template.
        return (GarmentTemplate.objects.filter(tenant__isnull=True, key='saree', is_active=True,
                                               sections__isnull=False).distinct().first())

    def test_the_question_must_be_answered(self):
        saree = self.global_template()
        if saree is None:
            self.skipTest('global templates are not synced in this database')
        with self.assertRaises(SpecValidationError) as caught:
            validate_spec(saree, {'saree_type': 'silk', 'services': ['fall_pico']})
        self.assertIn('trial_required', caught.exception.errors)

    def test_no_is_an_answer(self):
        saree = self.global_template()
        if saree is None:
            self.skipTest('global templates are not synced in this database')
        cleaned = validate_spec(saree, {'saree_type': 'silk', 'services': ['fall_pico'],
                                        'trial_required': False})
        self.assertIs(cleaned['trial_required'], False)
