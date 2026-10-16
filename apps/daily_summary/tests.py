from datetime import date, datetime, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core import mail
from django.core.management import CommandError, call_command
from django.db import connection
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.models import GarmentJob, GarmentTemplate
from apps.design_studio.models import DesignAssignment, Designer
from apps.finance.models import Payment
from apps.staff.models import StaffProfile
from apps.todos.models import Todo
from crm_api.models import BoutiqueSettings, Customer, Order, OrderStage, Tailor
from tenants.models import WhatsAppAccount

from . import send, summary, text
from .models import DailySummaryLog, SummaryPreference

IST = ZoneInfo('Asia/Kolkata')
DAY = date(2026, 10, 16)
NOW = datetime(2026, 10, 16, 23, 10, tzinfo=IST)


def at(hour, minute=0, day=DAY):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)


class DailySummaryTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@summary.test'
        tenant.name = 'Summary Atelier'
        tenant.timezone = 'Asia/Kolkata'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        timezone.activate(IST)
        self.addCleanup(timezone.deactivate)
        # Never the real WhatsApp service from a test; tests that need it patch over this.
        for name, value in (('get_whatsapp_status', {'connected': False}),
                            ('send_whatsapp_message', {'success': False})):
            patcher = mock.patch(f'crm_api.whatsapp_service.{name}', return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.owner = self._user('owner@summary.test')
        self.master, self.meera = self._staff('Meera', 'Master')
        self.anita_user, self.anita = self._staff('Anita', 'Tailor')
        StaffProfile.objects.create(staff=self.anita, phone='9876543210')
        self.ravi_user, self.ravi = self._staff('Ravi', 'Tailor')
        self.dia_user = self._user('dia@summary.test')
        self.dia = Designer.objects.create(name='Dia', email='dia@summary.test',
                                           phone='9123456780', user=self.dia_user)
        self.template = GarmentTemplate.objects.create(key='blouse', name='Blouse',
                                                       version=1, sequence=0)
        self.customer = self._customer('Lata', '9000000001', created=at(10, day=DAY - timedelta(days=30)))
        self.order = self._order('O1', total=5000, placed=at(11), due=DAY + timedelta(days=5))

    # -- fixtures ---------------------------------------------------------

    def _user(self, email):
        return User.objects.create_user(username=email, email=email, password='pass12345678')

    def _staff(self, name, role):
        user = self._user(f'{name.lower()}@summary.test')
        return user, Tailor.objects.create(name=name, specialty='x', role=role,
                                           user=user, email=user.email)

    def _customer(self, name, mobile, created, lead=False):
        customer = Customer.objects.create(first_name=name, last_name='K',
                                           mobile_number=mobile, is_lead=lead)
        Customer.objects.filter(pk=customer.pk).update(created_at=created)
        return customer

    def _order(self, ref, total, placed, due=None, status='Received'):
        order = Order.objects.create(order_id=ref, customer=self.customer, total_amount=total,
                                     estimated_delivery=due, order_status=status)
        Order.objects.filter(pk=order.pk).update(order_date=placed)
        order.refresh_from_db()
        return order

    def _stage(self, order=None, key='stitching_in_progress', name='Stitching', **fields):
        fields.setdefault('sla_hours', 24)
        return OrderStage.objects.create(order=order or self.order, stage_key=key,
                                         stage_name=name, **fields)

    def _job(self, sequence):
        return GarmentJob.objects.create(order=self.order, template=self.template,
                                         template_version=1, sequence=sequence)

    def floor(self):
        return summary.Floor(DAY, IST, NOW)

    def text_for(self, user, role, profile=None):
        return send.compose(self.tenant, 'Summary Atelier', DAY, self.floor(), user, role, profile)

    # -- what each role is told ---------------------------------------------

    def test_owner_summary_reads_dated_money_and_the_boutique_day(self):
        Payment.objects.create(order=self.order, amount=Decimal('2000'), received_on=DAY)
        Payment.objects.create(order=self.order, amount=Decimal('999'), received_on=DAY - timedelta(days=1))
        self._order('O2', total=7000, placed=at(12), status='Cancelled')
        self._order('O3', total=1000, placed=at(9, day=DAY - timedelta(days=9)),
                    due=DAY - timedelta(days=2))
        old = self._order('O4', total=800, placed=at(9, day=DAY - timedelta(days=9)), status='Delivered')
        self._stage(old, 'delivered', 'Delivery', status='COMPLETED', completed_at=at(15))
        older = self._order('O5', total=800, placed=at(9, day=DAY - timedelta(days=9)), status='Delivered')
        # 23:45 IST yesterday is 18:15 UTC -- the same UTC date as today's 11 PM run.
        self._stage(older, 'delivered', 'Delivery', status='COMPLETED',
                    completed_at=at(23, 45, DAY - timedelta(days=1)))
        self._stage(status='PENDING_VERIFICATION', assigned_to=self.anita)
        self._customer('New', '9000000002', created=at(13))
        self._customer('Lead', '9000000003', created=at(14), lead=True)
        self._customer('OldLead', '9000000004', created=at(9, day=DAY - timedelta(days=3)), lead=True)

        text = self.text_for(self.owner, 'Owner')

        self.assertIn('Collected today: ₹2,000', text)
        self.assertIn('New orders booked today: ₹5,000 (1 orders)', text)
        self.assertIn('Outstanding from customers: ₹6,000', text)  # O1 5000 + O3 1000
        self.assertIn('Delivered today: 1', text)
        self.assertIn('Overdue: 1', text)
        self.assertIn('Work to check: 1', text)
        self.assertIn('New customers today: 1', text)
        self.assertIn('New leads today: 1', text)
        self.assertIn('Leads awaiting contact: 2', text)
        self.assertIn('Present today: 0', text)
        self.assertNotIn('bsent', text)

    def test_staff_get_their_own_work_credited_to_whoever_did_it(self):
        self._stage(status='COMPLETED', assigned_to=self.ravi, performed_by=self.anita,
                    started_at=at(9), completed_at=at(14))
        redo = self._stage(status='IN_PROGRESS', assigned_to=self.anita, started_at=at(9),
                           verification_note='Hem is uneven', sla_hours=4)
        Todo.objects.create(title='From the step', assigned_to=self.anita_user, order_stage=redo)
        Todo.objects.create(title='Buy thread', assigned_to=self.anita_user)

        text = self.text_for(self.anita_user, 'Tailor', self.anita)

        self.assertIn('Completed today (checked): 1', text)
        self.assertIn('Sent back to redo: 1', text)
        self.assertIn('Overdue: 1', text)
        self.assertIn('Pending: 1', text)
        self.assertIn('Open to-dos: 1', text)  # the step's own to-do is not counted again
        self.assertIn('• Stitching · ', text)
        # Ravi was assigned the finished step but did not do it, and has nothing else.
        self.assertIsNone(self.text_for(self.ravi_user, 'Tailor', self.ravi))

    def test_master_sees_the_floor_and_their_own_work_apart(self):
        self._stage(status='PENDING_VERIFICATION', assigned_to=self.anita, performed_by=self.anita)
        self._stage(status='PAUSED')
        self._stage(status='IN_PROGRESS', assigned_to=self.meera)

        text = self.text_for(self.master, 'Master', self.meera)

        floor, own = text.split('Your own work')
        self.assertIn('Waiting for your check: 1', floor)
        self.assertIn('Ready to assign: 1', floor)
        self.assertIn('• Stitching: 1', floor)
        self.assertIn('Pending: 1', own)

    def test_designer_sees_only_their_own_design_work(self):
        DesignAssignment.objects.create(garment_job=self._job(0), designer=self.dia,
                                        status='SUBMITTED', submitted_at=at(10))
        DesignAssignment.objects.create(garment_job=self._job(1), designer=self.dia,
                                        status='APPROVED', submitted_at=at(9, day=DAY - timedelta(days=1)),
                                        reviewed_at=at(12))
        DesignAssignment.objects.create(garment_job=self._job(2), designer=self.dia,
                                        due_date=DAY - timedelta(days=1))

        text = self.text_for(self.dia_user, 'Designer', self.dia)

        self.assertIn('Submitted today: 1', text)
        self.assertIn('Approved today: 1', text)
        self.assertIn('Waiting for review: 1', text)
        self.assertIn('Assigned, not yet submitted: 1', text)
        self.assertIn('Overdue: 1', text)
        self.assertNotIn('assign', text.replace('Assigned', ''))

    def test_the_admin_handed_leads_hears_about_leads(self):
        self._customer('Lead', '9000000003', created=at(14), lead=True)
        settings = BoutiqueSettings.objects.get_or_create(id=1)[0]
        settings.admin_access = {'member': {'kind': 'staff', 'id': self.ravi.id},
                                 'tasks': ['customers.leads']}
        settings.save()

        text = self.text_for(self.ravi_user, 'Tailor', self.ravi)

        self.assertIn('Leads awaiting contact: 1', text)
        self.assertIsNone(self.text_for(self.anita_user, 'Tailor', self.anita))

    # -- sending ------------------------------------------------------------

    def test_due_only_in_the_boutiques_own_eleven_pm_hour(self):
        self.assertTrue(send.due(self.tenant, at(23, 0)))
        self.assertTrue(send.due(self.tenant, at(23, 59)))
        self.assertFalse(send.due(self.tenant, at(22, 59)))
        self.tenant.timezone = 'Asia/Dubai'  # 23:10 IST is 21:40 there
        self.assertFalse(send.due(self.tenant, NOW))

    @mock.patch('crm_api.whatsapp_service.get_whatsapp_status', return_value={'connected': True})
    @mock.patch('crm_api.whatsapp_service.send_whatsapp_message')
    def test_whatsapp_first_email_on_failure_owner_by_email_and_never_twice(self, sender, _status):
        WhatsAppAccount.objects.create(tenant=self.tenant, session_id='summary-s1')
        self._stage(status='IN_PROGRESS', assigned_to=self.anita)
        DesignAssignment.objects.create(garment_job=self._job(0), designer=self.dia)
        sender.side_effect = lambda phone, **kw: (
            {'success': True, 'data': {'messageId': 'm1'}} if phone == '919123456780'
            else {'success': False, 'status_code': 503, 'data': {'message': 'not connected'}})

        counts = send.send_for_tenant(self.tenant, NOW)

        logs = {log.user_id: log for log in DailySummaryLog.objects.all()}
        self.assertEqual(logs[self.dia_user.id].channel, 'whatsapp')
        self.assertEqual(logs[self.anita_user.id].channel, 'email')
        self.assertIn('WhatsApp failed', logs[self.anita_user.id].error)
        self.assertEqual(logs[self.owner.id].channel, 'email')
        self.assertEqual(logs[self.ravi_user.id].status, DailySummaryLog.STATUS_SKIPPED)
        self.assertTrue(all(c.kwargs['session_id'] == 'summary-s1' for c in sender.call_args_list))
        self.assertEqual(sender.call_count, 2)  # Dia and Anita; never the owner
        self.assertEqual(sorted(m.to[0] for m in mail.outbox),
                         ['anita@summary.test', 'owner@summary.test'])
        self.assertEqual(counts, {'SENT': 3, 'SKIPPED': 2})  # Meera has nothing either

        self.assertEqual(send.send_for_tenant(self.tenant, NOW + timedelta(minutes=15)), {})
        self.assertEqual(sender.call_count, 2)
        self.assertEqual(len(mail.outbox), 2)

    @mock.patch('crm_api.whatsapp_service.get_whatsapp_status', return_value={'connected': True})
    @mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                return_value={'success': True, 'data': {'messageId': 'm1'}})
    def test_no_own_whatsapp_account_uses_the_shared_default_session(self, sender, status):
        self._stage(status='IN_PROGRESS', assigned_to=self.anita)
        self._stage(status='IN_PROGRESS', assigned_to=self.ravi)  # Ravi has no mobile

        send.send_for_tenant(self.tenant, NOW)

        status.assert_called_once_with(session_id='default')
        sender.assert_called_once()
        self.assertEqual(sender.call_args.kwargs['session_id'], 'default')
        self.assertEqual(sender.call_args.kwargs['phone'], '919876543210')
        self.assertIn('Summary Atelier', sender.call_args.kwargs['message_text'])
        self.assertEqual(sorted(m.to[0] for m in mail.outbox),
                         ['owner@summary.test', 'ravi@summary.test'])

    @mock.patch('crm_api.whatsapp_service.get_whatsapp_status', return_value={'connected': False})
    @mock.patch('crm_api.whatsapp_service.send_whatsapp_message')
    def test_a_disconnected_session_means_email(self, sender, _status):
        self._stage(status='IN_PROGRESS', assigned_to=self.anita)
        send.send_for_tenant(self.tenant, NOW)
        sender.assert_not_called()
        self.assertIn('anita@summary.test', [m.to[0] for m in mail.outbox])

    @mock.patch('apps.email_service.services.email_service.EmailService.send_email')
    def test_a_failed_send_is_retried_by_the_next_run_up_to_the_limit(self, email):
        email.return_value = False
        for _ in range(send.MAX_ATTEMPTS + 1):
            send.send_for_tenant(self.tenant, NOW)
        log = DailySummaryLog.objects.get(user=self.owner)
        self.assertEqual(log.status, DailySummaryLog.STATUS_FAILED)
        self.assertEqual(log.attempts, send.MAX_ATTEMPTS)
        email.return_value = True
        send.send_for_tenant(self.tenant, NOW)
        self.assertEqual(DailySummaryLog.objects.get(user=self.owner).status,
                         DailySummaryLog.STATUS_FAILED)

    def test_testing_mode_resends_every_run_and_logs_nothing(self):
        send.send_for_tenant(self.tenant, NOW, dedup=False)
        send.send_for_tenant(self.tenant, NOW, dedup=False)
        self.assertEqual([m.to[0] for m in mail.outbox], ['owner@summary.test'] * 2)
        self.assertFalse(DailySummaryLog.objects.exists())
        with self.assertRaisesMessage(CommandError, '--schema'):
            call_command('send_daily_summaries', '--test-every', '60')

    def test_the_command_runs_every_boutique_in_its_own_schema(self):
        out = StringIO()
        call_command('send_daily_summaries', '--ignore-window', '--schema', self.tenant.schema_name,
                     stdout=out)
        self.assertIn('sent 1', out.getvalue())
        connection.set_tenant(self.tenant)
        self.assertEqual(DailySummaryLog.objects.get(user=self.owner).status,
                         DailySummaryLog.STATUS_SENT)

    # -- the owner's Daily Summary Notifications settings ---------------------

    def api(self, user, method, path, data=None):
        token, _ = Token.objects.get_or_create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                           HTTP_X_TENANT_ID=self.tenant.schema_name)
        response = getattr(client, method)(path, data or {}, format='json')
        connection.set_tenant(self.tenant)
        return response

    def settings_rows(self):
        response = self.api(self.owner, 'get', '/api/daily-summary/settings/')
        self.assertEqual(response.status_code, 200, response.data)
        return {row['name']: row for row in response.data}

    def test_everyone_starts_on_and_in_english(self):
        rows = self.settings_rows()
        self.assertEqual(set(rows), {'Owner', 'Meera', 'Anita', 'Ravi', 'Dia'})
        self.assertTrue(all(r['enabled'] and r['language'] == 'en' for r in rows.values()))
        self.assertEqual(rows['Owner']['channel'], 'email')
        self.assertEqual(rows['Anita']['channel'], 'whatsapp')  # has a mobile
        self.assertEqual(rows['Ravi']['channel'], 'email')
        self.assertFalse(SummaryPreference.objects.exists())

    def test_owner_switches_people_off_and_picks_each_language_including_their_own(self):
        off = self.api(self.owner, 'patch', f'/api/daily-summary/settings/{self.anita_user.id}/',
                       {'enabled': False})
        self.assertEqual(off.status_code, 200, off.data)
        lang = self.api(self.owner, 'patch', f'/api/daily-summary/settings/{self.dia_user.id}/',
                        {'language': 'te'})
        own = self.api(self.owner, 'patch', f'/api/daily-summary/settings/{self.owner.id}/',
                       {'language': 'hi'})
        self.assertEqual((lang.data['language'], own.data['language']), ('te', 'hi'))

        rows = self.settings_rows()
        self.assertFalse(rows['Anita']['enabled'])
        self.assertEqual(rows['Anita']['language'], 'en')
        self.assertEqual(rows['Dia']['language'], 'te')
        self.assertEqual(rows['Owner']['language'], 'hi')

    def test_only_supported_languages_and_only_this_boutiques_people(self):
        bad = self.api(self.owner, 'patch', f'/api/daily-summary/settings/{self.anita_user.id}/',
                       {'language': 'ta'})
        self.assertEqual(bad.status_code, 400)
        # A login that is not this boutique's owner or on its roster, as another
        # boutique's staff would be, cannot be reached through here.
        stranger = User.objects.create_user('someone@else.test', 'someone@else.test', 'pass12345678')
        missing = self.api(self.owner, 'patch', f'/api/daily-summary/settings/{stranger.id}/',
                           {'enabled': False})
        self.assertEqual(missing.status_code, 404)
        self.assertFalse(SummaryPreference.objects.exists())

    def test_staff_cannot_read_or_change_the_settings(self):
        for user in (self.master, self.anita_user, self.dia_user):
            self.assertEqual(self.api(user, 'get', '/api/daily-summary/settings/').status_code, 403)
            self.assertEqual(self.api(user, 'patch', f'/api/daily-summary/settings/{user.id}/',
                                      {'enabled': False}).status_code, 403)

    # -- the summary in each language --------------------------------------------

    def test_telugu_and_hindi_translate_every_label_but_keep_the_data(self):
        self._stage(status='IN_PROGRESS', assigned_to=self.anita, started_at=at(9),
                    verification_note='Hem is uneven', sla_hours=4)
        floor = self.floor()
        with self.assertNoLogs('apps.daily_summary.text', 'WARNING'):
            te = summary.staff_summary(self.tenant, 'Summary Atelier', DAY, floor,
                                       self.anita_user, self.anita, 'te')
            hi = summary.owner_summary(self.tenant, 'Summary Atelier', DAY, floor, 'hi')
            for lang in ('hi', 'te'):
                summary.master_summary(self.tenant, 'Summary Atelier', DAY, floor,
                                       self.master, self.meera, lang)

        self.assertIn('రోజువారీ సారాంశం · 16/10/2026', te)
        self.assertIn('మళ్లీ చేయడానికి తిరిగి పంపినవి: 1', te)
        self.assertIn(f'• కుట్టు · {self.order.reference}', te)  # default step name translated
        self.assertNotIn('Sent back', te)
        self.assertIn('आज मिली राशि: ₹0', hi)
        self.assertIn('ग्राहकों से बकाया: ₹5,000', hi)
        self.assertNotIn('Collected today', hi)

    def test_a_step_the_boutique_named_itself_stays_as_written(self):
        self._stage(status='IN_PROGRESS', assigned_to=self.anita, name='Zardozi border')
        te = summary.staff_summary(self.tenant, 'Summary Atelier', DAY, self.floor(),
                                   self.anita_user, self.anita, 'te')
        self.assertIn('• Zardozi border', te)

    def test_both_translations_carry_every_phrase_and_a_gap_is_logged(self):
        self.assertEqual(set(text.TEXT['hi']), set(text.TEXT['te']))
        self.assertEqual(set(text.STEPS['hi']), set(text.STEPS['te']))
        with self.assertLogs('apps.daily_summary.text', 'WARNING'):
            self.assertEqual(text.t('te', 'A phrase nobody translated'), 'A phrase nobody translated')

    @mock.patch('crm_api.whatsapp_service.get_whatsapp_status', return_value={'connected': True})
    @mock.patch('crm_api.whatsapp_service.send_whatsapp_message',
                return_value={'success': True, 'data': {'messageId': 'm1'}})
    def test_one_evening_each_in_their_own_language_and_disabled_people_skipped(self, sender, _s):
        WhatsAppAccount.objects.create(tenant=self.tenant, session_id='summary-s1')
        self._stage(status='IN_PROGRESS', assigned_to=self.anita)
        self._stage(status='IN_PROGRESS', assigned_to=self.ravi)
        DesignAssignment.objects.create(garment_job=self._job(0), designer=self.dia)
        SummaryPreference.objects.create(user=self.anita_user, language='te')
        SummaryPreference.objects.create(user=self.dia_user, language='hi')
        SummaryPreference.objects.create(user=self.ravi_user, enabled=False)

        send.send_for_tenant(self.tenant, NOW)

        by_phone = {c.kwargs['phone']: c.kwargs['message_text'] for c in sender.call_args_list}
        self.assertIn('మీ పని', by_phone['919876543210'])          # Anita, Telugu
        self.assertIn('आपके डिज़ाइन', by_phone['919123456780'])     # Dia, Hindi
        self.assertEqual([m.to[0] for m in mail.outbox], ['owner@summary.test'])
        self.assertIn('Daily summary', mail.outbox[0].body)        # owner, English
        self.assertEqual(mail.outbox[0].subject, 'Summary Atelier · daily summary')
        self.assertFalse(DailySummaryLog.objects.filter(user=self.ravi_user).exists())

        # Switched back on later the same evening: Ravi still gets that day's, once.
        SummaryPreference.objects.filter(user=self.ravi_user).update(enabled=True)
        send.send_for_tenant(self.tenant, NOW + timedelta(minutes=15))
        send.send_for_tenant(self.tenant, NOW + timedelta(minutes=30))
        self.assertEqual([m.to[0] for m in mail.outbox],
                         ['owner@summary.test', 'ravi@summary.test'])
