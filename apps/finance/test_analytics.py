"""Finance as the source of truth: revenue by the date money arrived.

The property every test here defends: a figure for a period depends on WHEN
the money moved, never on when the order was written. That is the whole
reason finance.Payment exists, and the old snapshot could not express it.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.finance import payments, services
from apps.finance.models import Expense, Payment
from crm_api.models import Customer, Order


class FinanceTestCase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@analytics.test'
        tenant.name = 'Analytics Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@analytics.test', email='owner@analytics.test', password='pw12345678')
        self.api = APIClient()
        self.api.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}',
            HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.customer = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number='919845012345')
        self.today = timezone.localdate()

    def an_order(self, total='10000.00', paid='0.00', status='Received', reference='T1'):
        return Order.objects.create(
            order_id=reference, customer=self.customer, total_amount=Decimal(total),
            amount_paid=Decimal(paid), advance_paid=Decimal(paid), order_status=status)

    def a_payment(self, order, amount, on, source=Payment.Source.RECORDED):
        return Payment.objects.create(order=order, amount=Decimal(amount),
                                      received_on=on, source=source)

    def get(self, path, **params):
        response = self.api.get(path, params)
        connection.set_tenant(self.tenant)
        return response


class RevenueTests(FinanceTestCase):

    def test_revenue_follows_the_payment_date_not_the_order_date(self):
        """The defect this table was built for: an old order settled today."""
        order = self.an_order(total='20000.00')
        order.order_date = timezone.now() - timedelta(days=200)
        order.save(update_fields=['order_date'])
        self.a_payment(order, '20000.00', self.today)

        this_month = services.revenue_for(self.today.replace(day=1), self.today)
        long_ago = services.revenue_for(self.today - timedelta(days=210),
                                        self.today - timedelta(days=190))

        self.assertEqual(this_month['total'], Decimal('20000.00'))
        self.assertEqual(long_ago['total'], Decimal('0.00'))

    def test_instalments_land_in_their_own_periods(self):
        order = self.an_order(total='30000.00')
        self.a_payment(order, '10000.00', self.today - timedelta(days=40))
        self.a_payment(order, '20000.00', self.today)

        self.assertEqual(services.revenue_for(self.today, self.today)['total'],
                         Decimal('20000.00'))
        self.assertEqual(
            services.revenue_for(self.today - timedelta(days=60), self.today)['total'],
            Decimal('30000.00'))

    def test_a_cancelled_order_contributes_no_revenue(self):
        order = self.an_order(total='5000.00', status='Cancelled', reference='T-CANCEL')
        self.a_payment(order, '5000.00', self.today)

        self.assertEqual(services.revenue_for(self.today, self.today)['total'],
                         Decimal('0.00'))

    def test_backfilled_money_is_counted_but_reported_separately(self):
        order = self.an_order(total='8000.00')
        self.a_payment(order, '3000.00', self.today, source=Payment.Source.BACKFILL)
        self.a_payment(order, '5000.00', self.today)

        revenue = services.revenue_for(self.today, self.today)

        self.assertEqual(revenue['total'], Decimal('8000.00'))
        self.assertEqual(revenue['dated'], Decimal('5000.00'))
        self.assertEqual(revenue['estimated'], Decimal('3000.00'))

    def test_an_empty_period_is_zero_not_an_error(self):
        revenue = services.revenue_for(self.today - timedelta(days=5),
                                       self.today - timedelta(days=4))
        self.assertEqual(revenue['total'], Decimal('0.00'))


class BoundaryTests(FinanceTestCase):

    def test_both_ends_of_the_window_are_included(self):
        order = self.an_order(total='9000.00')
        self.a_payment(order, '1000.00', date(2026, 9, 1))
        self.a_payment(order, '2000.00', date(2026, 9, 30))
        self.a_payment(order, '4000.00', date(2026, 8, 31))
        self.a_payment(order, '2000.00', date(2026, 10, 1))

        september = services.revenue_for(date(2026, 9, 1), date(2026, 9, 30))

        self.assertEqual(september['total'], Decimal('3000.00'))

    def test_a_single_day_window_sees_only_that_day(self):
        order = self.an_order(total='6000.00')
        self.a_payment(order, '3000.00', date(2026, 9, 15))
        self.a_payment(order, '3000.00', date(2026, 9, 16))

        self.assertEqual(services.revenue_for(date(2026, 9, 15), date(2026, 9, 15))['total'],
                         Decimal('3000.00'))


class PeriodTests(FinanceTestCase):

    def test_each_named_period_starts_where_it_should(self):
        today = timezone.localdate()

        self.assertEqual(services.resolve_window('day'), (today, today, 'day'))
        self.assertEqual(services.resolve_window('month'),
                         (today.replace(day=1), today, 'month'))
        self.assertEqual(services.resolve_window('year'),
                         (today.replace(month=1, day=1), today, 'year'))
        start, end, name = services.resolve_window('week')
        self.assertEqual((start.weekday(), end, name), (0, today, 'week'))

    def test_a_custom_window_is_used_as_given(self):
        since, until, name = services.resolve_window(None, date(2026, 3, 1), date(2026, 3, 31))

        self.assertEqual((since, until, name), (date(2026, 3, 1), date(2026, 3, 31), 'custom'))

    def test_a_backwards_window_is_swapped_rather_than_refused(self):
        since, until, _ = services.resolve_window(None, date(2026, 3, 31), date(2026, 3, 1))

        self.assertEqual((since, until), (date(2026, 3, 1), date(2026, 3, 31)))

    def test_a_named_period_wins_over_dates_sent_with_it(self):
        since, until, name = services.resolve_window('day', date(2020, 1, 1), date(2020, 1, 2))

        self.assertEqual((since, until, name), (self.today, self.today, 'day'))

    def test_nothing_asked_for_is_this_month(self):
        since, until, name = services.resolve_window()

        self.assertEqual((since, until, name), (self.today.replace(day=1), self.today, 'month'))


class ProfitTests(FinanceTestCase):

    def test_profit_is_revenue_less_every_cost(self):
        order = self.an_order(total='50000.00')
        self.a_payment(order, '50000.00', self.today)
        Expense.objects.create(category='RENT', amount=Decimal('15000.00'),
                               incurred_on=self.today)

        report = services.profit_and_loss(period='month')

        self.assertEqual(report['revenue']['total'], Decimal('50000.00'))
        self.assertEqual(report['costs']['manual_total'], Decimal('15000.00'))
        self.assertEqual(report['profit'],
                         report['revenue']['total'] - report['costs']['total'])
        self.assertEqual(report['profit'], Decimal('35000.00'))

    def test_margin_is_a_percentage_of_revenue(self):
        order = self.an_order(total='100000.00')
        self.a_payment(order, '100000.00', self.today)
        Expense.objects.create(category='RENT', amount=Decimal('25000.00'),
                               incurred_on=self.today)

        report = services.profit_and_loss(period='month')

        self.assertEqual(report['margin_percent'], Decimal('75.00'))

    def test_a_period_with_no_revenue_has_no_margin_rather_than_zero(self):
        Expense.objects.create(category='RENT', amount=Decimal('9000.00'),
                               incurred_on=self.today)

        report = services.profit_and_loss(period='month')

        self.assertIsNone(report['margin_percent'])
        self.assertEqual(report['profit'], Decimal('-9000.00'))

    def test_an_empty_period_reports_zeroes_and_still_names_its_window(self):
        report = services.profit_and_loss(since=self.today - timedelta(days=9),
                                          until=self.today - timedelta(days=8))

        self.assertEqual(report['revenue']['total'], Decimal('0.00'))
        self.assertEqual(report['costs']['total'], Decimal('0.00'))
        self.assertEqual(report['profit'], Decimal('0.00'))
        self.assertEqual(report['window']['period'], 'custom')


class OutstandingTests(FinanceTestCase):

    def test_outstanding_is_billed_less_collected_on_live_orders(self):
        self.an_order(total='10000.00', paid='4000.00', reference='O-1')
        self.an_order(total='5000.00', paid='0.00', reference='O-2')

        self.assertEqual(services.outstanding_now(), Decimal('11000.00'))

    def test_closed_orders_are_not_receivables(self):
        self.an_order(total='10000.00', paid='4000.00', status='Delivered', reference='O-3')
        self.an_order(total='8000.00', paid='1000.00', status='Cancelled', reference='O-4')

        self.assertEqual(services.outstanding_now(), Decimal('0.00'))

    def test_an_overpaid_order_cannot_net_off_a_real_debt(self):
        self.an_order(total='1000.00', paid='4000.00', reference='O-5')
        self.an_order(total='6000.00', paid='1000.00', reference='O-6')

        self.assertEqual(services.outstanding_now(), Decimal('5000.00'))


class LedgerBridgeTests(FinanceTestCase):
    """The snapshot leads, the ledger follows -- and the two agree in total.

    Every save here runs inside captureOnCommitCallbacks: the bridge is a
    transaction.on_commit hook, and a TestCase rolls its transaction back, so
    without this the callbacks never fire and these tests pass by doing
    nothing. Which is exactly how the first version of them passed.
    """

    def save_paid(self, order, amount):
        """Move the snapshot the way the order book does, and let the hook run."""
        with self.captureOnCommitCallbacks(execute=True):
            order.amount_paid = Decimal(amount)
            order.save(update_fields=['amount_paid'])

    def test_paying_an_order_through_the_order_book_writes_a_dated_row(self):
        order = self.an_order(total='7000.00')

        self.save_paid(order, '2500.00')

        rows = Payment.objects.filter(order=order)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().amount, Decimal('2500.00'))
        self.assertEqual(rows.first().received_on, self.today)
        self.assertEqual(rows.first().source, Payment.Source.SNAPSHOT)

    def test_a_second_instalment_writes_only_the_difference(self):
        order = self.an_order(total='7000.00')

        self.save_paid(order, '2500.00')
        self.save_paid(order, '7000.00')

        rows = Payment.objects.filter(order=order).order_by('created_at')
        self.assertEqual([r.amount for r in rows],
                         [Decimal('2500.00'), Decimal('4500.00')])
        self.assertEqual(payments.ledger_total(order), Decimal('7000.00'))

    def test_a_snapshot_that_did_not_move_writes_nothing(self):
        order = self.an_order(total='7000.00')

        self.save_paid(order, '2500.00')
        self.save_paid(order, '2500.00')

        self.assertEqual(Payment.objects.filter(order=order).count(), 1)

    def test_a_correction_downwards_never_writes_a_negative_payment(self):
        order = self.an_order(total='7000.00')

        self.save_paid(order, '5000.00')
        self.save_paid(order, '3000.00')

        rows = Payment.objects.filter(order=order)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(payments.ledger_total(order), Decimal('5000.00'))

    def test_saving_an_order_without_touching_money_writes_nothing(self):
        order = self.an_order(total='7000.00', paid='1000.00')
        Payment.objects.filter(order=order).delete()

        with self.captureOnCommitCallbacks(execute=True):
            order.order_status = 'Delivered'
            order.save(update_fields=['order_status'])

        self.assertEqual(Payment.objects.filter(order=order).count(), 0)

    def test_a_rolled_back_order_leaves_no_payment_behind(self):
        """on_commit, not post_save: money for an order that never landed."""
        from django.db import transaction

        order = self.an_order(total='7000.00')
        try:
            with transaction.atomic():
                order.amount_paid = Decimal('4000.00')
                order.save(update_fields=['amount_paid'])
                raise RuntimeError('the request failed after the save')
        except RuntimeError:
            pass

        self.assertEqual(Payment.objects.filter(order=order).count(), 0)

    def test_recording_a_payment_brings_the_order_snapshot_up(self):
        order = self.an_order(total='9000.00')

        payments.record(order, amount=Decimal('9000.00'), received_on=self.today)

        order.refresh_from_db()
        self.assertEqual(order.amount_paid, Decimal('9000.00'))
        self.assertEqual(order.payment_status, 'Paid')

    def test_a_part_payment_leaves_the_order_partially_paid(self):
        order = self.an_order(total='9000.00')

        payments.record(order, amount=Decimal('4000.00'), received_on=self.today)

        order.refresh_from_db()
        self.assertEqual(order.amount_paid, Decimal('4000.00'))
        self.assertEqual(order.payment_status, 'Partially Paid')


class FinanceApiTests(FinanceTestCase):

    def test_the_report_endpoint_answers_for_a_named_period(self):
        order = self.an_order(total='12000.00')
        self.a_payment(order, '12000.00', self.today)

        response = self.get('/api/finance/profit-loss/', period='day')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['window']['period'], 'day')
        self.assertEqual(Decimal(response.data['revenue']['total']), Decimal('12000.00'))
        self.assertIn('outstanding', response.data)
        self.assertIn('margin_percent', response.data)

    def test_the_report_endpoint_answers_for_a_custom_window(self):
        order = self.an_order(total='4000.00')
        self.a_payment(order, '4000.00', date(2026, 5, 10))

        response = self.get('/api/finance/profit-loss/',
                            since='2026-05-01', until='2026-05-31')

        self.assertEqual(response.data['window'],
                         {'since': '2026-05-01', 'until': '2026-05-31', 'period': 'custom'})
        self.assertEqual(Decimal(response.data['revenue']['total']), Decimal('4000.00'))

    def test_the_trend_endpoint_returns_a_bucket_per_step(self):
        order = self.an_order(total='6000.00')
        self.a_payment(order, '6000.00', self.today)

        response = self.get('/api/finance/trend/', period='month')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['step'], 'day')
        self.assertEqual(len(response.data['series']), self.today.day)
        self.assertEqual(Decimal(response.data['series'][-1]['revenue']), Decimal('6000.00'))

    def test_a_payment_can_be_recorded_with_its_own_date(self):
        order = self.an_order(total='5000.00')

        response = self.api.post('/api/finance/payments/', {
            'order': str(order.id), 'amount': '5000.00',
            'received_on': str(self.today - timedelta(days=3)), 'method': 'UPI',
        }, format='json')
        connection.set_tenant(self.tenant)

        self.assertEqual(response.status_code, 201, response.data)
        order.refresh_from_db()
        self.assertEqual(order.amount_paid, Decimal('5000.00'))
        self.assertEqual(
            services.revenue_for(self.today - timedelta(days=3),
                                 self.today - timedelta(days=3))['total'],
            Decimal('5000.00'))

    def test_a_payment_beyond_what_is_owed_is_refused(self):
        order = self.an_order(total='1000.00')

        response = self.api.post('/api/finance/payments/', {
            'order': str(order.id), 'amount': '5000.00'}, format='json')
        connection.set_tenant(self.tenant)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(order=order).exists())

    def test_a_future_dated_payment_is_refused(self):
        order = self.an_order(total='1000.00')

        response = self.api.post('/api/finance/payments/', {
            'order': str(order.id), 'amount': '500.00',
            'received_on': str(self.today + timedelta(days=1))}, format='json')
        connection.set_tenant(self.tenant)

        self.assertEqual(response.status_code, 400)

    def test_a_tailor_cannot_read_the_finance_report(self):
        from crm_api.models import Tailor
        user = User.objects.create_user(username='t@analytics.test',
                                        email='t@analytics.test', password='pw12345678')
        Tailor.objects.create(name='T', specialty='Blouses', role='Tailor', user=user)
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}',
            HTTP_X_TENANT_ID=self.tenant.schema_name)

        for path in ('/api/finance/profit-loss/', '/api/finance/trend/',
                     '/api/finance/payments/'):
            response = client.get(path)
            connection.set_tenant(self.tenant)
            self.assertEqual(response.status_code, 403, path)
