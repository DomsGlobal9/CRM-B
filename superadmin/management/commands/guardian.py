from django.core.management.base import BaseCommand
from django.db import connection

from superadmin import guardian


class Command(BaseCommand):
    help = 'One guardian tick: alert on WhatsApp if anything changed. Run from a cron.'

    def handle(self, *args, **options):
        connection.set_schema_to_public()
        message, error = guardian.run()
        if error:
            raise SystemExit(f'alert not delivered: {error}')
        self.stdout.write(message or 'nothing to report')
