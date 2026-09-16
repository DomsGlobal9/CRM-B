"""The guardian speaks only when something changed, and once a morning otherwise."""
from datetime import datetime, timedelta
from unittest import mock

from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from . import guardian, health
from .models import ErrorEvent, PlatformSetting

TZ = timezone.get_current_timezone()
QUIET = [{'key': 'database', 'label': 'Database', 'status': 'healthy', 'detail': 'ok'}]
DOWN = [{'key': 'database', 'label': 'Database', 'status': 'offline', 'detail': 'no route'}]


def at(hour, day=1):
    return datetime(2026, 9, day, hour, 0, tzinfo=TZ)


@override_settings(GUARDIAN_WHATSAPP_NUMBER='919000000000')
class GuardianTests(TransactionTestCase):

    def setUp(self):
        connection.set_schema_to_public()
        PlatformSetting.objects.filter(key=guardian.STATE_KEY).delete()
        ErrorEvent.objects.all().delete()
        self.sent = []
        self.send = lambda text: self.sent.append(text) or None

    def tick(self, checks, when):
        with mock.patch.object(health, 'checks', return_value=checks):
            return guardian.run(send=self.send, now=when)

    def crash(self, seen, **kw):
        fields = dict(kind='crash', fingerprint=f'fp{seen.timestamp():.0f}{kw.get("path", "")}'[:40],
                      exception_type='ValueError', message='boom', path='/api/orders/',
                      method='POST', boutique='meera', severity='high', status='new')
        event = ErrorEvent.objects.create(**{**fields, **kw})
        # last_seen is auto_now; update() is the only way to place it in time.
        ErrorEvent.objects.filter(pk=event.pk).update(last_seen=seen)
        return event

    def test_nothing_changed_nothing_sent(self):
        self.tick(QUIET, at(3))
        self.tick(QUIET, at(3) + timedelta(minutes=5))
        self.assertEqual(self.sent, [])

    def test_a_crash_since_the_last_tick_is_sent_once(self):
        self.tick(QUIET, at(3))
        self.crash(seen=at(3) + timedelta(minutes=2))
        self.tick(QUIET, at(3) + timedelta(minutes=5))
        self.tick(QUIET, at(3) + timedelta(minutes=10))
        self.assertEqual(len(self.sent), 1)
        self.assertIn('ValueError at POST /api/orders/ — meera', self.sent[0])

    def test_a_check_turning_bad_and_recovering_are_each_sent_once(self):
        self.tick(QUIET, at(3))
        self.tick(DOWN, at(3) + timedelta(minutes=5))
        self.tick(DOWN, at(3) + timedelta(minutes=10))
        self.tick(QUIET, at(3) + timedelta(minutes=15))
        self.assertEqual(len(self.sent), 2)
        self.assertIn('Database: offline — no route', self.sent[0])
        self.assertIn('Recovered: database', self.sent[1])

    def test_one_all_quiet_line_a_morning(self):
        self.tick(QUIET, at(8, day=1))
        self.tick(QUIET, at(9, day=1))
        self.tick(QUIET, at(12, day=1))
        self.tick(QUIET, at(9, day=2))
        self.assertEqual(len(self.sent), 2)
        self.assertTrue(all(m.startswith('✅') for m in self.sent))

    def test_a_failed_send_is_remembered_and_shown_on_the_health_page(self):
        self.crash(seen=at(2))
        message, error = self.tick(QUIET, at(3))
        self.assertIsNone(error)
        self.crash(seen=at(2, 2), path='/api/customers/')
        with mock.patch.object(health, 'checks', return_value=QUIET):
            _, error = guardian.run(send=lambda text: 'socket refused', now=at(3, 2))
        self.assertEqual(error, 'socket refused')
        with mock.patch.object(timezone, 'localtime', return_value=at(3, 2) + timedelta(minutes=1)):
            status, detail = guardian.check()
        self.assertEqual(status, 'critical')
        self.assertIn('socket refused', detail)

    def test_a_stopped_cron_shows_as_degraded(self):
        self.tick(QUIET, at(3))
        with mock.patch.object(timezone, 'localtime', return_value=at(3) + timedelta(hours=1)):
            status, detail = guardian.check()
        self.assertEqual(status, 'degraded')
        self.assertIn('cron has stopped', detail)

    @override_settings(GUARDIAN_WHATSAPP_NUMBER='')
    def test_unset_number_is_not_configured_and_send_refuses(self):
        self.assertEqual(guardian.check()[0], 'not_configured')
        self.assertIn('GUARDIAN_WHATSAPP_NUMBER', guardian.send_whatsapp('hi'))


class ConfigurationCheckTests(TransactionTestCase):

    @override_settings(DEBUG=True, PASSWORD_RESET_BASE_URL='http://localhost:5173/app.html')
    def test_development_defaults_are_named(self):
        with mock.patch.dict('os.environ', {'RENDER': 'true'}):
            status, detail = health._configuration()
        self.assertEqual(status, 'critical')
        self.assertIn('DEBUG is on', detail)
        self.assertIn('PASSWORD_RESET_BASE_URL', detail)

    @override_settings(DEBUG=False, SECRET_KEY='x' * 50, ALLOWED_HOSTS=['crm.example'],
                       CORS_ALLOW_ALL_ORIGINS=False, PASSWORD_RESET_BASE_URL='https://crm.example/app.html',
                       INTERNAL_API_SECRET='y' * 40, CUSTOMER_MESSAGE_BACKEND='',
                       WHATSAPP_SERVICE_URL='https://wa.example')
    def test_a_clean_production_is_healthy(self):
        self.assertEqual(health._configuration()[0], 'healthy')
