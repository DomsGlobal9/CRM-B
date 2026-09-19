
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.db import models
from django_tenants.test.cases import TenantTestCase

from apps.catalog.models import GarmentJob, GarmentTemplate, JobMaterial
from apps.inventory.models import Category, InventoryItem, StockMovement, Unit
from apps.inventory.services import InventoryService
from crm_api.models import (
    BoutiqueSettings, Customer, CustomerMessage, Order, OrderActivity, OrderStage,
    Tailor,
)
from domains.orders import workflow
from domains.orders.services import OrderService

# The plain stitching path. Every order here is placed on it; the maggam
# path and the legacy line are FlowTests' business.
SEQUENCE = [
    'created', 'pattern_cutting',
    'assigned_to_tailor', 'stitching_in_progress',
    'stitching_completed', 'finishing', 'pressing', 'master_quality_check',
    'trial_scheduled', 'trial_completed', 'ready_for_delivery', 'delivered',
]


class StateMachineTestBase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@statemachine.test"
        tenant.name = "State Machine Atelier"
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)

        self.owner = User.objects.create_user(
            username="owner@statemachine.test", email="owner@statemachine.test",
            password="ownerpass123")
        self.tailor_user = User.objects.create_user(
            username="tailor@statemachine.test", email="tailor@statemachine.test",
            password="tailorpass123")
        self.tailor = Tailor.objects.create(
            name="Sunita Devi", specialty="Stitching", role="Tailor",
            user=self.tailor_user)
        self.master_user = User.objects.create_user(
            username="master@statemachine.test", email="master@statemachine.test",
            password="masterpass123")
        self.master = Tailor.objects.create(
            name="Ravi Kumar", specialty="Cutting", role="Master",
            user=self.master_user)

        BoutiqueSettings.objects.get_or_create(id=1)
        self.customer = Customer.objects.create(
            first_name="Lakshmi", last_name="Iyer", mobile_number="919845012345",
            email_address="lakshmi@statemachine.test", address="44 Church Street",
            customer_type="Women", garment_type="Blouse")
        self.template = GarmentTemplate.objects.create(
            key='blouse', name='Blouse', version=1, sequence=0)
        self.brocade = InventoryItem.objects.create(
            item_code='FAB-001', name='Maroon Brocade', category=Category.FABRIC,
            unit=Unit.METER, purchase_price=Decimal('100'), reorder_level=Decimal('5'))
        InventoryService.stock_in(self.brocade, Decimal('25'), user=self.owner,
                                  remarks='Opening')

        self.order = self._order()

    def _order(self, order_id="T2B-SM-1", with_materials=True):
        order = Order.objects.create(
            order_id=order_id, customer=self.customer, total_amount=Decimal('1000'),
            tailor=self.tailor, master=self.master)
        config = BoutiqueSettings.objects.get(id=1).workflow_config
        for seq, conf in enumerate(workflow.stages_for_flow(config, 'stitching')):
            OrderStage.objects.create(
                order=order, stage_key=conf['key'], stage_name=conf['name'],
                sequence=seq, sla_hours=conf.get('sla_hours', 24))
        job = GarmentJob.objects.create(
            order=order, template=self.template, template_version=1,
            spec={}, measurements={'chest': '36'}, sequence=0)
        if with_materials:
            JobMaterial.objects.create(
                job=job, field_key='main_fabric', inventory_item=self.brocade,
                quantity=Decimal('2'), unit=Unit.METER,
                source=JobMaterial.Source.STORE)
        return order

    def reserve_fabric(self, order=None):
        # The order-confirm view reserves the chosen fabric the moment the
        # order is taken; there is no Fabric stage to do it later.
        from apps.inventory import order_materials
        return order_materials.sync_order_materials(
            order or self.order, 'created', 'COMPLETED', user=self.owner)

    def move(self, stage_key, status='COMPLETED', user=None, order=None):
        return OrderService.transition_order_stage(
            order=order or self.order, stage_key=stage_key, new_status=status,
            user=user or self.owner)

    def advance_to(self, stage_key, order=None):

        order = order or self.order
        for key in SEQUENCE[:SEQUENCE.index(stage_key)]:
            status = 'SKIPPED' if workflow.is_optional(
                BoutiqueSettings.objects.get(id=1).workflow_config, key) else 'COMPLETED'
            self.move(key, status, order=order)

    def snapshot(self, order=None):

        order = order or self.order
        order.refresh_from_db()
        self.brocade.refresh_from_db()
        return {
            'order_status': order.order_status,
            'current_stage': order.current_stage_key,
            'stages': dict(order.stages.values_list('stage_key', 'status')),
            'started': dict(order.stages.values_list('stage_key', 'started_at')),
            'completed': dict(order.stages.values_list('stage_key', 'completed_at')),
            'tailor': order.tailor_id,
            'master': order.master_id,
            'stock': self.brocade.current_stock,
            'reserved': self.brocade.reserved_stock,
            'movements': StockMovement.objects.filter(order=order).count(),
            'activities': OrderActivity.objects.filter(order=order).count(),
            'messages': CustomerMessage.objects.filter(order=order).count(),
        }


