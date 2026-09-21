"""An alteration is an order on the short path: taken in, worked, checked,
paid for, handed back -- numbered under the order the garment came from."""
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import Order
from crm_api.test_workflow import WorkflowTestBase
from domains.orders import workflow


class AlterationOrderTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Alteration Atelier"
        return tenant

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )
        return client

    def delivered_order(self):
        order = self.make_order()
        order.order_status = "Delivered"
        order.save(update_fields=["order_status"])
        return order

    def test_alteration_path_is_the_short_list(self):
        from crm_api.models import BoutiqueSettings
        config = BoutiqueSettings.objects.get_or_create(id=1)[0].workflow_config
        keys = [s["key"] for s in workflow.stages_for_flow(config, "alteration")]
        self.assertEqual(keys, list(workflow.ALTERATION_STAGES))
        # And the stitching path never picks the alteration step up.
        self.assertNotIn("alteration_work", [s["key"] for s in workflow.stages_for_flow(config, "stitching")])

    def test_owner_takes_a_garment_back_in(self):
        parent = self.delivered_order()
        res = self.client_for(self.owner).post(
            reverse("order-create-alteration", args=[parent.id]),
            {"issue": "Sleeves too tight", "charge": "300", "paid_now": "100"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["flow"], "alteration")
        self.assertEqual(body["order_reference"], f"{parent.reference}-A1")
        self.assertEqual(body["alteration_of"], parent.id)
        self.assertEqual([s["stage_key"] for s in body["stages"]], list(workflow.ALTERATION_STAGES))
        self.assertEqual(body["payment_status"], "Partially Paid")
        self.assertEqual(float(body["tailoring_charges"]), 300.0)  # total adds the boutique tax
        self.assertEqual(body["special_instructions"], "Sleeves too tight")
        # The parent lists it.
        parent_body = self.client_for(self.owner).get(reverse("order-detail", args=[parent.id])).json()
        self.assertEqual([a["order_reference"] for a in parent_body["alterations"]], [f"{parent.reference}-A1"])

        # A second one counts up.
        res2 = self.client_for(self.owner).post(
            reverse("order-create-alteration", args=[parent.id]), {"issue": "Hem"}, format="json")
        self.assertEqual(res2.json()["order_reference"], f"{parent.reference}-A2")

    def test_free_alteration_skips_payment(self):
        parent = self.delivered_order()
        res = self.client_for(self.owner).post(
            reverse("order-create-alteration", args=[parent.id]), {"issue": "Our stitching came loose"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        by_key = {s["stage_key"]: s["status"] for s in res.json()["stages"]}
        self.assertEqual(by_key["payment"], "SKIPPED")

    def test_only_a_delivered_order_can_have_one(self):
        parent = self.make_order()
        res = self.client_for(self.owner).post(
            reverse("order-create-alteration", args=[parent.id]), {"issue": "Hem"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("delivered", res.json()["error"])

    def test_a_tailor_may_not_take_one_in(self):
        parent = self.delivered_order()
        res = self.client_for(self.tailor_user).post(
            reverse("order-create-alteration", args=[parent.id]), {"issue": "Hem"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_outside_garment_gets_its_own_number(self):
        customer = self.make_customer()
        res = self.client_for(self.owner).post(
            reverse("order-outside-alteration"),
            {"customer": customer.id, "garment_name": "Kurta", "issue": "Shorten by 2 inches", "charge": "150", "paid_now": "150"},
            format="json")
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertIsNone(body["alteration_of"])
        self.assertEqual(body["garment_label"], "Kurta")
        self.assertEqual(body["payment_status"], "Paid")
        self.assertTrue(body["order_reference"].startswith("#"))

    def test_alteration_walks_the_workroom(self):
        parent = self.delivered_order()
        alt_id = self.client_for(self.owner).post(
            reverse("order-create-alteration", args=[parent.id]), {"issue": "Hem"}, format="json").json()["id"]
        # Send to workshop starts Alteration work for the tailor.
        res = self.client_for(self.owner).post(
            reverse("order-send-to-workshop", args=[alt_id]), {"tailor": self.tailor.id, "master": self.master.id}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["started_stage"], "alteration_work")
        alt = Order.objects.get(pk=alt_id)
        self.assertEqual(alt.stages.get(stage_key="alteration_work").assigned_to_id, self.tailor.id)
