"""Issue, rotate, revoke and list a boutique's customer-portal credential.

A command rather than a console screen because the value is shown ONCE and
must not be re-displayable -- a screen that can show it again is a screen that
stores it in a form somebody can read.
"""

from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import get_public_schema_name, schema_context

from tenants import portal_credentials
from tenants.models import BoutiqueTenant, PortalCredential


class Command(BaseCommand):
    help = "Manage a boutique's customer portal credential."

    def add_arguments(self, parser):
        parser.add_argument('action', choices=('create', 'rotate', 'revoke', 'list'))
        parser.add_argument('--schema', help='Boutique schema name.')
        parser.add_argument('--key-id', help='Which credential, for rotate/revoke.')
        parser.add_argument('--label', default='', help='A name for this portal.')
        parser.add_argument('--origin', default='',
                            help='The one browser origin allowed to read a reply, '
                                 'e.g. https://sarala.example.com')

    def handle(self, *args, **options):
        action = options['action']
        with schema_context(get_public_schema_name()):
            if action == 'list':
                return self._list(options.get('schema'))
            if action == 'create':
                return self._create(options)
            return self._existing(action, options)

    def _tenant(self, schema):
        if not schema:
            raise CommandError('--schema is required.')
        tenant = BoutiqueTenant.objects.filter(schema_name=schema).first()
        if tenant is None:
            raise CommandError(f'No boutique with schema {schema!r}.')
        return tenant

    def _create(self, options):
        tenant = self._tenant(options.get('schema'))
        row, value = portal_credentials.issue(
            tenant, label=options['label'], allowed_origin=options['origin'])
        self._announce(row, value)

    def _existing(self, action, options):
        key_id = options.get('key_id')
        if not key_id:
            raise CommandError('--key-id is required for that.')
        row = PortalCredential.objects.filter(key_id=key_id).select_related('tenant').first()
        if row is None:
            raise CommandError('No such credential.')
        if action == 'revoke':
            portal_credentials.revoke(row)
            self.stdout.write(f'Revoked {row.key_id} for {row.tenant.schema_name}.')
            return
        value = portal_credentials.rotate(
            row, allowed_origin=options['origin'] or None)
        self._announce(row, value)

    def _announce(self, row, value):
        self.stdout.write(self.style.SUCCESS(
            f'Portal credential for {row.tenant.schema_name} '
            f'({row.tenant.shop_slug or "no slug yet"}):'))
        self.stdout.write('')
        self.stdout.write(f'  X-Portal-Key: {value}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            'Shown once -- only a hash is stored, so it cannot be read back.'))
        self.stdout.write(
            'This is NOT a secret if the portal is a browser page: anyone who '
            'opens the site can read it out of the JavaScript. It names the '
            'portal so it can be rate limited and revoked; what protects a '
            'customer is the WhatsApp code and the signed token.')
        if not row.allowed_origin:
            self.stdout.write(
                'No --origin set, so no CORS header is sent and a browser on '
                'another origin cannot read the replies.')

    def _list(self, schema):
        rows = PortalCredential.objects.select_related('tenant')
        if schema:
            rows = rows.filter(tenant__schema_name=schema)
        found = False
        for row in rows:
            found = True
            state = 'active' if row.is_active else 'revoked'
            used = row.last_used_at.strftime('%Y-%m-%d %H:%M') if row.last_used_at else 'never'
            self.stdout.write(
                f'{row.key_id}  {state:<8} {row.tenant.schema_name:<28} '
                f'{row.allowed_origin or "(no origin)":<36} last used {used}')
        if not found:
            self.stdout.write('No portal credentials.')
