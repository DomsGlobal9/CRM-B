"""A session nobody checked out of must not stay open, and must not pay for
the days it stayed open for.

The bug these cover: the workroom opens a session when somebody starts a task
without checking in (Source.WORK), and nothing ever closed it. It stayed open
across days, which refused them tomorrow's check-in ("already checked in"),
kept their timesheet at zero, and then banked every hour since -- 44 of them
-- the moment anybody finally tapped Check out.
"""
from datetime import datetime, timedelta

from django.urls import reverse
from django.utils import timezone

from apps.staff import attendance
from apps.staff.models import AttendanceSession
from apps.staff.tests import StaffProfileTestCase


class StaleSessionTests(StaffProfileTestCase):
    def open_session(self, staff, *, days_ago, hour=15, source=AttendanceSession.Source.WORK):
        """A session opened `days_ago` at `hour` local, never checked out."""
        started = attendance.to_local(timezone.now()) - timedelta(days=days_ago)
        started = started.replace(hour=hour, minute=3, second=0, microsecond=0)
        return AttendanceSession.objects.create(
            staff=staff, date=attendance.business_date(started),
            check_in=started, source=source)

    def test_a_forgotten_session_is_closed_at_the_shift_cap(self):
        session = self.open_session(self.anita, days_ago=2)

        self.assertEqual(len(attendance.close_stale_sessions()), 1)

        session.refresh_from_db()
        self.assertIsNotNone(session.check_out)
        # Twelve hours, not the 44 the wall clock has run since.
        self.assertEqual(session.minutes, attendance.MAX_SHIFT_HOURS * 60)
        self.assertEqual(session.check_out,
                         session.check_in + timedelta(hours=attendance.MAX_SHIFT_HOURS))
        self.assertIn('Closed automatically', session.note)

    def test_a_session_inside_the_cap_is_left_running(self):
        session = AttendanceSession.objects.create(
            staff=self.anita, date=attendance.business_date(timezone.now()),
            check_in=timezone.now() - timedelta(hours=3),
            source=AttendanceSession.Source.SELF)

        self.assertEqual(len(attendance.close_stale_sessions()), 0)

        session.refresh_from_db()
        self.assertIsNone(session.check_out)

    def test_a_night_shift_across_midnight_is_not_cut_off(self):
        """Started 23:00 yesterday, still on the floor: a real shift, not a
        forgotten one, and the old calendar-day rule would have closed it at
        midnight for an hour's pay."""
        started = timezone.now() - timedelta(hours=2)
        session = AttendanceSession.objects.create(
            staff=self.anita, date=attendance.business_date(started) - timedelta(days=1),
            check_in=started, source=AttendanceSession.Source.SELF)

        self.assertEqual(len(attendance.close_stale_sessions()), 0)

        session.refresh_from_db()
        self.assertIsNone(session.check_out)

    def test_a_forgotten_session_does_not_block_the_next_morning(self):
        self.open_session(self.anita, days_ago=1)

        fresh = attendance.check_in(self.anita, user=self.anita_user)

        self.assertEqual(fresh.date, attendance.business_date(timezone.now()))
        self.assertEqual(
            AttendanceSession.objects.filter(staff=self.anita, check_out__isnull=True).count(), 1)

    def test_checking_out_late_does_not_bank_the_missing_days(self):
        self.open_session(self.anita, days_ago=3)

        closed = attendance.check_out(self.anita, user=self.anita_user)

        self.assertLessEqual(closed.minutes, attendance.MAX_SHIFT_HOURS * 60)

    def test_the_workroom_can_open_todays_session_after_a_forgotten_one(self):
        self.open_session(self.anita, days_ago=1)

        created = attendance.check_in_from_work(
            self.anita, user=self.anita_user, started_at=timezone.now(),
            note='started stitching')

        self.assertIsNotNone(created)
        self.assertEqual(created.source, AttendanceSession.Source.WORK)

    def test_current_reports_the_leftover_rather_than_working_today(self):
        self.open_session(self.anita, days_ago=2)

        res = self.client_for(self.anita_user).get(
            reverse('staff-attendance-current'))

        self.assertEqual(res.status_code, 200)
        # Swept on read: not "WORKING", and the closed session is today's history.
        self.assertEqual(res.json()['state'], 'NOT_CHECKED_IN')

    def test_the_sweep_is_idempotent(self):
        self.open_session(self.anita, days_ago=2)

        self.assertEqual(len(attendance.close_stale_sessions()), 1)
        self.assertEqual(len(attendance.close_stale_sessions()), 0)

    def test_a_masters_session_is_swept_like_anyone_elses(self):
        self.anita.role = 'Master'
        self.anita.save(update_fields=['role'])
        self.open_session(self.anita, days_ago=1)

        self.assertEqual(len(attendance.close_stale_sessions(staff=self.anita)), 1)
