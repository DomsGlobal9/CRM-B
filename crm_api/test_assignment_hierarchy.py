"""Owner > Designer > Master > workers, as every assignment surface sees it.

The rule lives once, in core.roles.can_assign. These tests hold it there and
then call each endpoint directly -- with no UI in the way -- because a hidden
dropdown is not a permission.
"""

from django.contrib.auth.models import User
from django.db import connection
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentJob, GarmentTemplate
from apps.catalog.services import sync_global_templates
from apps.design_studio.models import Designer, DesignAssignment
from core.roles import DESIGNER, MASTER, OWNER, assigns_work, can_assign
from crm_api.models import Order, Tailor
from crm_api.test_workflow import WorkflowTestBase


class AssignmentMatrixTests(SimpleTestCase):
    """The rule itself, with no database."""

    def test_owner_assigns_anyone(self):
        for assignee in (DESIGNER, MASTER, 'Tailor', 'Maggam Karigar', 'Karigar', OWNER):
            self.assertTrue(can_assign(OWNER, assignee), assignee)

    def test_designer_assigns_master_and_workers(self):
        for assignee in (MASTER, 'Tailor', 'Maggam Karigar', 'Karigar', 'QC Staff'):
            self.assertTrue(can_assign(DESIGNER, assignee), assignee)

    def test_designer_cannot_assign_owner(self):
        self.assertFalse(can_assign(DESIGNER, OWNER))

    def test_master_assigns_workers(self):
        for assignee in ('Tailor', 'Maggam Karigar', 'Karigar', 'Packaging Staff', 'QC Staff'):
            self.assertTrue(can_assign(MASTER, assignee), assignee)

    def test_master_cannot_assign_designer_or_owner(self):
        self.assertFalse(can_assign(MASTER, DESIGNER))
        self.assertFalse(can_assign(MASTER, OWNER))

    def test_workers_assign_nobody(self):
        for worker in ('Tailor', 'Maggam Karigar', 'Karigar', 'Maggam Master',
                       'Packaging Staff', 'QC Staff'):
            self.assertFalse(assigns_work(worker), worker)
            for assignee in (OWNER, DESIGNER, MASTER, 'Tailor'):
                self.assertFalse(can_assign(worker, assignee), (worker, assignee))

    def test_the_same_level_is_reachable(self):
        # Half the default stages are Master-only, and a design assignment's
        # assignee is always a Designer.
        self.assertTrue(can_assign(MASTER, MASTER))
        self.assertTrue(can_assign(DESIGNER, DESIGNER))

    def test_an_unknown_role_is_refused_either_way(self):
        self.assertFalse(can_assign(None, 'Tailor'))
        self.assertFalse(can_assign(OWNER, None))
        self.assertFalse(assigns_work(None))


class HierarchyTestBase(WorkflowTestBase):
    """WorkflowTestBase's owner, Master and Tailor, plus the roles it lacks."""

    def setUp(self):
        super().setUp()
        self.karigar_user = User.objects.create_user(
            username="karigar@workflow.test", email="karigar@workflow.test",
            password="karigarpass123")
        self.karigar = Tailor.objects.create(
            name="Lakshmi", specialty="Maggam", role="Maggam Karigar",
            status="Available", user=self.karigar_user)

        self.designer_user = User.objects.create_user(
            username="designer@workflow.test", email="designer@workflow.test",
            password="designerpass123")
        self.designer = Designer.objects.create(
            name="Meera", email="designer@workflow.test", user=self.designer_user)

        self.other_designer_user = User.objects.create_user(
            username="other@workflow.test", email="other@workflow.test",
            password="otherpass123")
        self.other_designer = Designer.objects.create(
            name="Kavya", email="other@workflow.test", user=self.other_designer_user)

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def designed_order(self, designer=None):
        """An order with a garment whose design work belongs to `designer`."""
        sync_global_templates()
        order = self.make_order(tailor=False, master=False)
        job = GarmentJob.objects.create(
            order=order, template=GarmentTemplate.objects.filter(key='lehenga').first(),
            sequence=0)
        DesignAssignment.objects.create(
            garment_job=job, designer=designer or self.designer)
        return order

    def assign_stage(self, order, staff, user, stage_key="stitching_in_progress"):
        return self.client_for(user).post(
            reverse("order-assign-stage", args=[order.id]),
            {"stage_key": stage_key, "tailor_id": staff.id}, format="json")