class StatusAnnouncementTests(StateMachineTestBase):
    """Fifteen stages, six statuses: only a change is news."""

    def notifications(self, **filters):
        from crm_api.models import Notification
        return Notification.objects.filter(**filters)

    def test_a_stage_that_leaves_the_status_alone_announces_nothing(self):
        self.advance_to('stitching_completed')
        self.move('stitching_completed')        # Quality Check begins here
        before = self.notifications().count()
        messages = self.snapshot()['messages']

        # Two more stages, same status: the owner, the customer, the tailor and
        # the master were each told again on every one of them.
        self.move('finishing')
        self.move('pressing')

        self.assertEqual(self.notifications().count(), before,
                         'a status that did not change was announced again')
        self.assertEqual(self.snapshot()['messages'], messages,
                         'the customer was messaged about nothing')

    def test_a_real_change_is_announced_once(self):
        self.advance_to('stitching_completed')
        before = self.notifications(recipient_role='Customer').count()

        self.move('stitching_completed')        # Design & Creation -> Quality Check

        self.assertEqual(self.notifications(recipient_role='Customer').count(),
                         before + 1)
        self.assertEqual(
            self.notifications(recipient_role='Master',
                               title__startswith='Quality Check Required').count(), 1)


class InvalidTransitionTests(StateMachineTestBase):

    def test_pattern_cutting_to_ready_for_dispatch_is_refused(self):

        self.advance_to('assigned_to_tailor')   # through pattern cutting
        before = self.snapshot()

        with self.assertRaises(ValueError) as caught:
            self.move('ready_for_delivery')

        self.assertIn('not completed', str(caught.exception))
        self.assertEqual(self.snapshot(), before, 'a refusal must change nothing')

    def test_a_refused_transition_leaves_absolutely_everything_alone(self):
        self.reserve_fabric()
        self.advance_to('pattern_cutting')
        self.move('pattern_cutting')
        before = self.snapshot()
        self.assertGreater(before['reserved'], 0, 'precondition: something is reserved')

        with self.assertRaises(ValueError):
            self.move('delivered')

        self.assertEqual(self.snapshot(), before)

    def test_a_mandatory_stage_cannot_be_skipped(self):
        self.advance_to('pressing')
        before = self.snapshot()
        with self.assertRaises(ValueError) as caught:
            self.move('pressing', 'SKIPPED')
        self.assertIn('cannot be skipped', str(caught.exception))
        self.assertEqual(self.snapshot(), before)

    def test_maggam_design_cannot_be_skipped_on_the_maggam_path(self):
        # On the maggam path the work is the point of the path, so it is not
        # optional the way it was on the old single line.
        order = self._order(order_id="T2B-SM-M")
        from domains.orders.services import set_order_flow
        set_order_flow(order, 'maggam', self.owner)
        for key in ('created', 'paper_cutting'):
            self.move(key, order=order)
        with self.assertRaises(ValueError) as caught:
            self.move('maggam_work', 'SKIPPED', order=order)
        self.assertIn('cannot be skipped', str(caught.exception))

    def test_an_unknown_stage_is_refused(self):
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.move('teleport_to_delivery')
        self.assertEqual(self.snapshot(), before)

    def test_an_invalid_status_is_refused(self):
        before = self.snapshot()
        with self.assertRaises(ValueError) as caught:
            self.move('pattern_cutting', 'BANANA')
        self.assertIn('Invalid stage status', str(caught.exception))
        self.assertEqual(self.snapshot(), before)

    def test_a_completed_stage_cannot_be_reopened(self):

        self.advance_to('pattern_cutting')
        self.move('pattern_cutting')
        before = self.snapshot()

        with self.assertRaises(ValueError) as caught:
            self.move('pattern_cutting', 'IN_PROGRESS')

        self.assertIn('already completed', str(caught.exception))
        self.assertEqual(self.snapshot(), before)

    def test_nothing_moves_after_delivery(self):
        for key in SEQUENCE:
            self.move(key)
        self.assertEqual(self.order.stages.get(stage_key='delivered').status,
                         'COMPLETED')
        before = self.snapshot()

        with self.assertRaises(ValueError):
            self.move('delivered', 'IN_PROGRESS')
        with self.assertRaises(ValueError):
            self.move('pressing', 'IN_PROGRESS')

        self.assertEqual(self.snapshot(), before)

    def test_an_unauthorised_role_is_refused(self):

        self.advance_to('master_quality_check')
        before = self.snapshot()
        with self.assertRaises(ValueError) as caught:
            self.move('master_quality_check', user=self.tailor_user)
        self.assertIn('not authorized', str(caught.exception))
        self.assertEqual(self.snapshot(), before)

    def test_a_stage_missing_its_required_data_is_refused(self):

        order = self._order(order_id="T2B-SM-NOTAILOR")
        order.tailor = None
        order.save(update_fields=['tailor'])
        self.advance_to('stitching_in_progress', order=order)

        with self.assertRaises(ValueError) as caught:
            self.move('stitching_in_progress', 'IN_PROGRESS', order=order, user=self.tailor_user)
        self.assertIn('No tailor is assigned', str(caught.exception))

    def test_a_supervisor_stitches_without_naming_a_tailor(self):
        # The owner of a one-person boutique, or the Master, is the stitcher.
        order = self._order(order_id="T2B-SM-SOLO")
        order.tailor = None
        order.save(update_fields=['tailor'])
        self.advance_to('stitching_in_progress', order=order)
        for user in (self.owner, self.master_user):
            self.move('stitching_in_progress', 'IN_PROGRESS', order=order, user=user)
        self.move('stitching_in_progress', 'COMPLETED', order=order, user=self.master_user)
        self.assertEqual(order.stages.get(stage_key='stitching_in_progress').status, 'COMPLETED')


