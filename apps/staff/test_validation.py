"""What the staff module refuses, and what it tidies before storing.

One test per rule: a value that must come back as a 400 with a sentence, and a
value that must be stored the canonical way. The rules themselves live in
core.validators; these prove the serializers actually call them.
"""

from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from .models import AttendanceSession, StaffDocument, StaffProfile
from .tests import AttendanceTestCase, StaffProfileTestCase


def _error_text(response):
    """Every sentence in a DRF error body, whatever key it hangs on."""
    data = response.data
    if isinstance(data, dict):
        return ' '.join(str(v) for values in data.values() for v in (
            values if isinstance(values, list) else [values]))
    return ' '.join(str(v) for v in data)


class StaffProfileValidationTests(StaffProfileTestCase):
    def _post(self, **overrides):
        payload = {'staff': self.anita.id, 'hourly_rate': '120.00',
                   'joined_at': '2026-01-05'}
        payload.update(overrides)
        return self.client_for(self.owner).post(
            reverse('staff-profile-list'), payload, format='json')

    def test_emergency_contact_is_free_text_with_an_end(self):
        response = self._post(emergency_contact='e' * 151)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('150 characters', _error_text(response))

    def test_emergency_contact_may_name_two_people(self):
        response = self._post(emergency_contact='  Wife Lakshmi 9876543210, brother 9123456789 ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StaffProfile.objects.get().emergency_contact,
                         'Wife Lakshmi 9876543210, brother 9123456789')

    def test_phone_is_stored_as_ten_national_digits(self):
        response = self._post(phone='+91 98765-43210')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StaffProfile.objects.get().phone, '9876543210')

    def test_hourly_rate_has_a_ceiling(self):
        response = self._post(hourly_rate='50000')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Hourly rate cannot be more than 10,000.', _error_text(response))

    def test_weekly_hours_cannot_exceed_a_week(self):
        response = self._post(weekly_hours='200')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Weekly hours cannot be more than 168.', _error_text(response))

    def test_weekly_deduction_cannot_exceed_the_deposit(self):
        response = self._post(deposit_total='1000', deposit_weekly='1500')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('The weekly deduction cannot be more than the deposit.',
                      _error_text(response))

    def test_joining_date_must_be_plausible(self):
        for bad in ('1900-01-01', '2062-01-01'):
            with self.subTest(joined_at=bad):
                response = self._post(joined_at=bad)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('Joining date must be between 1950 and a year from today.',
                              _error_text(response))

    def test_notes_have_an_end(self):
        response = self._post(notes='x' * 2001)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Notes is limited to 2000 characters.', _error_text(response))


class StaffDocumentValidationTests(StaffProfileTestCase):
    def _post(self, kind, number):
        return self.client_for(self.owner).post(
            reverse('staff-document-list'),
            {'staff': self.anita.id, 'kind': kind, 'number': number,
             'file': SimpleUploadedFile('id.jpg', b'\xff\xd8\xff', content_type='image/jpeg')},
            format='multipart')

    def test_a_short_aadhaar_is_refused(self):
        response = self._post('AADHAAR', '1234 5678')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Enter the 12-digit Aadhaar number.', _error_text(response))

    def test_an_aadhaar_is_stored_as_twelve_bare_digits(self):
        response = self._post('AADHAAR', '2345 6789 0123')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StaffDocument.objects.get().number, '234567890123')

    def test_a_pan_is_upper_cased_and_shaped(self):
        self.assertEqual(self._post('PAN', '12345').status_code, 400)
        response = self._post('PAN', 'abcde1234f')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StaffDocument.objects.get().number, 'ABCDE1234F')

    def test_other_kinds_are_free_text_with_an_end(self):
        # DRF's own max_length from the column says it first; either way it
        # is a sentence naming 64 characters and not a row.
        response = self._post('CERTIFICATE', 'x' * 65)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('64 characters', _error_text(response))
        self.assertFalse(StaffDocument.objects.exists())


class AttendanceInputValidationTests(AttendanceTestCase):
    def test_a_shift_cannot_be_recorded_in_the_future(self):
        tomorrow = (timezone.now() + timedelta(days=1)).strftime('%Y-%m-%dT09:00:00')
        response = self.client_for(self.owner).post(
            reverse('staff-attendance-record'),
            {'staff': self.anita.id, 'check_in': tomorrow}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['error'],
                         'Attendance cannot be recorded for a time in the future.')
        self.assertFalse(AttendanceSession.objects.exists())

    def test_a_correction_reason_has_an_end(self):
        session = AttendanceSession.objects.create(
            staff=self.anita, date=timezone.now().date() - timedelta(days=1),
            check_in=timezone.now() - timedelta(days=1, hours=8),
            check_out=timezone.now() - timedelta(days=1), minutes=480)
        response = self.client_for(self.owner).post(
            reverse('staff-attendance-correct', args=[session.id]),
            {'reason': 'r' * 501}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['error'], 'Reason is limited to 500 characters.')
