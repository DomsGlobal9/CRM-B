"""
Backups for a database nobody else is backing up (Supabase free tier).

Nightly: every table in every schema is copied out as CSV into one gzipped
tar, with a manifest of row counts, and uploaded to Cloudinary as a raw file
-- the media store this product already pays for, so no new service and no
new secret. Weekly: the newest archive is downloaded and loaded into a
scratch schema, table by table, and the counts compared with the manifest.
A backup that has never been restored is a hope; this makes it a fact once a
week, and the health page (and so the guardian) says when it stops being one.

Restore for real: create the boutique (its schema is migrated on save),
then `manage.py backup --restore ARCHIVE --schema old_name --into new_name`.
The loader is the same one the weekly test runs.

# ponytail: whole archive built on local disk, one COPY per table; fine at
# 131 MB, revisit with streaming uploads past a few GB.
"""
import csv
import io
import json
import logging
import os
import tarfile
import tempfile
from datetime import timedelta

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from tenants.models import BoutiqueTenant

from .models import PlatformSetting

logger = logging.getLogger(__name__)

STATE_KEY = 'backups'
FOLDER = 'backups'
KEEP_DAYS = 14
STALE_AFTER = timedelta(hours=36)
RESTORE_TEST_EVERY = timedelta(days=8)
SCRATCH = '_restore_check'


def configured():
    return bool(settings.CLOUDINARY_URL)


def state():
    row = PlatformSetting.objects.filter(key=STATE_KEY).first()
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def _save(**changes):
    PlatformSetting.objects.update_or_create(
        key=STATE_KEY, defaults={'value': {**state(), **changes}, 'updated_by': 'backup',
                                 'description': 'Written by manage.py backup. Not edited by hand.'})


def _schemas():
    return ['public'] + list(BoutiqueTenant.objects.exclude(schema_name='public')
                             .values_list('schema_name', flat=True))


def _tables(cursor, schema):
    cursor.execute("SELECT table_name FROM information_schema.tables "
                   "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY 1", [schema])
    return [r[0] for r in cursor.fetchall()]


def _q(schema, table):
    return f'"{schema}"."{table}"'


# ------------------------------------------------------------------ dump

def dump(path):
    """Write the archive to `path`; return the manifest."""
    manifest = {'taken_at': timezone.now().isoformat(), 'schemas': {}}
    with connection.cursor() as cursor, tarfile.open(path, 'w:gz') as tar:
        for schema in _schemas():
            manifest['schemas'][schema] = {}
            for table in _tables(cursor, schema):
                buf = io.BytesIO()
                wrapper = io.TextIOWrapper(buf, encoding='utf-8', write_through=True)
                cursor.copy_expert(f'COPY {_q(schema, table)} TO STDOUT WITH (FORMAT csv, HEADER)', wrapper)
                cursor.execute(f'SELECT count(*) FROM {_q(schema, table)}')
                manifest['schemas'][schema][table] = cursor.fetchone()[0]
                info = tarfile.TarInfo(f'{schema}/{table}.csv')
                info.size = buf.tell()
                buf.seek(0)
                tar.addfile(info, buf)
        blob = json.dumps(manifest, indent=1).encode()
        info = tarfile.TarInfo('manifest.json')
        info.size = len(blob)
        tar.addfile(info, io.BytesIO(blob))
    return manifest


def upload(path, name):
    import cloudinary.uploader
    res = cloudinary.uploader.upload(path, resource_type='raw', folder=FOLDER,
                                     public_id=name, overwrite=False, use_filename=False)
    return res['public_id'], res['bytes']


def prune():
    """Drop archives older than KEEP_DAYS. Returns how many."""
    import cloudinary.api
    cutoff = timezone.now() - timedelta(days=KEEP_DAYS)
    old = []
    for r in cloudinary.api.resources(resource_type='raw', type='upload',
                                      prefix=f'{FOLDER}/', max_results=500)['resources']:
        if timezone.datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')) < cutoff:
            old.append(r['public_id'])
    if old:
        cloudinary.api.delete_resources(old, resource_type='raw')
    return len(old)


def run_backup():
    name = f'scaleezy-{timezone.now():%Y%m%d-%H%M}'
    with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
        path = tmp.name
    try:
        manifest = dump(path)
        public_id, size = upload(path, name)
        pruned = prune()
    finally:
        os.unlink(path)
    tables = sum(len(t) for t in manifest['schemas'].values())
    _save(last_backup_at=timezone.now().isoformat(), last_backup=name, last_backup_id=public_id,
          last_backup_bytes=size, last_backup_tables=tables, last_backup_error=None)
    return name, size, tables, pruned


# --------------------------------------------------------------- restore

