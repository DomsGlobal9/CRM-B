"""The trend reads each source once and must still say what the report says.

trend() used to call the per-period functions once per bucket -- four queries a
day for a month view. It now reads each source once for the whole window and
adds the days up itself. These tests hold it to the per-bucket functions on the
same data, and hold its query count still as the window grows.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.finance import services
from apps.finance.models import Expense, Payment
from apps.finance.test_analytics import FinanceTestCase
from apps.inventory.models import InventoryItem, PurchaseOrder, PurchaseOrderLine, Supplier
from apps.payroll.models import PayrollPeriod, PayrollRecord, Payout
from crm_api.models import Order, Tailor


class TrendMatchesTheReportTests(FinanceTestCase):

    def setUp(self):
        super().setUp()
        self.month_start = self.today.replace(day=1)
        days = [self.month_start + timedelta(days=n) for n in (0, 1, 1, 4)]
        days = [d for d in days if d <= self.today] or [self.today]

        order = self.an_order(total='90000.00', reference='T-TREND')
        cancelled = self.an_order(total='5000.00', status='Cancelled', reference='T-CXL')
        internal = self.an_order(total='0.00', reference='T-INT')
        internal.kind = Order.KIND_INTERNAL
        internal.save(update_fields=['kind'])
        for n, day in enumerate(days):
            self.a_payment(order, f'{1000 + n}.33', day)
            self.a_payment(order, '250.10', day, source=Payment.Source.BACKFILL)
            self.a_payment(cancelled, '99.00', day)
            self.a_payment(internal, '77.00', day)
            # Two rows in one category on one day, so rounding per category shows.
            Expense.objects.create(category='RENT', amount=Decimal('100.005'), incurred_on=day)
            Expense.objects.create(category='RENT', amount=Decimal('0.005'), incurred_on=day)
            Expense.objects.create(category='UTILITIES', amount=Decimal('40.00'), incurred_on=day)

        tailor = Tailor.objects.create(name='Anita', specialty='Stitching', role='Tailor')
        for n, day in enumerate(days):
            period = PayrollPeriod.objects.create(
                period_start=date(2020, 1, 6) + timedelta(days=7 * n),
                period_end=date(2020, 1, 12) + timedelta(days=7 * n))
            record = PayrollRecord.objects.create(
                period=period, staff=tailor, staff_name_snapshot='Anita',
                worked_minutes=0, regular_minutes=0)
            # Late evening local time: the UTC date is a different day in
            # zones east of UTC, so this pins which day a payout lands on.
            paid_at = timezone.make_aware(datetime.combine(day, time(23, 30)))
            Payout.objects.create(payroll_record=record, staff=tailor,
                                  staff_name_snapshot='Anita', amount=Decimal('500.00'),
                                  method='CASH', paid_at=paid_at)

        supplier = Supplier.objects.create(name='Rajesh Textiles')
        item = InventoryItem.objects.create(item_code='FAB-T', name='Silk', category='FABRIC',
                                            unit='METER', purchase_price=Decimal('100'))
        for n, day in enumerate(days):
            po = PurchaseOrder.objects.create(po_number=f'PO-T{n}', supplier=supplier,
                                              status='ORDERED', tax_amount=Decimal('18.00'))
            PurchaseOrder.objects.filter(pk=po.pk).update(order_date=day)
            PurchaseOrderLine.objects.create(purchase_order=po, item=item,
                                             quantity_ordered=Decimal('2'),
                                             unit_cost=Decimal('150.00'))

    def per_bucket(self, start, end):
        """What trend() used to compute for one bucket, call by call."""
        revenue = services.revenue_for(start, end)['total']
        costs = (services.salaries_for(start, end) + services.inventory_for(start, end)
                 + services.manual_costs_for(start, end)[1])
        return {'since': start.isoformat(), 'until': end.isoformat(),
                'revenue': revenue, 'costs': costs, 'profit': revenue - costs}

    def assert_matches(self, **window):
        result = services.trend(**window)
        expected = [self.per_bucket(date.fromisoformat(b['since']), date.fromisoformat(b['until']))
                    for b in result['series']]
        self.assertTrue(result['series'])
        self.assertEqual(result['series'], expected)
        return result

    def test_a_month_of_days(self):
        result = self.assert_matches(period='month')
        self.assertTrue(any(b['revenue'] for b in result['series']))
        self.assertTrue(any(b['costs'] for b in result['series']))

    def test_a_year_of_months(self):
        self.assert_matches(period='year')

    def test_a_custom_window(self):
        self.assert_matches(since=self.month_start - timedelta(days=40), until=self.today)

    def test_the_query_count_does_not_grow_with_the_window(self):
        def queries(**window):
            with CaptureQueriesContext(connection) as ctx:
                services.trend(**window)
            return len(ctx.captured_queries)
        # Windows holding the same rows: a month of days, a year of months and
        # a 200-day custom window (trend stops at 12 monthly buckets, so a
        # longer one would end before this month). A window with no purchase
        # orders asks one query fewer -- the lines prefetch -- so 'day' is not
        # comparable.
        month = queries(period='month')
        self.assertEqual(queries(period='year'), month)
        self.assertEqual(queries(since=self.today - timedelta(days=200), until=self.today), month)
