"""The forgotten check-out: a session nobody closed is closed for them at
11:59 PM, boutique time, on the day it was checked in.

Every test drives real timestamps rather than sleeping, and asserts the stamp
that lands -- 11:59 PM on the check-in's own day, never "when the sweep ran" --
because that is the whole point of the rule for anybody being paid from it.
"""
from datetime import datetime, time, timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from apps.staff.attendance import (
    AttendanceError, auto_close_stale_sessions, check_in, check_out, open_session,
)
from apps.staff.models import AttendanceSession
from apps.staff.tests import AttendanceTestCase
from core.formatting import tenant_timezone, to_local


class AutoCheckoutTestCase(AttendanceTestCase):

    def local(self, days_ago, hour, minute=0):
        """A boutique-local moment `days_ago` days back."""
        day = to_local(timezone.now()).date() - timedelta(days=days_ago)
        return datetime.combine(day, time(hour, minute), tzinfo=tenant_timezone())

    def night_of(self, moment):
        """11:59 PM, boutique time, on `moment`'s own day."""
        return datetime.combine(to_local(moment).date(), time(23, 59), tzinfo=tenant_timezone())

    def a_session(self, staff, started, **kwargs):
        """An open session checked in at `started`."""
        return AttendanceSession.objects.create(
            staff=staff, date=to_local(started).date(), check_in=started, **kwargs)

    def earlier_today(self, minutes):
        """`minutes` ago, or just after midnight if that would be yesterday."""
        return max(timezone.now() - timedelta(minutes=minutes), self.local(0, 0, 1))


class AutoCheckoutTests(AutoCheckoutTestCase):

    def test_a_forgotten_check_out_is_made_at_1159_pm_that_day(self):
        session = self.a_session(self.anita, self.local(1, 10))

        closed = auto_close_stale_sessions()

        self.assertEqual([s.pk for s in closed], [session.pk])
        session.refresh_from_db()
        self.assertEqual(session.check_out, self.night_of(session.check_in))
        self.assertEqual(session.minutes, 13 * 60 + 59)
        self.assertTrue(session.auto_checked_out)
        self.assertIsNone(open_session(self.anita), 'no longer an open session')

    def test_the_master_is_not_exempt(self):
        session = self.a_session(self.master, self.local(1, 9))

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, self.night_of(session.check_in))
        self.assertTrue(session.auto_checked_out)

    def test_a_manual_check_out_is_never_touched(self):
        started = self.local(1, 9)
        session = AttendanceSession.objects.create(
            staff=self.anita, date=started.date(), check_in=started,
            check_out=started + timedelta(hours=5), minutes=300)

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, session.check_in + timedelta(hours=5))
        self.assertEqual(session.minutes, 300)
        self.assertFalse(session.auto_checked_out)

    def test_a_check_in_from_today_stays_open(self):
        session = self.a_session(self.anita, self.local(0, 0, 1))

        self.assertEqual(auto_close_stale_sessions(), [])

        session.refresh_from_db()
        self.assertIsNone(session.check_out)
        self.assertIsNotNone(open_session(self.anita))

    def test_every_eligible_person_is_closed_in_one_sweep(self):
        stale = [self.a_session(self.anita, self.local(1, 10)),
                 self.a_session(self.balan, self.local(2, 8)),
                 self.a_session(self.master, self.local(1, 22))]

        closed = auto_close_stale_sessions()

        self.assertCountEqual([s.pk for s in closed], [s.pk for s in stale])
        for session in stale:
            session.refresh_from_db()
            self.assertEqual(session.check_out, self.night_of(session.check_in))

    def test_an_old_forgotten_session_is_closed_on_its_own_day(self):
        """A session from last week closes at 11:59 PM of ITS day, not today."""
        session = self.a_session(self.anita, self.local(7, 10))

        auto_close_stale_sessions()

        session.refresh_from_db()
        self.assertEqual(session.check_out, self.night_of(session.check_in))
        self.assertLess(session.check_out, timezone.now() - timedelta(days=6))

    def test_the_person_can_check_in_again_afterwards(self):
        self.a_session(self.anita, self.local(1, 10))

        auto_close_stale_sessions()
        fresh = check_in(self.anita, user=self.anita_user)

        self.assertIsNone(fresh.check_out)
        self.assertEqual(AttendanceSession.objects.filter(staff=self.anita).count(), 2)
        self.assertEqual(open_session(self.anita), fresh)

    def test_checking_in_sweeps_the_stale_session_without_the_cron(self):
        """The constraint must not block a real shift because a cron was late."""
        stale = self.a_session(self.anita, self.local(2, 10))

        fresh = check_in(self.anita, user=self.anita_user)

        stale.refresh_from_db()
        self.assertTrue(stale.auto_checked_out)
        self.assertEqual(stale.check_out, self.night_of(stale.check_in))
        self.assertEqual(open_session(self.anita), fresh)

    def test_running_it_again_changes_nothing_and_adds_nothing(self):
        session = self.a_session(self.anita, self.local(1, 10))

        auto_close_stale_sessions()
        session.refresh_from_db()
        first_close, first_minutes = session.check_out, session.minutes

        self.assertEqual(auto_close_stale_sessions(), [], 'second run finds nothing')
        self.assertEqual(auto_close_stale_sessions(), [], 'third run finds nothing')

        session.refresh_from_db()
        self.assertEqual(session.check_out, first_close)
        self.assertEqual(session.minutes, first_minutes)
        self.assertEqual(AttendanceSession.objects.count(), 1)

    def test_a_manual_check_out_beats_the_sweep(self):
        """The shift a person actually closed stays exactly as they closed it."""
        check_in(self.anita, user=self.anita_user)
        session = open_session(self.anita)
        session.check_in = self.earlier_today(minutes=300)
        session.save(update_fields=['check_in'])

        closed = check_out(self.anita, user=self.anita_user)
        auto_close_stale_sessions()

        closed.refresh_from_db()
        self.assertFalse(closed.auto_checked_out)
        self.assertEqual(closed.minutes, closed.duration_minutes())

    def test_the_management_command_sweeps_this_boutique(self):
        session = self.a_session(self.anita, self.local(1, 10))
        out = StringIO()

        call_command('close_stale_attendance', stdout=out, stderr=StringIO())

        session.refresh_from_db()
        self.assertIsNotNone(session.check_out, out.getvalue())
        self.assertTrue(session.auto_checked_out)
        self.assertEqual(session.check_out, self.night_of(session.check_in))


class LateCheckOutTests(AutoCheckoutTestCase):
    """A check-out (or sign-out) days after a forgotten check-in: closed at
    11:59 PM that night, never "now"."""

    def test_a_check_out_days_later_is_made_at_1159_pm_that_day(self):
        session = self.a_session(self.anita, self.local(10, 9, 30))

        with self.assertRaisesMessage(AttendanceError, 'checked out automatically at 11:59 PM'):
            check_out(self.anita, user=self.owner)

        session.refresh_from_db()
        self.assertEqual(session.check_out, self.night_of(session.check_in))
        self.assertEqual(session.minutes, 14 * 60 + 29)
        self.assertTrue(session.auto_checked_out)
        self.assertIsNone(open_session(self.anita))

    def test_a_check_out_the_same_day_is_as_before(self):
        session = self.a_session(self.anita, self.earlier_today(minutes=180))

        check_out(self.anita, user=self.owner)

        session.refresh_from_db()
        self.assertFalse(session.auto_checked_out)
        self.assertEqual(session.minutes, session.duration_minutes())
