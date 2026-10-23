"""Customer try-on: the link sent with a garment's photos, the public page it
opens, and the TryOn2Buy call that dresses the customer's photo."""
import base64
import os
import shutil
import tempfile
from unittest import mock

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client, override_settings
from django.utils import timezone

from core.test_images import JPEG
from crm_api.models import GarmentImage, GarmentTryOn, Order
from crm_api.serializers import OrderSerializer
from crm_api.test_state_machine import StateMachineTestBase
from domains.orders import tryon
from domains.orders.messaging import send_customer_garment_photos

POST = 'domains.orders.tryon.requests.post'


def vendor_answer(status=200, body=None):
    answer = mock.Mock(status_code=status, ok=200 <= status < 300)
    answer.json.return_value = body if body is not None else {
        'success': True, 'resultBase64': base64.b64encode(JPEG).decode()}
    return answer


class GarmentTryOnTests(StateMachineTestBase):

    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.media, TRYON_API_KEY='test-key')
        self.settings_override.enable()
        self.tenant.enabled_modules = {'try_on': True}
        self.tenant.save()
        self.job = self.order.garment_jobs.get()
        self.front = GarmentImage.objects.create(
            order=self.order, garment_job=self.job, view='FRONT', sent_at=timezone.now(),
            image=SimpleUploadedFile('front.jpg', JPEG, content_type='image/jpeg'))

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        super().tearDown()

    def path(self):
        return f"/try-on/{tryon.build_token(self.order, self.job)}/"

    def get(self):
        res = Client().get(self.path())
        connection.set_tenant(self.tenant)
        return res

    def upload(self):
        res = Client().post(self.path(), {'photo': SimpleUploadedFile('me.jpg', JPEG, content_type='image/jpeg')})
        connection.set_tenant(self.tenant)
        return res

    def test_the_photos_message_carries_the_try_on_link(self):
        message = send_customer_garment_photos(self.order, self.job.display_name, [self.front])
        self.assertIn('/track/', message.body)
        self.assertIn('/try-on/', message.body)

    def test_with_the_module_off_there_is_no_link_and_no_page(self):
        self.tenant.enabled_modules = {'try_on': False}
        self.tenant.save()
        message = send_customer_garment_photos(self.order, self.job.display_name, [self.front])
        self.assertIn('/track/', message.body)
        self.assertNotIn('/try-on/', message.body)
        self.assertEqual(self.get().status_code, 404)

    def test_without_the_key_there_is_no_link(self):
        with override_settings(TRYON_API_KEY=''):
            message = send_customer_garment_photos(self.order, self.job.display_name, [self.front])
        self.assertNotIn('/try-on/', message.body)

    def test_the_page_shows_the_garment_and_the_upload(self):
        res = self.get()
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, self.front.image.url)
        self.assertContains(res, 'name="photo"')
        self.assertContains(res, '3 of 3 try-ons left')

    def test_a_bad_link_is_not_found(self):
        res = Client().get('/try-on/not-a-real-token/')
        connection.set_tenant(self.tenant)
        self.assertEqual(res.status_code, 404)

    def test_an_upload_dresses_the_customer_and_their_photo_is_not_kept(self):
        with mock.patch(POST, return_value=vendor_answer()) as call:
            res = self.upload()
        self.assertEqual(res.status_code, 302)
        self.assertIn('made=1', res['Location'])
        sent = call.call_args.kwargs
        self.assertEqual(sent['headers'], {'x-api-key': 'test-key'})
        self.assertEqual(sent['json']['category'], 'DEFAULT')  # a blouse is "any other outfit"
        self.assertTrue(sent['json']['returnBase64'])
        self.assertIn(self.front.image.url, sent['json']['garmentImageUrl'])
        self.assertIn('/tryon_uploads/', sent['json']['humanImageUrl'])

        made = GarmentTryOn.objects.get()
        self.assertEqual(made.status, GarmentTryOn.DONE)
        self.assertTrue(made.result_image)
        left = [f for _root, _dirs, files in os.walk(os.path.join(self.media, 'tryon_uploads')) for f in files]
        self.assertEqual(left, [])
        # The boutique sees it on the order; the page shows it to the customer.
        order = Order.objects.get(pk=self.order.pk)
        self.assertEqual(len(OrderSerializer(order).data['garment_tryons']), 1)
        page = self.get()
        self.assertContains(page, made.result_image.url)
        self.assertContains(page, '2 of 3 try-ons left')

    def test_a_saree_is_sent_as_a_saree(self):
        self.template.key = 'saree'
        self.template.save()
        with mock.patch(POST, return_value=vendor_answer()) as call:
            self.upload()
        self.assertEqual(call.call_args.kwargs['json']['category'], 'SAREE')

    def test_three_tries_and_then_no_more(self):
        with mock.patch(POST, return_value=vendor_answer()) as call:
            for _ in range(3):
                self.upload()
            res = self.upload()
        self.assertEqual(call.call_count, 3)
        self.assertIn('error=no_tries', res['Location'])
        self.assertContains(self.get(), 'used all 3 try-ons')

    def test_a_timeout_counts_and_a_refusal_does_not(self):
        with mock.patch(POST, return_value=vendor_answer(504, {'error': {'code': 'GATEWAY_TIMEOUT'}})):
            res = self.upload()
        self.assertIn('error=timeout', res['Location'])
        with mock.patch(POST, return_value=vendor_answer(500, {'error': 'Something went wrong.'})):
            self.assertIn('error=unavailable', self.upload()['Location'])
        with mock.patch(POST, side_effect=requests.ConnectionError('down')):
            self.assertIn('error=unavailable', self.upload()['Location'])
        self.assertEqual(tryon.tries_left(self.job), 2)
        self.assertEqual(GarmentTryOn.objects.filter(status=GarmentTryOn.TIMEOUT).count(), 1)
        self.assertEqual(GarmentTryOn.objects.filter(status=GarmentTryOn.FAILED).count(), 2)

    def test_a_photo_that_is_not_an_image_is_refused_without_a_call(self):
        with mock.patch(POST) as call:
            res = Client().post(self.path(), {'photo': SimpleUploadedFile('me.jpg', b'not an image')})
            connection.set_tenant(self.tenant)
        call.assert_not_called()
        self.assertIn('error=bad_photo', res['Location'])
        self.assertEqual(tryon.tries_left(self.job), 3)

    def test_once_delivered_the_try_on_closes(self):
        Order.objects.filter(pk=self.order.pk).update(order_status='Delivered')
        self.assertContains(self.get(), 'try-on has closed')
        with mock.patch(POST) as call:
            self.upload()
        call.assert_not_called()

    def test_a_garment_whose_photos_were_not_sent_has_no_page(self):
        GarmentImage.objects.filter(pk=self.front.pk).update(sent_at=None)
        self.assertEqual(self.get().status_code, 404)
