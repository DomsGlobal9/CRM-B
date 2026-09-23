"""Nightly: close attendance sessions nobody checked out of, in every boutique.

A session opened by the workroom (somebody started a task without checking
in) has no second tap coming. Left alone it stays open for days and then
banks all of them at once; see apps.staff.attendance.MAX_SHIFT_HOURS.
"""

from django.core.management.base import BaseCommand
from django_tenants.utils import get_public_schema_name, schema_context

from apps.staff.attendance import close_stale_sessions
from tenants.models import BoutiqueTenant


class Command(BaseCommand):
    help = "Close attendance sessions open longer than a shift can last."

    def handle(self, *args, **options):
        total = 0
        tenants = BoutiqueTenant.objects.exclude(schema_name=get_public_schema_name())
        for tenant in tenants:
            try:
                with schema_context(tenant.schema_name):
                    closed = len(close_stale_sessions())
            except Exception as exc:
                self.stderr.write(f'{tenant.schema_name}: skipped ({exc})')
                continue
            total += closed
            if closed:
                self.stdout.write(f'{tenant.schema_name}: closed {closed}')
        self.stdout.write(f'done: closed {total} session(s)')
