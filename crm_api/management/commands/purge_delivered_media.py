"""Nightly: drop the workroom photos and voice notes of orders delivered
more than a few days ago, in every boutique. Run from a cron; see
domains.orders.retention for what goes and why it waits."""

from django.core.management.base import BaseCommand
from django_tenants.utils import get_public_schema_name, schema_context

from domains.orders.retention import PURGE_AFTER_DAYS, purge_due_orders
from tenants.models import BoutiqueTenant


class Command(BaseCommand):
    help = 'Delete stage photos and voice notes of orders delivered more than N days ago.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=PURGE_AFTER_DAYS,
                            help=f'Days after delivery to wait (default {PURGE_AFTER_DAYS}).')

    def handle(self, *args, **options):
        days = options['days']
        total_purged = total_left = 0
        tenants = BoutiqueTenant.objects.exclude(schema_name=get_public_schema_name())
        for tenant in tenants:
            try:
                with schema_context(tenant.schema_name):
                    purged, left = purge_due_orders(days)
            except Exception as exc:
                self.stderr.write(f'{tenant.schema_name}: skipped ({exc})')
                continue
            total_purged += purged
            total_left += left
            if purged or left:
                self.stdout.write(f'{tenant.schema_name}: purged {purged}, retrying {left}')
        self.stdout.write(f'done: purged {total_purged} order(s), {total_left} left for next run')
