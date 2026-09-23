"""What the API does with input nobody would type on purpose.

Found by firing malformed bodies, wrong types and impossible dates at every
write endpoint. Each of these was a 500 or a silent wrong write before.
"""
import datetime

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from crm_api.models import Order
from crm_api.test_workflow import WorkflowTestBase


class HostileBodyTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Hostile Atelier"
        return tenant

    def api(self, user=None):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=user or self.owner)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def test_a_body_that_is_not_an_object_is_refused_not_crashed(self):
        """Every view reads request.data.get(...), which is an AttributeError
        for a list, a string, a number or null -- 500s from one typo."""
        order = self.make_order()
        client = self.api()
        for raw in ('[]', 'null', '"a string"', '123', '[{"stage_key": "created"}]'):
            for path in (reverse('order-transition-stage', args=[order.id]),
                         reverse('order-send-to-workshop', args=[order.id]),
                         reverse('order-set-flow', args=[order.id])):
                res = client.post(path, raw, content_type='application/json')
                self.assertEqual(res.status_code, 400, f'{raw} at {path} -> {res.status_code}')
                self.assertIn('JSON object', str(res.data))

    def test_an_object_body_still_works(self):
        order = self.make_order()
        res = self.api().post(reverse('order-transition-stage', args=[order.id]),
                              {'stage_key': 'created', 'status': 'COMPLETED'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)


class BooleanIsNotAnIdTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Id Atelier"
        return tenant

    def api(self):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=self.owner)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def test_true_does_not_mean_staff_member_one(self):
        """int(True) is 1, so {"tailor": true} used to assign whoever happens
        to be first on the roster -- a real write from a value naming nobody."""
        order = self.make_order(tailor=False, master=False)

        res = self.api().post(reverse('order-send-to-workshop', args=[order.id]),
                              {'tailor': True, 'master': True}, format='json')

        self.assertEqual(res.status_code, 200, res.data)
        order.refresh_from_db()
        self.assertIsNone(order.tailor_id)
        self.assertIsNone(order.master_id)

    def test_to_id_reads_only_actual_ids(self):
        from core.validators import to_id
        self.assertIsNone(to_id(True))
        self.assertIsNone(to_id(False))
        self.assertIsNone(to_id(None))
        self.assertIsNone(to_id(''))
        self.assertIsNone(to_id('abc'))
        self.assertIsNone(to_id({'a': 1}))
        self.assertEqual(to_id('7'), 7)
        self.assertEqual(to_id(7), 7)


class PromisedDateTests(WorkflowTestBase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@workflow.test"
        tenant.name = "Date Atelier"
        return tenant

    def api(self):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION="Token " + Token.objects.get_or_create(user=self.owner)[0].key,
            HTTP_X_TENANT_ID=self.tenant.schema_name)
        return client

    def patch(self, order, value):
        return self.api().patch(reverse('order-detail', args=[order.id]),
                                {'estimated_delivery': value}, format='json')

    def test_a_promise_cannot_be_in_the_past(self):
        order = self.make_order()
        res = self.patch(order, '1900-01-01')
        self.assertEqual(res.status_code, 400)
        self.assertIn('past', str(res.data))

    def test_a_promise_cannot_be_centuries_out(self):
        order = self.make_order()
        res = self.patch(order, '9999-12-31')
        self.assertEqual(res.status_code, 400)
        self.assertIn('typo', str(res.data))

    def test_a_real_date_is_kept(self):
        order = self.make_order()
        soon = datetime.date.today() + datetime.timedelta(days=30)
        res = self.patch(order, soon.isoformat())
        self.assertEqual(res.status_code, 200, res.data)
        order.refresh_from_db()
        self.assertEqual(order.estimated_delivery, soon)

    def test_an_order_already_late_can_still_be_edited(self):
        """The rule judges a CHANGE. Judging every save would refuse an edit
        to a late order, which is when you most need to edit it."""
        order = self.make_order()
        Order.objects.filter(pk=order.pk).update(
            estimated_delivery=datetime.date.today() - datetime.timedelta(days=10))
        order.refresh_from_db()

        res = self.api().patch(reverse('order-detail', args=[order.id]),
                               {'special_instructions': 'ring the bell twice',
                                'estimated_delivery': order.estimated_delivery.isoformat()},
                               format='json')

        self.assertEqual(res.status_code, 200, res.data)
