"""TEMPORARY measurement, not a real test: counts the statements behind one
draft confirm. Delete after reading the numbers."""
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from crm_api.test_order_drafts import AtomicConfirmOverHttpTests


@override_settings(CUSTOMER_MESSAGE_BACKEND='domains.orders.messaging.log_backend')
class TmpConfirmPerf(AtomicConfirmOverHttpTests):

    def test_measure_one_garment(self):
        draft_id = self.a_draft()
        with self.captureOnCommitCallbacks(execute=False):
            with CaptureQueriesContext(connection) as ctx:
                response = self.api.post(reverse('order-draft-confirm', args=[draft_id]))
        self.assertEqual(response.status_code, 201, response.data)
        sqls = [q['sql'] for q in ctx.captured_queries]
        sets = sum(1 for s in sqls if s.startswith('SET search_path'))
        saves = sum(1 for s in sqls if 'SAVEPOINT' in s)
        print(f"\n[PERF] {len(sqls)} statements = {len(sqls) - sets} queries "
              f"+ {sets} SET search_path; {saves} savepoint statements")
