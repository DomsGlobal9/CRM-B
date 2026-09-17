"""Push definitions.py into every boutique's garment templates.

Run after any edit to apps/catalog/definitions.py. Migrations resync too, but
only when a new one is written; this is the command for the edit in between.
"""
from django.core.management.base import BaseCommand
from django_tenants.utils import get_tenant_model, schema_context

from apps.catalog.services import sync_global_templates


class Command(BaseCommand):
    help = 'Resync garment templates from definitions.py into every tenant schema.'

    def handle(self, *args, **options):
        tenants = get_tenant_model().objects.exclude(schema_name='public')
        for tenant in tenants:
            with schema_context(tenant.schema_name):
                sync_global_templates()
            self.stdout.write(f'synced {tenant.schema_name}')
