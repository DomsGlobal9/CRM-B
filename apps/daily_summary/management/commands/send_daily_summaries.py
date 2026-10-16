"""Every 15 minutes: send the 11 PM daily summary in each boutique that is at 23:xx.

Run from a cron (Render Cron Job, `*/15 * * * *`). A repeat run sends nothing
twice -- see apps.daily_summary.send for the window and the duplicate guard.

Testing: `--schema <boutique> --test-every 60` keeps running and sends that
boutique's summaries every 60 seconds, whatever the hour, with no duplicate
guard and nothing logged to DailySummaryLog. Real people get every one of
those messages, so it is never for production.
"""
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.daily_summary.send import run


class Command(BaseCommand):
    help = "Send each boutique's daily summaries when its local time is 23:xx."

    def add_arguments(self, parser):
        parser.add_argument('--ignore-window', action='store_true',
                            help="Send now for the boutique's current date, whatever the hour. "
                                 "People already sent today are still skipped.")
        parser.add_argument('--schema', help='Only this boutique.')
        parser.add_argument('--test-every', type=int, metavar='SECONDS',
                            help='TESTING ONLY: resend every SECONDS seconds until stopped, '
                                 'ignoring the hour and the once-a-day guard. Needs --schema.')

    def handle(self, *args, **options):
        from tenants.models import BoutiqueTenant
        if options['schema'] and not BoutiqueTenant.objects.filter(
                schema_name=options['schema'], is_active=True).exists():
            raise CommandError(f"No active boutique with schema '{options['schema']}'.")
        if settings.EMAIL_BACKEND.endswith('console.EmailBackend'):
            self.stderr.write('EMAIL_HOST is not set: emails are printed here, not sent.')
        interval = options['test_every']
        if interval is None:
            return self._round(options['ignore_window'], options['schema'], dedup=True)
        if not options['schema']:
            raise CommandError('--test-every messages real people every round; '
                               'name the one boutique to test with --schema.')
        if interval < 1:
            raise CommandError('--test-every must be at least 1 second.')
        self.stderr.write(f'TEST MODE: sending {options["schema"]} summaries every '
                          f'{interval}s. Ctrl+C to stop.')
        while True:
            self._round(True, options['schema'], dedup=False)
            time.sleep(interval)

    def _round(self, ignore_window, schema, dedup):
        total = 0
        for name, result in run(ignore_window=ignore_window, schema=schema, dedup=dedup):
            if isinstance(result, Exception):
                self.stderr.write(f'{name}: skipped ({result})')
                continue
            total += result.get('SENT', 0)
            self.stdout.write(f'{name}: ' + (', '.join(
                f'{status.lower()} {n}' for status, n in sorted(result.items())) or 'nobody due'))
        self.stdout.write(f'done: sent {total} summary(ies)')
