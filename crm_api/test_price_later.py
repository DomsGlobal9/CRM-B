"""An order taken with "Price not decided yet", priced later on the order.

Placed without prices (anything typed is left out), its advance kept as
given; no invoice goes out, and Payment and Delivery wait, until the prices
are added through set-prices -- which works out the total, the balance and
the payment status the same way placing a priced order does.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.urls import reverse

from crm_api.models import Order, OrderActivity, Tailor
from crm_api.test_pricing import PricingTestBase
from domains.orders import workflow
from domains.orders.notifications import trial_confirmation


class PriceLaterTests(PricingTestBase):

    def place(self, advance=0, **prices):
        draft = self.a_draft(
            [self.garment(self.blouse, base=4000), self.garment(self.lehenga, base=32000)],
            prices={'price_later': True, 'packaging': 500, 'gst_mode': 'percent', 'gst_value': 5, **prices},
            payment={'option': 'partial', 'advance': advance})
        response = self.confirm(draft)
        self.assertEqual(response.status_code, 201, response.data)
        return Order.objects.get()

    def set_prices(self, order, body, client=None):
        return (client or self.api).post(reverse('order-set-prices', args=[order.pk]), body, format='json')

    def test_the_order_is_placed_with_no_prices(self):
        order = self.place()

        self.assertTrue(order.price_pending)
        self.assertEqual(order.total_amount, Decimal('0.00'))
        self.assertEqual(order.taxes, Decimal('0.00'))
        self.assertEqual(order.packaging_handling, Decimal('0.00'))
        self.assertEqual({job.base_price for job in order.garment_jobs.all()}, {Decimal('0.00')})

    def test_an_advance_is_kept_as_given(self):
        order = self.place(advance=2000)

        self.assertEqual(order.amount_paid, Decimal('2000.00'))
        self.assertEqual(order.advance_paid, Decimal('2000.00'))
        self.assertEqual(order.payment_status, 'Partially Paid')

    def test_saving_the_order_does_not_lose_the_advance(self):
        order = self.place(advance=2000)

        response = self.api.patch(reverse('order-detail', args=[order.pk]),
                                  {'special_instructions': 'Lining in silk'}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        order.refresh_from_db()
        self.assertEqual(order.amount_paid, Decimal('2000.00'))
        self.assertEqual(order.payment_status, 'Partially Paid')

    def test_no_invoice_before_the_prices(self):
        order = self.place()

        response = self.api.post(reverse('order-send-invoice', args=[order.pk]))

        self.assertEqual(response.status_code, 400)
        self.assertIn('prices', response.data['error'])
        self.assertNotIn('invoice', trial_confirmation(order).lower())

    def test_payment_and_delivery_wait_for_the_prices(self):
        order = self.place()

        for key in ('payment', 'delivered'):
            check = workflow.REQUIRED_DATA[key][0]
            self.assertIn('prices', check(order, None, supervisor=True))
        order.price_pending = False
        self.assertIsNone(workflow.REQUIRED_DATA['payment'][0](order, None, supervisor=True))

    def test_adding_the_prices_makes_the_total_and_the_balance(self):
        order = self.place(advance=2000)
        jobs = {job.template.key: job for job in order.garment_jobs.all()}

        response = self.set_prices(order, {
            'garments': [{'id': str(jobs['blouse'].pk), 'base_price': 4000},
                         {'id': str(jobs['lehenga'].pk), 'base_price': 32000, 'embroidery_price': 3500}],
            'packaging_handling': 500, 'discount': 0, 'gst_mode': 'percent', 'gst_value': 5,
        })

        self.assertEqual(response.status_code, 200, response.data)
        order.refresh_from_db()
        self.assertFalse(order.price_pending)
        goods = Decimal('4000') + Decimal('32000') + Decimal('3500') + Decimal('500')
        self.assertEqual(order.taxes, (goods * Decimal('0.05')).quantize(Decimal('0.01')))
        self.assertEqual(order.total_amount, goods + order.taxes)
        self.assertEqual(order.amount_paid, Decimal('2000.00'))
        self.assertEqual(order.payment_status, 'Partially Paid')
        self.assertTrue(OrderActivity.objects.filter(order=order, event_type='PRICES_SET').exists())
        self.assertNotEqual(self.api.post(reverse('order-send-invoice', args=[order.pk])).data.get('error', ''),
                            'Add the prices to this order first; the invoice is made from them.')

    def test_gst_as_an_amount(self):
        order = self.place()
        job = order.garment_jobs.first()

        self.set_prices(order, {'garments': [{'id': str(job.pk), 'base_price': 1000}],
                                'packaging_handling': 0, 'gst_mode': 'amount', 'gst_value': 90})

        order.refresh_from_db()
        self.assertEqual(order.taxes, Decimal('90.00'))
        self.assertEqual(order.total_amount, Decimal('1090.00'))

    def test_prices_below_what_was_paid_are_refused(self):
        order = self.place(advance=5000)
        job = order.garment_jobs.first()

        response = self.set_prices(order, {'garments': [{'id': str(job.pk), 'base_price': 1000}],
                                           'packaging_handling': 0, 'gst_value': 0})

        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertTrue(order.price_pending)
        self.assertEqual(order.amount_paid, Decimal('5000.00'))

    def test_a_garment_from_another_order_is_refused(self):
        order = self.place()

        response = self.set_prices(order, {'garments': [{'id': '00000000-0000-0000-0000-000000000000',
                                                         'base_price': 1000}]})

        self.assertEqual(response.status_code, 400)

    def test_a_tailor_cannot_set_prices(self):
        order = self.place()
        user = User.objects.create_user(username='tara', email='tara@pricing.test', password='tarapass12345')
        Tailor.objects.create(name='Tara', specialty='Blouses', role='Tailor', email='tara@pricing.test', user=user)

        response = self.set_prices(order, {'packaging_handling': 100}, client=self.client_for(user))

        self.assertIn(response.status_code, (403, 404))
        order.refresh_from_db()
        self.assertTrue(order.price_pending)

    def test_a_priced_order_is_unchanged(self):
        draft = self.a_draft([self.garment(self.blouse, base=4000)],
                             prices={'gst_mode': 'percent', 'gst_value': 5},
                             payment={'option': 'partial', 'advance': 1000})
        self.confirm(draft)
        order = Order.objects.get()

        self.assertFalse(order.price_pending)
        self.assertEqual(order.total_amount, Decimal('4200.00'))
        self.assertEqual(order.amount_paid, Decimal('1000.00'))
        self.assertEqual(order.payment_status, 'Partially Paid')
