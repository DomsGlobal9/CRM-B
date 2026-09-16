from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

from superadmin import backups


class Command(BaseCommand):
    help = ('Nightly: dump every schema to Cloudinary. --restore-test: load the newest '
            'archive into a scratch schema and compare. --restore: load one boutique for real.')

    def add_arguments(self, parser):
        parser.add_argument('--restore-test', action='store_true')
        parser.add_argument('--restore', metavar='ARCHIVE.tar.gz')
        parser.add_argument('--schema', help='schema name inside the archive')
        parser.add_argument('--into', help='existing, migrated schema to load into')

    def handle(self, *args, **o):
        connection.set_schema_to_public()
        if o['restore']:
            if not (o['schema'] and o['into']):
                raise SystemExit('--restore needs --schema and --into')
            loaded = backups.restore(o['restore'], o['schema'], o['into'])
            self.stdout.write(f'{sum(loaded.values())} rows into {o["into"]}')
            return
        if o['restore_test']:
            ok, result = backups.run_restore_test()
            self.stdout.write(result)
            if not ok:
                raise SystemExit(1)
            return
        try:
            name, size, tables, pruned = backups.run_backup()
        except Exception as exc:
            backups._save(last_backup_error=f'{timezone.now():%Y-%m-%d %H:%M} {exc}')
            raise
        self.stdout.write(f'{name}: {tables} tables, {size / 1e6:.1f} MB, {pruned} old archive(s) pruned')
