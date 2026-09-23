"""Booking for somebody not on file, and the WhatsApp that follows either way."""
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.scheduling.models import Appointment
from crm_api.models import BoutiqueSettings, Customer


class BookingTestCase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@booking.test'
        tenant.name = 'Booking Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(id=1, defaults={'name': 'Booking Atelier'})
        self.owner = User.objects.create_user(
            username='owner@booking.test', email='owner@booking.test', password='ownerpass123')
        token, _ = Token.objects.get_or_create(user=self.owner)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                             HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.when = (timezone.now() + timedelta(days=2)).isoformat()

    def book(self, **body):
        """POST a booking and put the schema back, as the middleware clears it."""
        response = self.api.post('/api/appointments/',
                                 {'appointment_type': 'TRIAL', 'scheduled_time': self.when, **body},
                                 format='json')
        connection.set_tenant(self.tenant)
        return response


class NewCustomerBookingTests(BookingTestCase):

    def test_a_new_customer_is_created_and_booked_in_one_call(self):
        response = self.book(new_customer={
            'first_name': 'Ananya', 'last_name': 'Reddy',
            'mobile_number': '9876543210', 'gender': 'Female'})

        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get(mobile_number='919876543210')
        self.assertEqual((customer.first_name, customer.gender), ('Ananya', 'Female'))
        self.assertEqual(Appointment.objects.get().customer, customer)

    def test_a_number_already_on_file_books_for_that_person_rather_than_refusing(self):
        existing = Customer.objects.create(
            first_name='Priya', last_name='Sharma', mobile_number='919876500011')

        response = self.book(new_customer={
            'first_name': 'Priya', 'mobile_number': '+91 98765 00011'})

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.count(), 1, 'no duplicate customer')
        self.assertEqual(Appointment.objects.get().customer, existing)

    def test_a_bad_mobile_is_refused_with_the_same_sentence_the_customer_form_uses(self):
        response = self.book(new_customer={'first_name': 'Ananya', 'mobile_number': '12345'})

        self.assertEqual(response.status_code, 400)
        self.assertIn('mobile', str(response.data).lower())
        self.assertFalse(Appointment.objects.exists())
        self.assertFalse(Customer.objects.exists(), 'nothing written when the booking fails')

    def test_a_missing_first_name_is_refused(self):
        response = self.book(new_customer={'first_name': '', 'mobile_number': '9876543210'})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Appointment.objects.exists())

    def test_neither_a_client_nor_a_new_one_is_refused(self):
        response = self.book()

        self.assertEqual(response.status_code, 400)
        self.assertIn('customer', str(response.data).lower())

    def test_both_at_once_is_refused(self):
        existing = Customer.objects.create(
            first_name='Priya', last_name='Sharma', mobile_number='919876500011')

        response = self.book(customer=str(existing.id),
                             new_customer={'first_name': 'Ananya', 'mobile_number': '9876543210'})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Appointment.objects.exists())

    def test_booking_an_existing_client_still_works(self):
        existing = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number='919845012345')

        response = self.book(customer=str(existing.id))

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Appointment.objects.get().customer, existing)


class BookingWhatsAppTests(BookingTestCase):
    """The message goes out for both kinds of booking, and never breaks one."""

    def send_calls(self, **body):
        with mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                        return_value={'success': True, 'data': {'messageId': 'x'}}) as send:
            response = self.book(**body)
        return response, send

    def test_an_existing_client_is_messaged_on_their_own_number(self):
        existing = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number='919845012345')

        response, send = self.send_calls(customer=str(existing.id))

        self.assertEqual(response.status_code, 201, response.data)
        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs['phone'], '919845012345')
        self.assertIn('Meera', send.call_args.kwargs['message_text'])
        self.assertIn('trial', send.call_args.kwargs['message_text'].lower())

    def test_a_new_client_is_messaged_on_the_number_just_typed(self):
        response, send = self.send_calls(new_customer={
            'first_name': 'Ananya', 'mobile_number': '9876543210'})

        self.assertEqual(response.status_code, 201, response.data)
        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs['phone'], '919876543210')
        self.assertIn('Ananya', send.call_args.kwargs['message_text'])

    def test_a_failed_send_does_not_fail_the_booking(self):
        existing = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number='919845012345')

        with mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                        side_effect=RuntimeError('session dropped')):
            response = self.book(customer=str(existing.id))

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Appointment.objects.exists(), 'the booking is still in the book')

    def test_nothing_is_sent_when_the_boutique_has_messaging_off(self):
        BoutiqueSettings.objects.filter(id=1).update(customer_messaging_enabled=False)
        existing = Customer.objects.create(
            first_name='Meera', last_name='Nair', mobile_number='919845012345')

        response, send = self.send_calls(customer=str(existing.id))

        self.assertEqual(response.status_code, 201, response.data)
        send.assert_not_called()

    def test_a_refused_booking_sends_nothing(self):
        response, send = self.send_calls(new_customer={'first_name': 'A', 'mobile_number': '12345'})

        self.assertEqual(response.status_code, 400)
        send.assert_not_called()
