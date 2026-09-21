"""Workroom media goes a few days after delivery, and not before."""

import os
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection
from django.test.utils import override_settings
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase

from crm_api.models import Customer, Order, OrderActivity, OrderStage, OrderStageHistory
from domains.orders import retention


class RetentionTests(TenantTestCase):

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        media_root = tempfile.mkdtemp(prefix='retention-test-media-')
        self.addCleanup(shutil.rmtree, media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media_root)
        override.enable()
        self.addCleanup(override.disable)
        self.customer = Customer.objects.create(
            first_name='Anita', last_name='Rao', mobile_number='+919000000002',
            email_address='anita@example.com', garment_type='Lehenga')

    def _file(self, path):
        """A stored file and the absolute URL the app records for it."""
        name = default_storage.save(path, ContentFile(b'bytes'))
        return 'http://testserver' + default_storage.url(name)

    def _stored(self, url):
        return default_storage.exists(url.split('/media/', 1)[1])

    def _delivered_order(self, days_ago):
        order = Order.objects.create(
            order_id=f'T2B-{days_ago}', customer=self.customer, order_status='Delivered',
            instructions_voice_note=self._file('voice_notes/instr.webm'))
        stitching = OrderStage.objects.create(
            order=order, stage_key='stitching_in_progress', stage_name='Stitching',
            status='COMPLETED', voice_note=self._file('voice_notes/stage.webm'),
            attachments=[self._file('stage_attachments/a.jpg'), self._file('stage_attachments/b.jpg')])
        stitching.attachment_reviews = {stitching.attachments[0]: {'status': 'REJECTED'}}
        stitching.save()
        OrderStage.objects.create(
            order=order, stage_key='delivered', stage_name='Delivery', status='COMPLETED',
            completed_at=timezone.now() - timedelta(days=days_ago))
        OrderActivity.objects.create(
            order=order, event_type='STAGE_NOTE',
            metadata={'voice_note': self._file('voice_notes/replaced.webm'), 'comments': 'hi'})
        OrderStageHistory.objects.create(order=order, stage='stitching_in_progress')
        return order

    def test_purges_everything_after_the_window(self):
        order = self._delivered_order(days_ago=4)
        stage = order.stages.get(stage_key='stitching_in_progress')
        urls = [order.instructions_voice_note, stage.voice_note, *stage.attachments,
                order.activities.get(event_type='STAGE_NOTE').metadata['voice_note']]
        self.assertTrue(all(self._stored(u) for u in urls))

        self.assertEqual(retention.purge_due_orders(), (1, 0))

        self.assertFalse(any(self._stored(u) for u in urls))
        order.refresh_from_db()
        stage.refresh_from_db()
        self.assertIsNotNone(order.media_purged_at)
        self.assertEqual(order.instructions_voice_note, '')
        self.assertEqual(stage.attachments, [])
        self.assertEqual(stage.attachment_reviews, {})
        self.assertEqual(stage.voice_note, '')
        self.assertEqual(stage.voice_note_by, '')
        self.assertEqual(order.activities.get(event_type='STAGE_NOTE').metadata['voice_note'], '')
        self.assertTrue(order.activities.filter(event_type='MEDIA_PURGED').exists())
        # Second run finds nothing.
        self.assertEqual(retention.purge_due_orders(), (0, 0))

    def test_leaves_recent_deliveries_alone(self):
        order = self._delivered_order(days_ago=1)
        self.assertEqual(retention.purge_due_orders(), (0, 0))
        order.refresh_from_db()
        self.assertIsNone(order.media_purged_at)
        self.assertTrue(self._stored(order.instructions_voice_note))
        self.assertEqual(len(order.stages.get(stage_key='stitching_in_progress').attachments), 2)

    def test_reopened_order_is_not_purged(self):
        order = self._delivered_order(days_ago=4)
        order.order_status = 'Quality Check'
        order.save()
        self.assertEqual(retention.purge_due_orders(), (0, 0))

    def test_a_failed_delete_keeps_the_url_and_the_order_for_next_run(self):
        order = self._delivered_order(days_ago=4)
        stage = order.stages.get(stage_key='stitching_in_progress')
        stubborn = stage.attachments[1]
        real = retention._delete_url

        def flaky(url):
            return False if url == stubborn else real(url)

        with mock.patch.object(retention, '_delete_url', side_effect=flaky):
            self.assertEqual(retention.purge_due_orders(), (0, 1))

        order.refresh_from_db()
        stage.refresh_from_db()
        self.assertIsNone(order.media_purged_at)
        self.assertEqual(stage.attachments, [stubborn])
        self.assertTrue(self._stored(stubborn))
        self.assertEqual(order.instructions_voice_note, '')  # the rest still went
        self.assertFalse(order.activities.filter(event_type='MEDIA_PURGED').exists())

        # Storage back: the next run finishes it.
        self.assertEqual(retention.purge_due_orders(), (1, 0))
        order.refresh_from_db()
        self.assertIsNotNone(order.media_purged_at)
        self.assertFalse(self._stored(stubborn))

    def test_cloudinary_urls_are_parsed_into_public_ids(self):
        with mock.patch('cloudinary.uploader.destroy', return_value={'result': 'ok'}) as destroy:
            self.assertTrue(retention._delete_url(
                'https://res.cloudinary.com/demo/video/upload/v1/media/voice_notes/abc_x1'))
        destroy.assert_called_once_with('media/voice_notes/abc_x1', resource_type='video', invalidate=True)
        with mock.patch('cloudinary.uploader.destroy', return_value={'result': 'not found'}):
            self.assertTrue(retention._delete_url(
                'https://res.cloudinary.com/demo/image/upload/media/stage_attachments/o_1/p.jpg'))
        with mock.patch('cloudinary.uploader.destroy', side_effect=RuntimeError('down')):
            self.assertFalse(retention._delete_url(
                'https://res.cloudinary.com/demo/image/upload/v1/media/x'))
        # A link that was never ours is dropped without a storage call.
        self.assertTrue(retention._delete_url('https://example.com/some/picture.jpg'))
