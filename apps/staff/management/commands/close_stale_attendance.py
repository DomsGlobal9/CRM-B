"""Hourly: close attendance sessions nobody checked out of, in every boutique.

A forgotten check-out leaves a row with `check_out IS NULL` forever. That row
is what "currently working" means, it blocks the next check-in through the
one-open-session-per-staff constraint, and its hours never reach a timesheet.
This closes it at check_in + MAX_SESSION_HOURS. Run from a cron; see
apps.staff.attendance.auto_close_stale_sessions for the rule.
"""

from django.core.management.base import BaseCommand
from django_tenants.utils import get_public_schema_name, schema_context

from apps.staff.attendance import MAX_SESSION_HOURS, auto_close_stale_sessions
from tenants.models import BoutiqueTenant


class Command(BaseCommand):
    help = (f'Check out staff whose session has been open longer than '
            f'{MAX_SESSION_HOURS} hours, in every boutique.')

    def handle(self, *args, **options):
        total = 0
        tenants = BoutiqueTenant.objects.exclude(schema_name=get_public_schema_name())
        for tenant in tenants:
            try:
                with schema_context(tenant.schema_name):
                    # The lines are built INSIDE the schema: staff_label walks
                    # the roster FK, and that table only exists in here.
                    lines = [f'{tenant.schema_name}: {s.staff_label} '
                             f'{s.check_in:%Y-%m-%d %H:%M} -> {s.check_out:%H:%M}'
                             for s in auto_close_stale_sessions()]
            except Exception as exc:
                # One boutique's failure is not the others': the sweep keeps going.
                self.stderr.write(f'{tenant.schema_name}: skipped ({exc})')
                continue
            total += len(lines)
            for line in lines:
                self.stdout.write(line)
        self.stdout.write(f'done: closed {total} session(s)')