class StageAssignmentTests(HierarchyTestBase):

    def test_owner_assigns_master_and_workers(self):
        order = self.make_order()
        self.assertEqual(self.assign_stage(order, self.tailor, self.owner).status_code, 200)
        self.assertEqual(
            self.assign_stage(order, self.master, self.owner, "finishing").status_code, 200)

    def test_master_assigns_a_worker(self):
        order = self.make_order()
        res = self.assign_stage(order, self.tailor, self.master_user)
        self.assertEqual(res.status_code, 200, res.content)

    def test_master_can_still_assign_a_master_only_stage(self):
        order = self.make_order()
        res = self.assign_stage(order, self.master, self.master_user, "finishing")
        self.assertEqual(res.status_code, 200, res.content)

    def test_master_hands_on_their_own_stage(self):
        order = self.make_order()
        order.stages.filter(stage_key="stitching_in_progress").update(assigned_to=self.master)
        res = self.assign_stage(order, self.tailor, self.master_user)
        self.assertEqual(res.status_code, 200, res.content)

    def test_master_cannot_take_someone_elses_stage(self):
        order = self.make_order()
        order.stages.filter(stage_key="stitching_in_progress").update(assigned_to=self.karigar)
        res = self.assign_stage(order, self.tailor, self.master_user)
        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(
            order.stages.get(stage_key="stitching_in_progress").assigned_to_id, self.karigar.id)

    def test_designer_assigns_downward_on_work_they_designed(self):
        order = self.designed_order()
        self.assertEqual(
            self.assign_stage(order, self.tailor, self.designer_user).status_code, 200)
        self.assertEqual(
            self.assign_stage(order, self.master, self.designer_user, "finishing").status_code,
            200)

    def test_designer_to_maggam_karigar_passes_the_hierarchy(self):
        # A stitching-flow order has no Maggam stage, so the STAGE rule refuses
        # (400) -- not the hierarchy (403). That distinction is the point:
        # Designer -> Maggam Karigar is within reach; this stage just is not
        # Maggam work. The positive hand-off is covered by send-to-workshop.
        order = self.designed_order()
        res = self.assign_stage(order, self.karigar, self.designer_user)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('cannot be assigned to', res.json()['error'])

    def test_designer_assigns_on_an_order_someone_else_designed(self):
        order = self.designed_order(designer=self.other_designer)
        res = self.assign_stage(order, self.tailor, self.designer_user)
        self.assertEqual(res.status_code, 200, res.content)

    def test_designer_assigns_on_an_undesigned_order(self):
        order = self.make_order()
        res = self.assign_stage(order, self.tailor, self.designer_user)
        self.assertEqual(res.status_code, 200, res.content)

    def test_a_worker_cannot_assign(self):
        order = self.make_order()
        res = self.assign_stage(order, self.tailor, self.tailor_user)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(
            self.assign_stage(order, self.tailor, self.karigar_user).status_code, 403)

    def test_stage_role_restrictions_still_apply(self):
        # A Tailor may not hold a Master-only stage, whoever assigns it.
        order = self.make_order()
        res = self.assign_stage(order, self.tailor, self.owner, "finishing")
        self.assertEqual(res.status_code, 400)


class SendToWorkshopHierarchyTests(HierarchyTestBase):

    def send(self, order, user, **body):
        return self.client_for(user).post(
            reverse("order-send-to-workshop", args=[order.id]), body, format="json")

    def test_owner_sends_with_master_and_tailor(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, self.owner, master=self.master.id, tailor=self.tailor.id)
        self.assertEqual(res.status_code, 200, res.content)

    def test_designer_hands_their_designed_order_to_the_workshop(self):
        order = self.designed_order()
        res = self.send(order, self.designer_user, master=self.master.id,
                        tailor=self.karigar.id)
        self.assertEqual(res.status_code, 200, res.content)
        order.refresh_from_db()
        self.assertEqual(order.master_id, self.master.id)
        self.assertEqual(order.tailor_id, self.karigar.id)
        # Named, not started: opening the first stage stays with the Master.
        self.assertIsNone(res.json()['started_stage'])

    def test_master_sending_still_starts_the_workroom(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, self.master_user, tailor=self.tailor.id)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNotNone(res.json()['started_stage'])

    def test_designer_sends_an_order_someone_else_designed(self):
        order = self.designed_order(designer=self.other_designer)
        res = self.send(order, self.designer_user, master=self.master.id)
        self.assertEqual(res.status_code, 200, res.content)

    def test_master_still_sends_a_worker(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, self.master_user, tailor=self.tailor.id)
        self.assertEqual(res.status_code, 200, res.content)

    def test_a_worker_cannot_send(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, self.tailor_user, tailor=self.karigar.id)
        self.assertEqual(res.status_code, 403)


