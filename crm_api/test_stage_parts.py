"""A step split between several people (domains/orders/stage_parts.py): a rush
blouse's Stitching, Front to one tailor and Back to another, worked at once."""
import datetime

from django.contrib.auth.models import User
from django.urls import reverse

from apps.staff.performance import productivity_metrics
from crm_api.models import Notification, OrderStage, StagePart, Tailor
from crm_api.test_assignment_hierarchy import HierarchyTestBase
from domains.orders import stage_parts
from domains.orders.services import OrderService

STEP = 'stitching_in_progress'


class StagePartTestBase(HierarchyTestBase):

    def setUp(self):
        super().setUp()
        self.second_user = User.objects.create_user(
            username="ravi@workflow.test", email="ravi@workflow.test", password="ravipass123")
        self.second = Tailor.objects.create(
            name="Ravi", specialty="Blouse", role="Tailor", status="Available", user=self.second_user)

    def stitching(self, order):
        return OrderStage.objects.get(order=order, stage_key=STEP)

    def ready_order(self):
        order = self.make_order()
        self.reach(order, STEP)
        return order

    def api_split(self, order, user, parts, stage_key=STEP):
        return self.client_for(user).post(
            reverse('order-split-stage', args=[order.id]),
            {'stage_key': stage_key, 'parts': parts}, format='json')

    def two_way(self, order):
        return self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.second.id},
        ])

    def part(self, order, label):
        return StagePart.objects.get(stage__order=order, label=label)

    def move(self, order, label, status, user, **kw):
        return self.client_for(user).post(
            reverse('order-part-transition', args=[order.id]),
            {'part_id': self.part(order, label).id, 'status': status, **kw}, format='multipart')


