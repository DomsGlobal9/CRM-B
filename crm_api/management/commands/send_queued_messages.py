"""Every minute: retry customer WhatsApp messages whose next try is due.

Run from a cron (Render Cron Job, `* * * * *`). The first try is made in the
background right after the order or stage is saved; this picks up the rest --
up to MAX_ATTEMPTS tries in all, then the message is FAILED and the order page
offers staff Retry or Open WhatsApp. A repeat or overlapping run sends nothing
twice: each try claims its message first (domains.orders.messaging.attempt).
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import get_public_schema_name, tenant_context

from domains.orders.messaging import send_due


class Command(BaseCommand):
    help = "Retry each boutique's customer WhatsApp messages that are due."

    def add_arguments(self, parser):
        parser.add_argument('--schema', help='Only this boutique.')

    def handle(self, *args, **options):
        from tenants.models import BoutiqueTenant
        tenants = (BoutiqueTenant.objects.filter(is_active=True)
                   .exclude(schema_name__in=(get_public_schema_name(), settings.TENANT_BASE_SCHEMA)))
        if options['schema']:
            tenants = tenants.filter(schema_name=options['schema'])
            if not tenants.exists():
                raise CommandError(f"No active boutique with schema '{options['schema']}'.")
        for tenant in tenants:
            try:
                with tenant_context(tenant):
                    counts = send_due()
            except Exception as exc:  # noqa: BLE001 - one boutique's failure is not the others'
                self.stderr.write(f'{tenant.schema_name}: skipped ({exc})')
                continue
            if counts:
                self.stdout.write(f'{tenant.schema_name}: ' + ', '.join(
                    f'{status.lower()} {n}' for status, n in sorted(counts.items())))
