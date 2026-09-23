"""The twelve-hour rule: a session nobody closed is closed for them.

Every test drives real timestamps rather than sleeping, and asserts the stamp
that lands -- `check_in + MAX_SESSION_HOURS`, never "when the sweep ran" --
because that is the whole point of the rule for anybody being paid from it.
"""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from apps.staff.attendance import (
    MAX_SESSION_HOURS, auto_close_stale_sessions, check_in, check_out, open_session,
)
from apps.staff.models import AttendanceSession
from apps.staff.tests import AttendanceTestCase


class AutoCheckoutTests(AttendanceTestCase):

    def a_session(self, staff, hours_ago, **kwargs):
        """An open session that started `hours_ago` hours before now."""
        started = timezone.now() - timedelta(hours=hours_ago)
        return AttendanceSession.objects.create(
            staff=staff, date=started.date(), check_in=started, **kwargs)

    def test_a_tailor_open_past_twelve_hours_is_checked_out_at_twelve(self):
        session = self.a_session(self.anita, hours_ago=12.5)

        closed = auto_close_stale_sessions()

        self.assertEqual([s.pk for s in closed], [session.pk])
        session.refresh_from_db()
        self.assertEqual(session.check_out, session.check_in + timedelta(hours=MAX_SESSION_HOURS))
        self.assertEqual(session.minutes, MAX_SESSION_HOURS * 60)
        self.assertTrue(session.auto_checked_out)
        self.assertIsNone(open_session(self.anita), 'no longer an open session')

    def test_the_master_is_not_exempt(self):
        session = self.a_session(self.master, hours_ago=13)

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, session.check_in + timedelta(hours=MAX_SESSION_HOURS))
        self.assertTrue(session.auto_checked_out)

    def test_a_manual_check_out_is_never_touched(self):
        started = timezone.now() - timedelta(hours=20)
        session = AttendanceSession.objects.create(
            staff=self.anita, date=started.date(), check_in=started,
            check_out=started + timedelta(hours=5), minutes=300)

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, session.check_in + timedelta(hours=5))
        self.assertEqual(session.minutes, 300)
        self.assertFalse(session.auto_checked_out)

    def test_a_session_still_inside_the_window_stays_open(self):
        session = self.a_session(self.anita, hours_ago=11.5)

        self.assertEqual(auto_close_stale_sessions(), [])

        session.refresh_from_db()
        self.assertIsNone(session.check_out)
        self.assertIsNotNone(open_session(self.anita))

    def test_every_eligible_person_is_closed_in_one_sweep(self):
        stale = [self.a_session(self.anita, hours_ago=14),
                 self.a_session(self.balan, hours_ago=30),
                 self.a_session(self.master, hours_ago=12.1)]

        closed = auto_close_stale_sessions()

        self.assertCountEqual([s.pk for s in closed], [s.pk for s in stale])
        for session in stale:
            session.refresh_from_db()
            self.assertEqual(session.check_out, session.check_in + timedelta(hours=MAX_SESSION_HOURS))

    def test_an_old_forgotten_session_is_closed_on_its_own_day(self):
        """A session from last week closes at ITS check-in + 12h, not today."""
        session = self.a_session(self.anita, hours_ago=24 * 7)

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, session.check_in + timedelta(hours=MAX_SESSION_HOURS))
        self.assertLess(session.check_out, timezone.now() - timedelta(days=6))

    def test_the_person_can_check_in_again_afterwards(self):
        self.a_session(self.anita, hours_ago=15)

        auto_close_stale_sessions()
        fresh = check_in(self.anita, user=self.anita_user)

        self.assertIsNone(fresh.check_out)
        self.assertEqual(AttendanceSession.objects.filter(staff=self.anita).count(), 2)
        self.assertEqual(open_session(self.anita), fresh)

    def test_checking_in_sweeps_the_stale_session_without_the_cron(self):
        """The constraint must not block a real shift because a cron was late."""
        stale = self.a_session(self.anita, hours_ago=40)

        fresh = check_in(self.anita, user=self.anita_user)

        stale.refresh_from_db()
        self.assertTrue(stale.auto_checked_out)
        self.assertIsNotNone(stale.check_out)
        self.assertEqual(open_session(self.anita), fresh)

    def test_running_it_again_changes_nothing_and_adds_nothing(self):
        session = self.a_session(self.anita, hours_ago=18)

        auto_close_stale_sessions()
        session.refresh_from_db()
        first_close, first_minutes = session.check_out, session.minutes

        self.assertEqual(auto_close_stale_sessions(), [], 'second run finds nothing')
        self.assertEqual(auto_close_stale_sessions(), [], 'third run finds nothing')

        session.refresh_from_db()
        self.assertEqual(session.check_out, first_close)
        self.assertEqual(session.minutes, first_minutes)
        self.assertEqual(AttendanceSession.objects.count(), 1)

    def test_a_manual_check_out_after_five_hours_beats_the_sweep(self):
        """The shift a person actually closed stays exactly as they closed it."""
        check_in(self.anita, user=self.anita_user)
        session = open_session(self.anita)
        session.check_in = timezone.now() - timedelta(hours=5)
        session.save(update_fields=['check_in'])

        closed = check_out(self.anita, user=self.anita_user)
        auto_close_stale_sessions()

        closed.refresh_from_db()
        self.assertFalse(closed.auto_checked_out)
        self.assertAlmostEqual(closed.minutes, 300, delta=1)

    def test_the_management_command_sweeps_this_boutique(self):
        session = self.a_session(self.anita, hours_ago=13)
        out = StringIO()

        call_command('close_stale_attendance', stdout=out, stderr=StringIO())

        session.refresh_from_db()
        self.assertIsNotNone(session.check_out, out.getvalue())
        self.assertTrue(session.auto_checked_out)
