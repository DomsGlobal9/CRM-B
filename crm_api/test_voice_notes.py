"""Up to ten voice notes on an order's instructions: recording another adds
it, it never replaces the ones already there."""
from unittest import mock

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.validators import MAX_VOICE_NOTES
from crm_api.test_workflow import WorkflowTestBase


CLIP = 'https://media.example.com/voice_notes/{}.webm'


class OrderVoiceNotesTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Voice Note Atelier"
        return tenant

    def client_for(self, user):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name,
        )
        return client

    def patch(self, order, body):
        with mock.patch('domains.orders.notifications.notify_voice_note'):
            return self.client_for(self.owner).patch(
                reverse("order-detail", args=[order.id]), body, format="json")

    def test_a_second_note_is_added_beside_the_first(self):
        order = self.make_order()
        first = self.patch(order, {"instructions_voice_notes": [{"url": CLIP.format(1)}]})
        self.assertEqual(first.status_code, 200, first.content)
        stamped = first.json()["instructions_voice_notes"][0]

        res = self.patch(order, {"instructions_voice_notes": [{"url": CLIP.format(1)}, {"url": CLIP.format(2)}]})
        self.assertEqual(res.status_code, 200, res.content)
        notes = res.json()["instructions_voice_notes"]
        self.assertEqual([n["url"] for n in notes], [CLIP.format(1), CLIP.format(2)])
        # The first keeps who left it and when; the single fields stay the first.
        self.assertEqual(notes[0], stamped)
        self.assertTrue(notes[1]["by"])
        self.assertEqual(res.json()["instructions_voice_note"], CLIP.format(1))

    def test_deleting_one_keeps_the_rest(self):
        order = self.make_order()
        self.patch(order, {"instructions_voice_notes": [{"url": CLIP.format(i)} for i in range(3)]})
        res = self.patch(order, {"instructions_voice_notes": [{"url": CLIP.format(0)}, {"url": CLIP.format(2)}]})
        self.assertEqual([n["url"] for n in res.json()["instructions_voice_notes"]], [CLIP.format(0), CLIP.format(2)])
        res = self.patch(order, {"instructions_voice_notes": []})
        self.assertEqual(res.json()["instructions_voice_notes"], [])
        self.assertEqual(res.json()["instructions_voice_note"], "")

    def test_no_more_than_ten(self):
        order = self.make_order()
        res = self.patch(order, {"instructions_voice_notes": [
            {"url": CLIP.format(i)} for i in range(MAX_VOICE_NOTES + 1)]})
        self.assertEqual(res.status_code, 400, res.content)
        res = self.patch(order, {"instructions_voice_notes": [{"url": "javascript:alert(1)"}]})
        self.assertEqual(res.status_code, 400, res.content)

    def test_the_one_clip_field_still_works(self):
        order = self.make_order()
        res = self.patch(order, {"instructions_voice_note": CLIP.format(9)})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([n["url"] for n in res.json()["instructions_voice_notes"]], [CLIP.format(9)])