class ValidSequenceTests(StateMachineTestBase):

    def test_the_whole_workflow_runs_in_order(self):
        for key in SEQUENCE:
            self.move(key)
            self.assertEqual(
                self.order.stages.get(stage_key=key).status, 'COMPLETED',
                f'{key} did not reach COMPLETED')

        self.order.refresh_from_db()
        self.assertEqual(self.order.order_status, 'Delivered')
        self.assertEqual(self.order.current_stage_key, 'delivered')

    def test_each_stage_refuses_until_its_predecessor_is_done(self):

        config = BoutiqueSettings.objects.get(id=1).workflow_config
        for index, key in enumerate(SEQUENCE[:-2]):
            if not workflow.is_optional(config, SEQUENCE[index + 1]):
                later = SEQUENCE[index + 2]
                with self.assertRaises(ValueError, msg=f'{later} should be refused'):
                    self.move(later)
            self.move(key)

    def test_a_successful_transition_writes_exactly_one_activity_event(self):
        before = OrderActivity.objects.filter(order=self.order).count()
        self.advance_to('pattern_cutting')
        self.move('pattern_cutting')
        after = OrderActivity.objects.filter(order=self.order).count()
        self.assertEqual(after - before, 2)


class IdempotencyTests(StateMachineTestBase):

    def test_repeating_a_completed_transition_changes_nothing_further(self):

        self.reserve_fabric()
        self.advance_to('pattern_cutting')
        self.move('pattern_cutting')
        after_first = self.snapshot()
        self.assertGreater(after_first['reserved'], 0)

        for _ in range(3):
            self.move('pattern_cutting')

        self.assertEqual(self.snapshot(), after_first,
                         'a retry must not log or message again')

    def test_repeating_stitching_completed_does_not_consume_twice(self):

        self.advance_to('stitching_completed')
        self.move('stitching_completed')
        after_first = self.snapshot()
        self.assertEqual(after_first['stock'], Decimal('23.000'))

        self.move('stitching_completed')
        self.move('stitching_completed')

        self.assertEqual(self.snapshot(), after_first)
        self.assertEqual(
            StockMovement.objects.filter(
                order=self.order,
                movement_type=StockMovement.Type.CONSUMPTION).count(), 1)


class OwnerDropdownLiveRegressionTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        from rest_framework.authtoken.models import Token
        from rest_framework.test import APIClient
        token, _ = Token.objects.get_or_create(user=self.owner)
        self.api = APIClient()
        self.api.credentials(
            HTTP_AUTHORIZATION=f'Token {token.key}',
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )

    def set_status(self, value):
        from django.urls import reverse
        return self.api.patch(
            reverse('order-update-status', args=[self.order.id]),
            {'status': value}, format='json')

    def test_the_dropdown_cannot_manufacture_a_delivered_order(self):
        before = self.snapshot()

        response = self.set_status('Delivered')
        self.assertEqual(response.status_code, 400)
        self.assertIn('not completed', str(response.data))

        self.assertEqual(self.snapshot(), before)
        self.assertEqual(before['reserved'], Decimal('0.000'))
        self.assertEqual(before['movements'], 0)

        for value in ['Received', 'Confirmed', 'Design & Creation']:
            self.assertEqual(self.set_status(value).status_code, 200,
                             f'{value} should be reachable in turn')

        mid = self.snapshot()
        self.assertEqual(mid['order_status'], 'Design & Creation')
        self.assertEqual(mid['stages']['stitching_completed'], 'COMPLETED')
        self.assertGreater(mid['movements'], 0, 'materials followed production')

        refused = self.set_status('Ready for Dispatch')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('Master quality check', str(refused.data))
        self.assertEqual(
            self.order.stages.get(stage_key='master_quality_check').status,
            'NOT_STARTED')

        self.assertEqual(self.set_status('Quality Check').status_code, 200)
        self.assertEqual(
            self.order.stages.get(stage_key='master_quality_check').status,
            'COMPLETED')
        for value in ['Ready for Dispatch', 'Delivered']:
            self.assertEqual(self.set_status(value).status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.order_status, 'Delivered')
        outstanding = list(
            self.order.stages.exclude(status__in=('COMPLETED', 'SKIPPED'))
            .values_list('stage_key', flat=True))
        self.assertEqual(outstanding, [], f'delivered with gaps: {outstanding}')


class AtomicityTests(StateMachineTestBase):

    def test_a_failing_side_effect_rolls_the_whole_transition_back(self):
        self.advance_to('stitching_completed')
        before = self.snapshot()

        with mock.patch(
            'apps.inventory.order_materials.sync_order_materials',
            side_effect=RuntimeError('consumption exploded'),
        ):
            with self.assertRaises(RuntimeError):
                self.move('stitching_completed')

        self.assertEqual(self.snapshot(), before,
                         'a failed side effect must take the stage back with it')

    def test_a_successful_transition_commits_state_stock_and_audit_together(self):
        self.reserve_fabric()
        self.advance_to('stitching_completed')
        before = self.snapshot()
        self.assertEqual(before['reserved'], Decimal('2.000'))

        self.move('stitching_completed')

        after = self.snapshot()
        self.assertEqual(after['stages']['stitching_completed'], 'COMPLETED')
        self.assertEqual(after['reserved'], Decimal('0.000'))
        self.assertEqual(after['stock'], before['stock'] - Decimal('2.000'))
        self.assertEqual(after['activities'], before['activities'] + 1)


