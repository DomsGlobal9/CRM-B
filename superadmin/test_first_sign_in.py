"""first_sign_in: True only before an account's first recorded sign-in at a
boutique -- the cue for a new staff member's skippable first-time setup."""
from django.db import connection
from django.test import TransactionTestCase

from . import signins
from .models import LoginAttempt


class FirstSignInTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        LoginAttempt.objects.all().delete()

    def test_true_before_any_sign_in(self):
        self.assertTrue(signins.first_sign_in('durga', 'aditi'))

    def test_false_once_signed_in_there(self):
        LoginAttempt.objects.create(kind='login', username='durga', boutique='aditi', ok=True)
        self.assertFalse(signins.first_sign_in('durga', 'aditi'))

    def test_a_failed_attempt_or_another_boutique_does_not_count(self):
        LoginAttempt.objects.create(kind='login', username='durga', boutique='aditi', ok=False)
        LoginAttempt.objects.create(kind='login', username='durga', boutique='meera', ok=True)
        LoginAttempt.objects.create(kind='reset', username='durga', boutique='aditi', ok=True)
        self.assertTrue(signins.first_sign_in('durga', 'aditi'))
