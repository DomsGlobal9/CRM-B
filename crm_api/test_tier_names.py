"""A boutique's own names for the customer tiers: the owner renames them,
everyone reads them, customers keep the stored Silver / Gold / Platinum."""
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import BoutiqueSettings
from crm_api.test_workflow import WorkflowTestBase

URL = '/api/boutique-settings/tier-names/'


class TierNamesTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Tier Names Atelier"
        return tenant

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )
        return client

    def put(self, names, user=None):
        return self.client_for(user or self.owner).put(URL, {"tier_names": names}, format="json")

    def test_owner_renames_and_everyone_reads_them(self):
        res = self.put({"Silver": "  Regular ", "Gold": "VIP", "Platinum": "Royal"})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["tier_names"], {"Silver": "Regular", "Gold": "VIP", "Platinum": "Royal"})
        body = self.client_for(self.tailor_user).get('/api/boutique-settings/').json()
        self.assertEqual(body["tier_names"]["Gold"], "VIP")

    def test_blank_or_default_name_goes_back_to_the_tier(self):
        self.put({"Silver": "Regular", "Gold": "VIP", "Platinum": "Royal"})
        res = self.put({"Silver": "", "Gold": "Gold", "Platinum": "Royal"})
        self.assertEqual(res.json()["tier_names"], {"Platinum": "Royal"})

    def test_refuses_duplicates_unknown_tiers_and_long_names(self):
        self.assertEqual(self.put({"Silver": "VIP", "Gold": "vip"}).status_code, 400)
        self.assertEqual(self.put({"Silver": "Gold"}).status_code, 400)
        self.assertEqual(self.put({"Diamond": "X"}).status_code, 400)
        self.assertEqual(self.put({"Gold": "x" * 31}).status_code, 400)
        self.assertEqual(self.put("VIP").status_code, 400)
        self.assertEqual(BoutiqueSettings.objects.get_or_create(id=1)[0].tier_names, {})

    def test_only_the_owner_can_rename(self):
        res = self.put({"Gold": "VIP"}, user=self.tailor_user)
        self.assertEqual(res.status_code, 403)
