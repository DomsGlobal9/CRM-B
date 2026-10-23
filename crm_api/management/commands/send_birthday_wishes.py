"""Every 15 minutes: wish customers a happy birthday at 12 AM in each boutique.

Run from a cron (Render Cron Job, `*/15 * * * *`), next to send_daily_summaries.
A repeat run sends nothing twice -- see domains.customers.birthdays.
"""
from django.core.management.base import BaseCommand, CommandError

from domains.customers.birthdays import run


class Command(BaseCommand):
    help = "Send customers' birthday wishes, and the boutique's reminders, at 12 AM boutique time."

    def add_arguments(self, parser):
        parser.add_argument('--ignore-window', action='store_true',
                            help="Run now, whatever the hour. Anyone already wished this year is still skipped.")
        parser.add_argument('--schema', help='Only this boutique.')

    def handle(self, *args, **options):
        from tenants.models import BoutiqueTenant
        if options['schema'] and not BoutiqueTenant.objects.filter(
                schema_name=options['schema'], is_active=True).exists():
            raise CommandError(f"No active boutique with schema '{options['schema']}'.")
        for name, result in run(ignore_window=options['ignore_window'], schema=options['schema']):
            if isinstance(result, Exception):
                self.stderr.write(f'{name}: skipped ({result})')
            else:
                self.stdout.write(f"{name}: wished {result['wished']}, reminded {result['reminded']}, "
                                  f"failed {result['failed']}")