def restore(archive_path, schema, into, cursor=None):
    """Load every table of `schema` from the archive into `into`, which must
    already have the tables (a migrated boutique schema, or the scratch
    schema the weekly test builds). Returns {table: rows loaded}."""
    loaded = {}
    own = cursor is None
    cursor = cursor or connection.cursor()
    try:
        with tarfile.open(archive_path, 'r:gz') as tar:
            manifest = json.load(tar.extractfile('manifest.json'))
            if schema not in manifest['schemas']:
                raise ValueError(f'{schema!r} is not in this archive; it has '
                                 f'{", ".join(manifest["schemas"])}')
            # The target is a freshly migrated schema, so its bookkeeping
            # tables already hold rows (content types, permissions, the
            # boutique's seeded settings). Every table is emptied and loaded
            # from the archive -- except django_migrations, which must say
            # what the *code* has applied, not what the archive remembers.
            tables = [t for t in manifest['schemas'][schema] if t != 'django_migrations']
            cursor.execute('SET CONSTRAINTS ALL DEFERRED')
            cursor.execute('TRUNCATE ' + ', '.join(_q(into, t) for t in tables) + ' CASCADE')
            for table in tables:
                raw = tar.extractfile(f'{schema}/{table}.csv').read()
                if not raw.strip():
                    loaded[table] = 0
                    continue
                cursor.copy_expert(
                    f'COPY {_q(into, table)} FROM STDIN WITH (FORMAT csv, HEADER)',
                    io.StringIO(raw.decode('utf-8')))
                cursor.execute(f'SELECT count(*) FROM {_q(into, table)}')
                loaded[table] = cursor.fetchone()[0]
            _reset_sequences(cursor, into)
    finally:
        if own:
            cursor.close()
    return loaded


def _reset_sequences(cursor, schema):
    cursor.execute("""
        SELECT c.relname, a.attname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = %s AND c.relkind = 'r'
          AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
    """, [schema])
    for table, column in cursor.fetchall():
        cursor.execute(
            f"SELECT setval(pg_get_serial_sequence(%s, %s), "
            f"COALESCE((SELECT max({column}) FROM {_q(schema, table)}), 0) + 1, false)",
            [f'{schema}.{table}', column])


def download(public_id, path):
    # Raw files are not served from the public delivery URL (401), so this
    # asks for a signed download link. The public_id is the one Cloudinary
    # answered the upload with: it appends an extension of its own choosing.
    import cloudinary.utils
    import requests
    url = cloudinary.utils.private_download_url(public_id, None, resource_type='raw', type='upload')
    with requests.get(url, stream=True, timeout=120) as res:
        res.raise_for_status()
        with open(path, 'wb') as fh:
            for chunk in res.iter_content(1 << 16):
                fh.write(chunk)


def run_restore_test():
    """Load the newest archive's largest boutique into a scratch schema inside
    a transaction that is always rolled back; compare with the manifest."""
    s = state()
    name, public_id = s.get('last_backup'), s.get('last_backup_id')
    if not public_id:
        raise RuntimeError('No backup has been taken yet.')
    with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
        path = tmp.name
    try:
        download(public_id, path)
        with tarfile.open(path, 'r:gz') as tar:
            manifest = json.load(tar.extractfile('manifest.json'))
        boutiques = {s: sum(t.values()) for s, t in manifest['schemas'].items() if s != 'public'}
        schema = max(boutiques, key=boutiques.get) if boutiques else 'public'
        expected = manifest['schemas'][schema]

        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA IF EXISTS {SCRATCH} CASCADE')
            cursor.execute(f'CREATE SCHEMA {SCRATCH}')
            for table in expected:
                cursor.execute(f'CREATE TABLE {_q(SCRATCH, table)} '
                               f'(LIKE {_q(schema, table)} INCLUDING DEFAULTS INCLUDING IDENTITY)')
            loaded = restore(path, schema, SCRATCH, cursor=cursor)
            mismatched = {t: (expected[t], loaded.get(t)) for t in expected
                          if t != 'django_migrations' and expected[t] != loaded.get(t)}
            transaction.set_rollback(True)
    finally:
        os.unlink(path)

    ok = not mismatched
    result = (f'{name}: {schema} restored, {sum(loaded.values())} rows in '
              f'{len(loaded)} tables match the manifest.' if ok else
              f'{name}: {schema} loaded but {len(mismatched)} table(s) differ from the '
              f'manifest: {mismatched}')
    _save(last_restore_test_at=timezone.now().isoformat(), last_restore_test_ok=ok,
          last_restore_test=result)
    return ok, result


# ---------------------------------------------------------------- health

def check():
    if not configured():
        return 'not_configured', ('CLOUDINARY_URL is not set, so there is nowhere to put a '
                                  'backup. Supabase free tier keeps none of its own.')
    s = state()
    now = timezone.now()
    if s.get('last_backup_error'):
        return 'critical', f'Last backup failed: {s["last_backup_error"]}'
    if not s.get('last_backup_at'):
        return 'critical', 'No backup has ever been taken. Add a nightly cron: manage.py backup'
    age = now - timezone.datetime.fromisoformat(s['last_backup_at'])
    if age > STALE_AFTER:
        return 'critical', (f'Last backup is {age.days}d {age.seconds // 3600}h old '
                            f'({s["last_backup"]}). The nightly cron has stopped.')
    detail = (f'{s["last_backup"]}: {s["last_backup_tables"]} tables, '
              f'{s["last_backup_bytes"] / 1e6:.1f} MB, {int(age.total_seconds() // 3600)}h ago. ')
    if not s.get('last_restore_test_at'):
        return 'warning', detail + 'Never restore-tested: add a weekly cron: manage.py backup --restore-test'
    tested = now - timezone.datetime.fromisoformat(s['last_restore_test_at'])
    if not s.get('last_restore_test_ok'):
        return 'critical', detail + f'Restore test FAILED: {s["last_restore_test"]}'
    if tested > RESTORE_TEST_EVERY:
        return 'warning', detail + f'Last restore test was {tested.days} days ago.'
    return 'healthy', detail + f'Restore test {tested.days}d ago passed.'