class DropMeasurementAndFabricStagesMigrationTests(StateMachineTestBase):
    """Migration 0054 against a boutique that still carries the two stages."""

    def _old_shape(self):
        from django.utils import timezone
        old = [
            {"key": "measurements_completed", "name": "Measurements", "sla_hours": 24, "roles": ["Owner", "Master"]},
            {"key": "fabric_confirmed", "name": "Fabric", "sla_hours": 24, "roles": ["Owner", "Master"]},
        ]
        settings = BoutiqueSettings.objects.get(id=1)
        settings.workflow_config = [settings.workflow_config[0], *old, *settings.workflow_config[1:]]
        settings.save(update_fields=['workflow_config'])

        order = self._order(order_id="T2B-SM-OLD")
        order.stages.filter(sequence__gte=1).update(sequence=models.F('sequence') + 2)
        OrderStage.objects.create(order=order, stage_key='measurements_completed', stage_name='Measurements',
                                  sequence=1, status='COMPLETED', completed_at=timezone.now())
        OrderStage.objects.create(order=order, stage_key='fabric_confirmed', stage_name='Fabric', sequence=2)
        from apps.production.models import ProductionTask
        ProductionTask.objects.create(order=order, title='Fabric', stage_key='fabric_confirmed', sequence=2)
        ProductionTask.objects.create(order=order, title='Cutting', stage_key='pattern_cutting', sequence=3)
        order.current_stage_key = 'measurements_completed'
        order.save(update_fields=['current_stage_key'])
        return order

    def test_the_stages_leave_the_workflow_and_every_order(self):
        from importlib import import_module
        from django.apps import apps
        order = self._old_shape()

        import_module('crm_api.migrations.0054_drop_measurement_and_fabric_stages').forwards(apps, None)

        keys = [s['key'] for s in BoutiqueSettings.objects.get(id=1).workflow_config]
        self.assertNotIn('measurements_completed', keys)
        self.assertNotIn('fabric_confirmed', keys)
        rows = list(order.stages.order_by('sequence').values_list('stage_key', 'sequence'))
        self.assertEqual([k for k, _ in rows], SEQUENCE)
        self.assertEqual([s for _, s in rows], list(range(len(SEQUENCE))))
        self.assertEqual(list(order.production_tasks.values_list('stage_key', flat=True)), ['pattern_cutting'])
        order.refresh_from_db()
        self.assertEqual(order.current_stage_key, 'created')


class CompleteAllStagesTests(OwnerDropdownLiveRegressionTests):
    """POST /orders/{id}/complete-all/: the one-person boutique's shortcut."""

    def url(self):
        return f'/api/orders/{self.order.id}/complete-all/'

    def test_the_owner_finishes_the_whole_journey(self):
        r = self.api.post(self.url())

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(
            set(self.order.stages.values_list('status', flat=True)), {'COMPLETED'})
        self.order.refresh_from_db()
        self.assertEqual(self.order.order_status, 'Delivered')
        self.assertEqual(self.order.production_status, 'COMPLETED')
        # The customer hears about the outcome once, not about every stage
        # passed through on the way to it.
        self.assertEqual(CustomerMessage.objects.filter(order=self.order).count(), 1)

    def test_staff_or_none_makes_no_difference(self):
        self.order.tailor = self.order.master = None
        self.order.save(update_fields=['tailor', 'master'])
        Tailor.objects.all().delete()
        r = self.api.post(self.url())
        self.assertEqual(r.status_code, 200, r.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.order_status, 'Delivered')

    def test_a_tailor_account_may_not_use_it(self):
        Tailor.objects.exclude(id=self.tailor.id).delete()
        from rest_framework.authtoken.models import Token
        token, _ = Token.objects.get_or_create(user=self.tailor_user)
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                             HTTP_X_TENANT_ID=self.tenant.schema_name)
        r = self.api.post(self.url())
        self.assertEqual(r.status_code, 403)
