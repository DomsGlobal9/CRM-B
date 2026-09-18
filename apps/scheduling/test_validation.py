"""What the diary refuses at the door."""

from datetime import timedelta

from django.contrib.auth.models import User
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.scheduling.models import Appointment
from crm_api.models import Customer


class AppointmentValidationTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = "owner@scheduling-val.test"
        tenant.name = "Scheduling Validation"
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        owner = User.objects.create_user(
            username="owner@scheduling-val.test", email="owner@scheduling-val.test",
            password="ownerpass123")
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}',
                             HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.customer = Customer.objects.create(
            first_name="Meera", last_name="Nair", mobile_number="919845012345",
            customer_type="Women", garment_type="Saree")

    def _book(self, **overrides):
        payload = {'customer': str(self.customer.id), 'appointment_type': 'TRIAL',
                   'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat()}
        payload.update(overrides)
        return self.api.post(reverse('appointment-list'), payload, format='json')

    def test_a_slot_in_the_past_is_refused(self):
        response = self._book(scheduled_time=(timezone.now() - timedelta(days=2)).isoformat())
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Appointment time cannot be in the past.', str(response.data['scheduled_time']))
        self.assertFalse(Appointment.objects.exists())

    def test_an_appointment_already_held_can_still_be_marked_completed(self):
        # Yesterday's slot is history, not a typo: only a new time is checked.
        held = Appointment.objects.create(
            customer=self.customer, appointment_type='TRIAL',
            scheduled_time=timezone.now() - timedelta(days=1))
        url = reverse('appointment-detail', args=[held.id])
        response = self.api.patch(url, {'status': 'COMPLETED'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        held.refresh_from_db()
        self.assertEqual(held.status, 'COMPLETED')
        response = self.api.patch(
            url, {'scheduled_time': (timezone.now() - timedelta(days=3)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_notes_have_an_end_and_are_trimmed(self):
        response = self._book(notes='n' * 2001)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Notes is limited to 2000 characters.', str(response.data['notes']))

        response = self._book(notes='  Bring the blouse piece.  ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Appointment.objects.get().notes, 'Bring the blouse piece.')
