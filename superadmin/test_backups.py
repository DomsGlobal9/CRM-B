"""A backup is only real once it has been loaded back and counted."""
import os
import tempfile
from datetime import timedelta
from unittest import mock

from django.db import connection
from django.test import override_settings
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase

from crm_api.models import Customer, Tailor

from . import backups
from .models import PlatformSetting


class BackupRoundTripTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@bak.test'
        tenant.name = 'Backup Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        for i in range(3):
            Customer.objects.create(first_name=f'C{i}', last_name='X', mobile_number=f'98000000{i:02d}')
        Tailor.objects.create(name='Anya', specialty='Bridal', role='Tailor')
        connection.set_schema_to_public()
        fd, self.path = tempfile.mkstemp(suffix='.tar.gz')
        os.close(fd)
        self.addCleanup(os.unlink, self.path)

    def test_dump_then_restore_into_a_scratch_schema_matches_the_manifest(self):
        manifest = backups.dump(self.path)
        schema = self.tenant.schema_name
        self.assertEqual(manifest['schemas'][schema]['crm_api_customer'], 3)
        self.assertIn('public', manifest['schemas'])

        with connection.cursor() as c:
            c.execute(f'DROP SCHEMA IF EXISTS {backups.SCRATCH} CASCADE')
            c.execute(f'CREATE SCHEMA {backups.SCRATCH}')
            for table in manifest['schemas'][schema]:
                c.execute(f'CREATE TABLE {backups._q(backups.SCRATCH, table)} '
                          f'(LIKE {backups._q(schema, table)} INCLUDING DEFAULTS INCLUDING IDENTITY)')
            loaded = backups.restore(self.path, schema, backups.SCRATCH, cursor=c)
            self.assertEqual(loaded['crm_api_customer'], 3)
            self.assertNotIn('django_migrations', loaded)
            # A row inserted after the restore must get a fresh id, not collide
            # with a restored one: the sequence was moved past the data.
            tailor = backups._q(backups.SCRATCH, 'crm_api_tailor')
            c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = %s "
                      "AND table_name = 'crm_api_tailor' AND column_name <> 'id'", [backups.SCRATCH])
            cols = ', '.join(f'"{r[0]}"' for r in c.fetchall())
            c.execute(f"SELECT max(id) FROM {tailor}")
            highest = c.fetchone()[0]
            c.execute(f"INSERT INTO {tailor} ({cols}) SELECT {cols} FROM {tailor} LIMIT 1 RETURNING id")
            self.assertEqual(c.fetchone()[0], highest + 1)
            c.execute(f'DROP SCHEMA {backups.SCRATCH} CASCADE')

    def test_the_weekly_test_uses_the_same_loader_and_leaves_nothing_behind(self):
        backups.dump(self.path)
        PlatformSetting.objects.update_or_create(
            key=backups.STATE_KEY, defaults={'value': {'last_backup': 'x', 'last_backup_id': 'backups/x.gz'}})
        with mock.patch.object(backups, 'download',
                               side_effect=lambda public_id, path: os.replace(self.path, path) or open(self.path, 'wb').close()):
            ok, result = backups.run_restore_test()
        self.assertTrue(ok, result)
        self.assertIn('match the manifest', result)
        with connection.cursor() as c:
            c.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", [backups.SCRATCH])
            self.assertIsNone(c.fetchone(), 'scratch schema was rolled back')

    def test_an_archive_without_the_schema_is_refused(self):
        backups.dump(self.path)
        with self.assertRaises(ValueError):
            backups.restore(self.path, 'no_such_boutique', backups.SCRATCH)


@override_settings(CLOUDINARY_URL='cloudinary://k:s@cloud')
class BackupHealthTests(TenantTestCase):

    def setUp(self):
        super().setUp()
        connection.set_schema_to_public()
        PlatformSetting.objects.filter(key=backups.STATE_KEY).delete()

    def put(self, **v):
        PlatformSetting.objects.update_or_create(key=backups.STATE_KEY, defaults={'value': v})

    def test_states(self):
        now = timezone.now()
        fresh = dict(last_backup_at=now.isoformat(), last_backup='b', last_backup_tables=9,
                     last_backup_bytes=1e6)
        self.assertEqual(backups.check()[0], 'critical')                       # never
        self.put(**{**fresh, 'last_backup_at': (now - timedelta(days=2)).isoformat()})
        self.assertEqual(backups.check()[0], 'critical')                       # stale
        self.put(**fresh)
        self.assertEqual(backups.check()[0], 'warning')                        # never tested
        self.put(**fresh, last_restore_test_at=now.isoformat(), last_restore_test_ok=False,
                 last_restore_test='differ')
        self.assertEqual(backups.check()[0], 'critical')                       # test failed
        self.put(**fresh, last_restore_test_at=now.isoformat(), last_restore_test_ok=True)
        self.assertEqual(backups.check()[0], 'healthy')
        with override_settings(CLOUDINARY_URL=''):
            self.assertEqual(backups.check()[0], 'not_configured')
