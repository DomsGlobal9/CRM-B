"""POST /api/orders/<id>/send-to-workshop/: the owner's one button after an
order is taken -- name the master and tailor, start the workroom."""
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.test_workflow import WorkflowTestBase


class SendToWorkshopTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Workshop Atelier"
        return tenant

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )
        return client

    def send(self, order, user=None, **body):
        return self.client_for(user or self.owner).post(
            reverse("order-send-to-workshop", args=[order.id]), body, format="json")

    def test_owner_sends_a_fresh_order(self):
        order = self.make_order(tailor=False, master=False)
        self.assertEqual(self.stage(order, "pattern_cutting").status, "NOT_STARTED")

        res = self.send(order, master=self.master.id, tailor=self.tailor.id)

        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["master"], self.master.id)
        self.assertEqual(body["tailor"], self.tailor.id)
        self.assertEqual(body["started_stage"], "pattern_cutting")
        self.assertEqual(body["production_status"], "IN_PROGRESS")
        self.assertEqual(self.stage(order, "created").status, "COMPLETED")
        self.assertEqual(self.stage(order, "pattern_cutting").status, "IN_PROGRESS")
        self.assertNotEqual(body["order_status"], "Received")
        # The hand-out and the heads-up that PATCH /orders/ gives.
        from apps.production.models import ProductionTask
        from crm_api.models import Notification
        self.assertEqual(self.stage(order, "pattern_cutting").assigned_to_id, self.master.id)
        self.assertEqual(ProductionTask.objects.get(order=order, stage_key="stitching_in_progress").assigned_to_id, self.tailor.id)
        self.assertEqual(ProductionTask.objects.get(order=order, stage_key="pattern_cutting").assigned_to_id, self.master.id)
        self.assertTrue(Notification.objects.filter(title=f"New Stitching Task: {order.reference}").exists())
        self.assertTrue(Notification.objects.filter(title=f"New Assignment: {order.reference}").exists())

    def test_a_master_cannot_be_the_stitching_tailor(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, tailor=self.master.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot be the stitching tailor", res.json()["error"])
        order.refresh_from_db()
        self.assertIsNone(order.tailor)
        self.assertEqual(self.stage(order, "pattern_cutting").status, "NOT_STARTED")

    def test_second_send_only_updates_assignments(self):
        order = self.make_order(tailor=False, master=False)
        self.assertEqual(self.send(order, tailor=self.tailor.id).status_code, 200)
        res = self.send(order, master=self.master.id)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNone(res.json()["started_stage"])
        self.assertEqual(res.json()["master"], self.master.id)
        self.assertEqual(res.json()["tailor"], self.tailor.id)
        self.assertEqual(self.stage(order, "pattern_cutting").status, "IN_PROGRESS")

    def test_a_tailor_may_not_send(self):
        order = self.make_order()
        res = self.send(order, user=self.tailor_user, master=self.master.id)
        self.assertEqual(res.status_code, 403)

    def test_master_may_send(self):
        order = self.make_order(tailor=False, master=False)
        res = self.send(order, user=self.master_user, tailor=self.tailor.id)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["started_stage"], "pattern_cutting")