class AssignableStaffTests(HierarchyTestBase):

    def roster(self, user):
        res = self.client_for(user).get(reverse("order-assignable-staff"))
        return res

    def test_owner_sees_the_whole_floor(self):
        res = self.roster(self.owner)
        self.assertEqual(res.status_code, 200, res.content)
        roles = {row['role'] for row in res.json()}
        self.assertEqual(roles, {'Master', 'Tailor', 'Maggam Karigar'})

    def test_designer_sees_master_and_workers(self):
        roles = {row['role'] for row in self.roster(self.designer_user).json()}
        self.assertEqual(roles, {'Master', 'Tailor', 'Maggam Karigar'})

    def test_master_sees_no_designer(self):
        rows = self.roster(self.master_user).json()
        self.assertNotIn('Designer', {row['role'] for row in rows})
        self.assertIn('Tailor', {row['role'] for row in rows})

    def test_nothing_but_id_name_and_role_is_exposed(self):
        rows = self.roster(self.designer_user).json()
        for row in rows:
            self.assertEqual(set(row), {'id', 'name', 'role'})

    def test_a_worker_gets_no_roster(self):
        self.assertEqual(self.roster(self.tailor_user).status_code, 403)


class DesignerScopeTests(HierarchyTestBase):
    """A Designer ranks above the Master and reads the order book as one does."""

    def test_designer_lists_every_order(self):
        order = self.make_order()
        res = self.client_for(self.designer_user).get(reverse("order-list"))
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertIn(order.id, [o["id"] for o in rows])

    def test_designer_reads_an_order_they_did_not_design(self):
        order = self.make_order()
        res = self.client_for(self.designer_user).get(
            reverse("order-detail", args=[order.id]))
        self.assertEqual(res.status_code, 200, res.content)

    def test_designer_reads_customers_like_a_master(self):
        res = self.client_for(self.designer_user).get(reverse("customer-list"))
        self.assertEqual(res.status_code, 200, res.content)

    def test_the_stage_reply_carries_no_customer(self):
        order = self.designed_order()
        res = self.assign_stage(order, self.tailor, self.designer_user)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotIn('Meera Nair', res.content.decode())
        self.assertNotIn('9800000001', res.content.decode())


class AlterationAssignmentTests(HierarchyTestBase):
    """The service rule, which every alteration assign call goes through."""

    def test_master_assigns_a_worker(self):
        from domains.alterations import services
        with self.assertRaises(Exception) as caught:
            services.assign_alteration(999999, tailor_id=self.tailor.id, role=MASTER)
        self.assertNotIsInstance(caught.exception, PermissionError)

    def test_a_worker_is_refused_by_the_hierarchy(self):
        from domains.alterations import services
        with self.assertRaises(PermissionError):
            services.assign_alteration(999999, tailor_id=self.tailor.id, role='Tailor')


class TodoAssignmentTests(HierarchyTestBase):

    def people(self, user, role):
        from apps.todos.services import assignable_people
        return {p['role'] for p in assignable_people(user, role)
                if p['id'] != user.id}

    def test_master_cannot_be_offered_a_designer(self):
        self.assertNotIn(DESIGNER, self.people(self.master_user, MASTER))
        self.assertNotIn(OWNER, self.people(self.master_user, MASTER))

    def test_designer_is_offered_master_and_workers_not_owner(self):
        roles = self.people(self.designer_user, DESIGNER)
        self.assertIn(MASTER, roles)
        self.assertIn('Tailor', roles)
        self.assertNotIn(OWNER, roles)

    def test_owner_is_offered_designers(self):
        self.assertIn(DESIGNER, self.people(self.owner, OWNER))

    def test_a_worker_is_offered_only_themselves(self):
        self.assertEqual(self.people(self.tailor_user, 'Tailor'), set())

    def test_master_assigning_a_designer_is_refused_by_the_endpoint(self):
        res = self.client_for(self.master_user).post(
            reverse('todo-list'),
            {'title': 'Pick the border', 'assigned_to': self.designer_user.id},
            format='json')
        self.assertIn(res.status_code, (400, 403), res.content)