class SplittingTests(StagePartTestBase):

    def test_the_owner_splits_a_step_between_two_tailors(self):
        order = self.ready_order()
        res = self.two_way(order)
        self.assertEqual(res.status_code, 200, res.content)
        parts = list(self.stitching(order).parts.all())
        self.assertEqual([(p.label, p.assigned_to_id, p.status) for p in parts],
                         [('Front', self.tailor.id, 'NOT_STARTED'), ('Back', self.second.id, 'NOT_STARTED')])
        self.assertEqual(Notification.objects.filter(title__startswith='New assignment').count(), 2)
        stitching = next(s for s in res.json()['stages'] if s['stage_key'] == STEP)
        self.assertEqual([p['label'] for p in stitching['parts']], ['Front', 'Back'])

    def test_one_person_may_hold_two_parts(self):
        order = self.ready_order()
        res = self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'Sleeve', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.second.id},
        ])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.stitching(order).parts.filter(assigned_to=self.tailor).count(), 2)

    def test_a_part_holder_sees_the_order(self):
        order = self.ready_order()
        self.two_way(order)
        res = self.client_for(self.second_user).get(reverse('order-list'))
        rows = res.json()['results'] if isinstance(res.json(), dict) else res.json()
        self.assertIn(order.id, [r['id'] for r in rows])

    def test_parts_never_go_to_a_master(self):
        order = self.ready_order()
        res = self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.master.id},
        ])
        self.assertEqual(res.status_code, 400, res.content)
        self.assertFalse(StagePart.objects.exists())

    def test_only_working_steps_split(self):
        order = self.make_order()
        res = self.api_split(order, self.owner, [
            {'label': 'One', 'tailor_id': self.tailor.id},
            {'label': 'Two', 'tailor_id': self.second.id},
        ], stage_key='trial_scheduled')
        self.assertEqual(res.status_code, 400, res.content)

    def test_a_split_needs_two_named_different_parts(self):
        order = self.ready_order()
        self.assertEqual(self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id}]).status_code, 400)
        self.assertEqual(self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'front', 'tailor_id': self.second.id}]).status_code, 400)
        self.assertEqual(self.api_split(order, self.owner, [
            {'label': '', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.second.id}]).status_code, 400)

    def test_a_worker_cannot_split(self):
        order = self.ready_order()
        res = self.api_split(order, self.tailor_user, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.second.id}])
        self.assertEqual(res.status_code, 403)

    def test_the_split_undoes_until_a_part_starts(self):
        order = self.ready_order()
        self.two_way(order)
        self.move(order, 'Front', 'IN_PROGRESS', self.tailor_user)
        res = self.client_for(self.owner).post(
            reverse('order-unsplit-stage', args=[order.id]), {'stage_key': STEP}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.stitching(order).parts.count(), 2)

        fresh = self.make_order(customer=self.make_customer('9800000077'))
        self.reach(fresh, STEP)
        self.two_way(fresh)
        res = self.client_for(self.owner).post(
            reverse('order-unsplit-stage', args=[fresh.id]), {'stage_key': STEP}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(self.stitching(fresh).parts.exists())

    def test_a_part_changes_hands(self):
        order = self.ready_order()
        self.two_way(order)
        res = self.client_for(self.owner).post(
            reverse('order-assign-part', args=[order.id]),
            {'part_id': self.part(order, 'Back').id, 'tailor_id': self.tailor.id}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.part(order, 'Back').assigned_to_id, self.tailor.id)


class WorkingTheParts(StagePartTestBase):

    def test_both_work_at_once_and_the_step_waits_for_the_last_part(self):
        order = self.ready_order()
        self.two_way(order)

        self.assertEqual(self.move(order, 'Front', 'IN_PROGRESS', self.tailor_user).status_code, 200)
        self.assertEqual(self.stitching(order).status, 'IN_PROGRESS')
        self.assertEqual(self.move(order, 'Back', 'IN_PROGRESS', self.second_user).status_code, 200)

        # A photo first, as for any work sent for checking.
        self.assertEqual(self.move(order, 'Front', 'PENDING_VERIFICATION', self.tailor_user).status_code, 400)
        res = self.move(order, 'Front', 'PENDING_VERIFICATION', self.tailor_user, images=[self.work_photo()])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.part(order, 'Front').status, 'PENDING_VERIFICATION')
        self.assertTrue(self.part(order, 'Front').attachments)
        self.assertEqual(self.stitching(order).status, 'IN_PROGRESS')

        self.move(order, 'Back', 'PENDING_VERIFICATION', self.second_user, images=[self.work_photo()])
        self.assertEqual(self.stitching(order).status, 'PENDING_VERIFICATION')

    def test_approving_the_step_completes_every_part(self):
        order = self.ready_order()
        self.two_way(order)
        for label, user in (('Front', self.tailor_user), ('Back', self.second_user)):
            self.move(order, label, 'IN_PROGRESS', user)
            self.move(order, label, 'PENDING_VERIFICATION', user, images=[self.work_photo()])
        OrderService.transition_order_stage(order, STEP, 'COMPLETED', user=self.master_user)
        self.assertEqual(self.stitching(order).status, 'COMPLETED')
        self.assertEqual(set(self.stitching(order).parts.values_list('status', flat=True)), {'COMPLETED'})

    def test_one_part_sent_back_leaves_the_other_waiting(self):
        order = self.ready_order()
        self.two_way(order)
        for label, user in (('Front', self.tailor_user), ('Back', self.second_user)):
            self.move(order, label, 'IN_PROGRESS', user)
            self.move(order, label, 'PENDING_VERIFICATION', user, images=[self.work_photo()])

        self.assertEqual(self.move(order, 'Back', 'IN_PROGRESS', self.owner).status_code, 400)  # no note
        res = self.move(order, 'Back', 'IN_PROGRESS', self.owner, comments='Back neck is uneven')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.part(order, 'Back').status, 'IN_PROGRESS')
        self.assertEqual(self.part(order, 'Back').verification_note, 'Back neck is uneven')
        self.assertEqual(self.part(order, 'Front').status, 'PENDING_VERIFICATION')
        self.assertEqual(self.stitching(order).status, 'IN_PROGRESS')

        # Sent again: the step goes back for checking.
        self.move(order, 'Back', 'PENDING_VERIFICATION', self.second_user, images=[self.work_photo()])
        self.assertEqual(self.stitching(order).status, 'PENDING_VERIFICATION')

    def test_sending_the_whole_step_back_returns_every_waiting_part(self):
        order = self.ready_order()
        self.two_way(order)
        for label, user in (('Front', self.tailor_user), ('Back', self.second_user)):
            self.move(order, label, 'IN_PROGRESS', user)
            self.move(order, label, 'PENDING_VERIFICATION', user, images=[self.work_photo()])
        OrderService.transition_order_stage(order, STEP, 'IN_PROGRESS', user=self.master_user,
                                            comments='Redo the finishing')
        self.assertEqual(set(self.stitching(order).parts.values_list('status', flat=True)), {'IN_PROGRESS'})

    def test_nobody_moves_someone_elses_part(self):
        order = self.ready_order()
        self.two_way(order)
        self.assertEqual(self.move(order, 'Back', 'IN_PROGRESS', self.tailor_user).status_code, 403)

    def test_a_worker_cannot_move_a_split_step_as_a_whole(self):
        order = self.ready_order()
        self.two_way(order)
        with self.assertRaisesMessage(ValueError, 'split into parts'):
            OrderService.transition_order_stage(order, STEP, 'IN_PROGRESS', user=self.tailor_user)

    def test_a_step_not_split_works_as_before(self):
        order = self.ready_order()
        self.step(order, STEP, user=self.tailor_user)
        self.assertEqual(self.stitching(order).status, 'COMPLETED')
        self.assertFalse(StagePart.objects.exists())


class PartCreditTests(StagePartTestBase):

    def test_parts_share_the_garment(self):
        order = self.ready_order()
        self.api_split(order, self.owner, [
            {'label': 'Front', 'tailor_id': self.tailor.id},
            {'label': 'Sleeve', 'tailor_id': self.tailor.id},
            {'label': 'Back', 'tailor_id': self.second.id},
        ])
        for label, user in (('Front', self.tailor_user), ('Sleeve', self.tailor_user), ('Back', self.second_user)):
            self.move(order, label, 'IN_PROGRESS', user)
            self.move(order, label, 'PENDING_VERIFICATION', user, images=[self.work_photo()])
        OrderService.transition_order_stage(order, STEP, 'COMPLETED', user=self.master_user)

        today = datetime.date.today()
        span = (today - datetime.timedelta(days=1), today + datetime.timedelta(days=1))
        self.assertEqual(productivity_metrics(self.second, *span)['garments']['value'], 0.33)
        self.assertEqual(productivity_metrics(self.tailor, *span)['garments']['value'], 0.67)

    def test_the_split_helpers_know_a_working_step(self):
        order = self.ready_order()
        self.assertEqual(stage_parts.part_roles(order, self.stitching(order)), ['Tailor'])
