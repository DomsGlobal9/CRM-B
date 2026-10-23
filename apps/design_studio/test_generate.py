"""Garment preview: the vendor stubbed, our translation and storage real."""
import base64
import shutil
import tempfile
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from apps.inventory.models import InventoryItem
from . import generate
from .web_search import DiscoveryError

PREVIEW = '/api/design-studio/preview/'
TAXONOMY = {'garments': [
    {'id': 'SAREE', 'designTypes': [{'id': 'OVERALL'}, {'id': 'PALLU'}, {'id': 'BORDER'}, {'id': 'BODY'}]},
]}
PIXEL = base64.b64encode(b'\xff\xd8\xff\xe0fakejpeg').decode()
STREAM = [
    'data: {"type":"start","jobId":"j1","warnings":["BORDER under 512 px"]}',
    '',
    ': keepalive 1',
    'data: {"type":"status","stage":"generating","attempt":1}',
    'data: {"type":"image","view":"front","mimeType":"image/jpeg","width":896,"height":1200,"image":"data:image/jpeg;base64,' + PIXEL + '"}',
    'data: {"type":"image","view":"back","mimeType":"image/jpeg","width":896,"height":1200,"image":"data:image/png;base64,' + PIXEL + '"}',
    'data: {"type":"done","status":"ok","views":["front","back"],"quality":{"checked":true,"passed":true}}',
]


class FakeStream:
    def __init__(self, lines=STREAM, status=200, content_type='text/event-stream', body=None):
        self.status_code = status
        self.ok = status < 400
        self.headers = {'Content-Type': content_type}
        self._lines, self._body = lines, body

    def iter_lines(self, decode_unicode=True):
        yield from self._lines

    def json(self):
        return self._body

    def close(self):
        pass


def fake_taxonomy(*args, **kwargs):
    res = mock.Mock(ok=True)
    res.json.return_value = TAXONOMY
    return res


VENDOR = dict(DESIGN_DISCOVERY_URL='https://gw.test/api/v1/discovery/search',
              DESIGN_DISCOVERY_API_KEY='k', DESIGN_STUDIO_URL='https://gw.test/api/v1/designstudio')


class BuildPayloadTests(TenantTestCase):

    def setUp(self):
        super().setUp()
        # In setUp, not on the class: TenantTestCase.setUpClass skips
        # SimpleTestCase's, so a class-level override_settings is ignored.
        override = override_settings(**VENDOR)
        override.enable()
        self.addCleanup(override.disable)
        cache.clear()

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_maps_parts_and_fabric_slots(self, _get):
        payload = generate.build_payload(
            client_id='t:1', garment_key='saree',
            parts={'pallu_design': {'image_url': 'https://res.cloudinary.com/x/pallu.jpg'},
                   'embroidery_design': {'image_url': 'https://res.cloudinary.com/x/emb.jpg'},   # no area
                   'body_design': None},
            part_refs={'border_design': [{'image_url': 'https://res.cloudinary.com/x/border.jpg'}],
                       'pallu_design': [{'image_url': 'https://res.cloudinary.com/x/ignored.jpg'}]},
            fabrics={'SAREE_BODY': ['a'], 'PALLU': ['b'], 'FALL': ['c'], 'dori': ['d']},
            fabric_items={'a': {'name': 'Kanjivaram', 'material_type': 'Silk', 'color': 'Wine',
                                'color_hex': '#722F37', 'image_url': 'https://res.cloudinary.com/x/a.jpg',
                                'item_code': 'FAB-1'},
                          'b': {'name': 'Tissue', 'image_url': 'https://res.cloudinary.com/x/b.jpg', 'color_hex': 'red'},
                          'c': {'name': 'Fall', 'image_url': 'https://res.cloudinary.com/x/c.jpg'},
                          'd': {'name': 'Dori', 'image_url': 'https://res.cloudinary.com/x/d.jpg'}},
            fabric_slots={'SAREE_BODY', 'PALLU', 'BORDER', 'FALL'}, notes=' festive ', product_name='',
            model_image='data:image/jpeg;base64,' + PIXEL)
        self.assertEqual(payload['garment'], 'SAREE')
        self.assertEqual(payload['modelImageUrl'], 'data:image/jpeg;base64,' + PIXEL)
        # A data URI is already what the vendor wants; resolving leaves it alone.
        self.assertEqual(generate.resolve_images(payload)['modelImageUrl'], 'data:image/jpeg;base64,' + PIXEL)
        self.assertEqual(payload['designs'], [
            {'area': 'PALLU', 'image': 'https://res.cloudinary.com/x/pallu.jpg'},
            {'area': 'BORDER', 'image': 'https://res.cloudinary.com/x/border.jpg'},
        ])
        self.assertEqual(payload['fabrics'], [
            {'image': 'https://res.cloudinary.com/x/a.jpg', 'name': 'Kanjivaram', 'material': 'Silk',
             'color': 'Wine', 'itemCode': 'FAB-1', 'colorHex': '#722F37'},
            {'image': 'https://res.cloudinary.com/x/b.jpg', 'appliesTo': ['PALLU'], 'name': 'Tissue'},
        ])
        self.assertEqual(payload['notes'], 'festive')
        self.assertNotIn('productName', payload)
        self.assertNotIn('views', payload)      # both sides: the vendor's default

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_views_one_side_only(self, _get):
        parts = {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/p.jpg'}}
        build = lambda views: generate.build_payload(client_id='t', garment_key='saree', parts=parts, views=views)
        self.assertEqual(build(['back'])['views'], ['back'])
        self.assertNotIn('views', build(['front', 'back']))
        self.assertNotIn('views', build(['sideways']))

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_measurements_sent_only_when_switched_on(self, _get):
        parts = {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/p.jpg'}}
        raw = [{'key': 'Bust', 'label': 'Bust', 'value': '36.5', 'unit': 'Inches'},
               {'key': 'waist', 'value': 0}, {'key': 'hip', 'value': 'x'}, {'key': 'neck', 'value': 14, 'unit': 'ft'}]
        build = lambda: generate.build_payload(client_id='t', garment_key='saree', parts=parts, measurements=raw)
        self.assertNotIn('measurements', build())
        with override_settings(DESIGN_STUDIO_SEND_MEASUREMENTS=True):
            self.assertEqual(build()['measurements'],
                             [{'key': 'bust', 'label': 'Bust', 'value': 36.5, 'unit': 'in'}])

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_plain_garment_photo_is_its_overall_design(self, _get):
        # No design chosen: the wizard sends the plain garment's own photo
        # as its overall design, so it is still drawn front and back.
        photo = 'data:image/jpeg;base64,' + PIXEL
        payload = generate.build_payload(client_id='t', garment_key='saree', parts={},
                                         part_refs={'overall': [{'image_url': photo}]})
        self.assertEqual(payload['designs'], [{'area': 'OVERALL', 'image': photo}])
        self.assertNotIn('views', payload)

    def test_refuses_garment_and_empty_design(self):
        with self.assertRaises(DiscoveryError):
            generate.build_payload(client_id='t', garment_key='jacket', parts={'front_design': {'image_url': 'x'}})
        with mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy):
            with self.assertRaises(DiscoveryError):
                generate.build_payload(client_id='t', garment_key='saree', parts={})

    @mock.patch.object(generate.requests, 'post', return_value=FakeStream())
    def test_reads_stream_to_the_photograph(self, post):
        result = generate.generate({'clientId': 't', 'garment': 'SAREE', 'designs': [], 'fabrics': []})
        self.assertEqual(list(result['images']), ['front', 'back'])
        self.assertEqual(result['images']['front'], 'data:image/jpeg;base64,' + PIXEL)
        self.assertEqual(result['warnings'], ['BORDER under 512 px'])
        self.assertTrue(result['quality']['passed'])
        self.assertEqual(post.call_args.args[0], 'https://gw.test/api/v1/designstudio/generate')
        self.assertEqual(post.call_args.kwargs['headers']['x-api-key'], 'k')

    @mock.patch.object(generate.requests, 'post')
    def test_refusal_and_stream_error(self, post):
        post.return_value = FakeStream(status=400, content_type='application/json', body={
            'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': 'Bad request',
                                        'details': [{'field': 'designs[0].area', 'message': 'unknown'}]}})
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({})
        self.assertEqual(caught.exception.status, 400)
        self.assertIn('designs[0].area: unknown', str(caught.exception))

        post.return_value = FakeStream(lines=[
            'data: {"type":"start"}',
            'data: {"type":"error","code":"GENERATION_BLOCKED","message":"Declined."}'])
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({})
        self.assertEqual(caught.exception.status, 422)

        post.return_value = FakeStream(lines=['data: {"type":"start"}'])
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({})
        self.assertEqual(caught.exception.status, 502)

    @mock.patch.object(generate.time, 'sleep')
    @mock.patch.object(generate.requests, 'post')
    def test_a_momentary_failure_is_sent_once_more_after_two_seconds(self, post, sleep):
        gateway_down = FakeStream(status=503, content_type='application/json',
                                  body={'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'x'}})
        for first in (gateway_down, FakeStream(lines=[': keepalive 1'])):   # 5xx, then an empty 200
            post.reset_mock()
            sleep.reset_mock()
            post.side_effect = [first, FakeStream()]
            result = generate.generate({'clientId': 't'})
            self.assertEqual(list(result['images']), ['front', 'back'])
            self.assertEqual(post.call_count, 2)
            self.assertEqual(post.call_args_list[0], post.call_args_list[1])   # the same request
            sleep.assert_called_once_with(2)

        # Only once: a second momentary failure is the answer.
        post.reset_mock()
        post.side_effect = [gateway_down, gateway_down, FakeStream()]
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({'clientId': 't'})
        self.assertEqual((caught.exception.status, post.call_count), (502, 2))

    @mock.patch.object(generate.time, 'sleep')
    @mock.patch.object(generate.requests, 'get')
    @mock.patch.object(generate.requests, 'post')
    def test_a_cut_off_stream_is_collected_by_its_job_id(self, post, get, sleep):
        class CutOff(FakeStream):
            def iter_lines(self, decode_unicode=True):
                yield 'data: {"type":"start","jobId":"j9"}'
                raise generate.requests.exceptions.ChunkedEncodingError('connection cut')

        running = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={'status': 'running'}))
        finished = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={
            'status': 'done', 'quality': {'checked': True},
            'images': {'front': {'image': 'data:image/jpeg;base64,' + PIXEL, 'width': 896, 'height': 1200},
                       'back': {'image': 'data:image/jpeg;base64,' + PIXEL}}}))
        post.return_value = CutOff()
        get.side_effect = [running, finished]

        result = generate.generate({'clientId': 't'})

        self.assertEqual(list(result['images']), ['front', 'back'])
        self.assertEqual((result['width'], result['height']), (896, 1200))
        self.assertEqual(get.call_args.args[0], 'https://gw.test/api/v1/designstudio/result/j9')
        self.assertEqual(get.call_args.kwargs['headers']['x-api-key'], 'k')   # the same key
        sleep.assert_called_once_with(10)
        self.assertEqual(post.call_count, 1)      # collected, never generated again

    @mock.patch.object(generate.time, 'sleep')
    @mock.patch.object(generate.requests, 'get')
    @mock.patch.object(generate.requests, 'post')
    def test_a_stream_ending_without_done_or_error_is_collected(self, post, get, sleep):
        post.return_value = FakeStream(lines=[
            'data: {"type":"start","jobId":"j7"}',
            'data: {"type":"image","view":"front","image":"data:image/jpeg;base64,' + PIXEL + '"}'])
        get.return_value = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={
            'status': 'done', 'images': [{'view': 'front', 'image': 'data:image/jpeg;base64,' + PIXEL},
                                         {'view': 'back', 'image': 'data:image/png;base64,' + PIXEL}]}))
        result = generate.generate({'clientId': 't'})
        self.assertEqual(list(result['images']), ['front', 'back'])   # the whole job, not the half seen
        sleep.assert_not_called()

    @mock.patch.object(generate.time, 'sleep')
    @mock.patch.object(generate.requests, 'get')
    @mock.patch.object(generate.requests, 'post')
    def test_collecting_answers_too_late_failed_and_still_running(self, post, get, sleep):
        started = ['data: {"type":"start","jobId":"j5"}']

        post.return_value = FakeStream(lines=started)
        get.return_value = mock.Mock(status_code=404, ok=False)
        with self.assertRaisesMessage(DiscoveryError, 'could not be collected'):
            generate.generate({'clientId': 't'})

        post.return_value = FakeStream(lines=started)
        get.return_value = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={
            'status': 'error', 'error': {'code': 'GENERATION_BLOCKED', 'message': 'Declined.'}}))
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({'clientId': 't'})
        self.assertEqual(caught.exception.status, 422)

        post.return_value = FakeStream(lines=started)
        get.return_value = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={
            'status': 'cancelled', 'error': 'Cancelled by the client.'}))
        with self.assertRaises(DiscoveryError) as caught:
            generate.generate({'clientId': 't'})
        self.assertEqual(caught.exception.status, 409)

        # Still running at the request's own deadline: say so, rather than outlive the worker.
        post.return_value = FakeStream(lines=started)
        get.return_value = mock.Mock(status_code=200, ok=True, json=mock.Mock(return_value={'status': 'running'}))
        with mock.patch.object(generate, 'TOTAL_BUDGET', 5), \
                self.assertRaisesMessage(DiscoveryError, 'still being made'):
            generate.generate({'clientId': 't'})

    @mock.patch.object(generate.time, 'sleep')
    @mock.patch.object(generate.requests, 'post')
    def test_real_failures_are_not_retried(self, post, sleep):
        for answer in (
                FakeStream(status=400, content_type='application/json',
                           body={'error': {'code': 'VALIDATION_ERROR', 'message': 'Bad'}}),
                FakeStream(status=429, content_type='application/json', body={}),
                FakeStream(lines=['data: {"type":"start"}',
                                  'data: {"type":"error","code":"MODEL_TIMEOUT","message":"Slow."}']),
                FakeStream(lines=['data: {"type":"start"}'])):    # began, then nothing
            post.reset_mock()
            post.return_value = answer
            with self.assertRaises(DiscoveryError):
                generate.generate({'clientId': 't'})
            self.assertEqual(post.call_count, 1)
        sleep.assert_not_called()

    @mock.patch.object(generate.requests, 'get')
    def test_a_seven_part_saree_keeps_every_design(self, get):
        get.return_value = mock.Mock(ok=True, json=mock.Mock(return_value={'garments': [{'id': 'SAREE', 'designTypes': [
            {'id': a} for a in ('OVERALL', 'PALLU', 'BORDER', 'BODY', 'PLEAT', 'PRINT', 'EMBROIDERY', 'ZARI_WORK')]}]}))
        parts = {f'{p}_design': {'image_url': f'https://res.cloudinary.com/x/{p}.jpg'}
                 for p in ('pallu', 'border', 'body', 'pleat', 'print', 'embroidery', 'zari_work')}
        payload = generate.build_payload(client_id='t', garment_key='saree', parts=parts)
        self.assertEqual([d['area'] for d in payload['designs']],
                         ['PALLU', 'BORDER', 'BODY', 'PLEAT', 'PRINT', 'EMBROIDERY', 'ZARI_WORK'])

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_the_pdfs_options_reach_the_vendor_in_its_own_words(self, _get):
        parts = {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/p.jpg', 'caption': ' keep the peacocks '},
                 'border_design': {'image_url': 'https://res.cloudinary.com/x/b.jpg'}}
        payload = generate.build_payload(
            client_id='t', garment_key='saree', parts=parts, model_image='data:image/jpeg;base64,' + PIXEL,
            presentation='sketch', model_gender='male', keep_motif_colors=False, coverage='reference',
            pair_with={'color': 'antique gold', 'color_hex': '#C9A227', 'note': 'short puff sleeves'})
        self.assertEqual(payload['presentation'], 'sketch')
        self.assertNotIn('modelImageUrl', payload)      # a model photo only goes with `model`
        self.assertEqual(payload['modelGender'], 'male')
        self.assertEqual(payload['pairWith'], {'color': 'antique gold', 'colorHex': '#C9A227',
                                               'note': 'short puff sleeves'})
        self.assertEqual(payload['designs'][0], {'area': 'PALLU', 'image': 'https://res.cloudinary.com/x/p.jpg',
                                                 'note': 'keep the peacocks', 'keepMotifColors': False,
                                                 'coverage': 'reference'})

        # The vendor's defaults are not sent: a model photo, no gender, no pairing.
        plain = generate.build_payload(client_id='t', garment_key='saree', parts=parts,
                                       model_image='data:image/jpeg;base64,' + PIXEL, presentation='painting',
                                       pair_with={'color': ' ', 'color_hex': 'gold'})
        self.assertNotIn('presentation', plain)
        self.assertIn('modelImageUrl', plain)
        self.assertNotIn('modelGender', plain)
        self.assertNotIn('pairWith', plain)
        self.assertEqual(plain['designs'][1], {'area': 'BORDER', 'image': 'https://res.cloudinary.com/x/b.jpg'})

    @mock.patch.object(generate.requests, 'post')
    def test_a_sketch_comes_back_as_one_sheet_with_its_labels(self, post):
        labels = [{'part': 'PALLU', 'label': 'Pallu: gold zari paisleys', 'on': ['front', 'back']}]
        post.return_value = FakeStream(lines=[
            'data: {"type":"start","jobId":"j","presentation":"sketch"}',
            'data: ' + __import__('json').dumps({'type': 'image', 'view': 'sheet', 'views': ['front', 'back'],
                                                 'annotations': labels, 'width': 896, 'height': 1200,
                                                 'image': 'data:image/jpeg;base64,' + PIXEL}),
            'data: {"type":"done","status":"ok","presentation":"sketch","quality":{"labels":{"checked":true,"passed":true,"failures":[]}}}'])
        result = generate.generate({'clientId': 't'})
        self.assertEqual(list(result['images']), ['sheet'])
        self.assertEqual(result['annotations'], labels)
        self.assertEqual(result['presentation'], 'sketch')

    @mock.patch.object(generate.requests, 'get')
    def test_a_vendor_blip_is_said_plainly_and_not_remembered(self, get):
        parts = {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/p.jpg'}}
        get.return_value = mock.Mock(ok=False, status_code=503)
        with self.assertRaises(DiscoveryError) as caught:
            generate.build_payload(client_id='t', garment_key='saree', parts=parts)
        self.assertEqual(caught.exception.status, 503)
        self.assertNotIn('Choose at least one design', str(caught.exception))

        # Back a minute later: the next preview works, nothing stale was kept.
        get.side_effect = fake_taxonomy
        payload = generate.build_payload(client_id='t', garment_key='saree', parts=parts)
        self.assertEqual(payload['designs'][0]['area'], 'PALLU')

    @mock.patch.object(generate.requests, 'get')
    def test_a_blouse_hand_design_is_the_hand_area_not_the_sleeve(self, get):
        get.return_value = mock.Mock(ok=True, json=mock.Mock(return_value={'garments': [{'id': 'BLOUSE', 'designTypes': [
            {'id': a} for a in ('OVERALL', 'FRONT', 'BACK', 'NECK', 'HAND', 'SLEEVE')]}]}))
        parts = {'hand_design': {'image_url': 'https://res.cloudinary.com/x/hand.jpg'},
                 'sleeve_design': {'image_url': 'https://res.cloudinary.com/x/sleeve.jpg'}}
        payload = generate.build_payload(client_id='t', garment_key='blouse', parts=parts)
        self.assertEqual([d['area'] for d in payload['designs']], ['HAND', 'SLEEVE'])


class PreviewViewTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@preview.test'
        tenant.name = 'Preview Atelier'

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        media = tempfile.mkdtemp(prefix='design-preview-test-')
        self.addCleanup(shutil.rmtree, media, True)
        override = override_settings(MEDIA_ROOT=media, **VENDOR)
        override.enable()
        self.addCleanup(override.disable)
        cache.clear()
        self.owner = User.objects.create_user(
            username='owner@preview.test', email='owner@preview.test', password='pass12345')
        self.client = APIClient()
        self.client.credentials(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.client.force_authenticate(user=self.owner)
        self.roll = InventoryItem.objects.create(
            item_code='FAB-9', name='Wine silk', category='FABRIC', color_hex='#722F37',
            image_url='https://res.cloudinary.com/x/roll.jpg')

    def test_availability(self):
        self.assertTrue(self.client.get(PREVIEW).json()['available'])
        garments = self.client.get(PREVIEW).json()['garments']
        self.assertIn('saree', garments)
        self.assertNotIn('jacket', garments)
        with override_settings(DESIGN_DISCOVERY_API_KEY=''):
            self.assertFalse(self.client.get(PREVIEW).json()['available'])

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    @mock.patch.object(generate.requests, 'post', return_value=FakeStream())
    def test_generates_and_keeps(self, post, _get):
        res = self.client.post(PREVIEW, {
            'garment_key': 'saree',
            'parts': {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/pallu.jpg'}},
            'fabrics': {'SAREE_BODY': [str(self.roll.id)], 'dori': [str(self.roll.id)]},
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertIn('/design_previews/', body['image_url'])
        self.assertEqual(body['image_url'], body['images']['front'])
        self.assertTrue(body['images']['front'].endswith('.jpg'))
        self.assertTrue(body['images']['back'].endswith('.png'))
        sent = post.call_args.kwargs['json']
        self.assertTrue(sent['clientId'].endswith(f':{self.owner.id}'))
        self.assertEqual(sent['fabrics'], [{'image': 'https://res.cloudinary.com/x/roll.jpg',
                                            'name': 'Wine silk', 'itemCode': 'FAB-9', 'colorHex': '#722F37'}])
        self.assertEqual(sent['designs'][0]['area'], 'PALLU')

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_no_design_is_a_400(self, _get):
        res = self.client.post(PREVIEW, {'garment_key': 'saree', 'parts': {}}, format='json')
        self.assertEqual(res.status_code, 400)

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    @mock.patch.object(generate.requests, 'post', return_value=FakeStream())
    def test_the_cards_options_are_passed_through(self, post, _get):
        res = self.client.post(PREVIEW, {
            'garment_key': 'saree',
            'parts': {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/pallu.jpg'}},
            'presentation': 'mannequin', 'model_gender': 'female', 'coverage': 'reference',
            'keep_motif_colors': False, 'pair_with': {'color': 'cream', 'note': 'matte'},
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        sent = post.call_args.kwargs['json']
        self.assertEqual((sent['presentation'], sent['modelGender']), ('mannequin', 'female'))
        self.assertEqual(sent['pairWith'], {'color': 'cream', 'note': 'matte'})
        self.assertEqual((sent['designs'][0]['coverage'], sent['designs'][0]['keepMotifColors']),
                         ('reference', False))

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    @mock.patch.object(generate.requests, 'post', return_value=FakeStream())
    def test_a_picture_of_a_customer_is_sent_under_their_own_id(self, post, _get):
        from crm_api.models import Customer
        customer = Customer.objects.create(first_name='Taniya', last_name='K', mobile_number='9876500077')
        body = {'garment_key': 'saree', 'clientId': str(customer.id),
                'parts': {'pallu_design': {'image_url': 'https://res.cloudinary.com/x/pallu.jpg'}}}
        res = self.client.post(PREVIEW, body, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(post.call_args.kwargs['json']['clientId'], str(customer.id))

        post.reset_mock()
        stop = self.client.post(PREVIEW + 'cancel/', {'clientId': str(customer.id)}, format='json')
        self.assertEqual(stop.status_code, 200)
        self.assertEqual(post.call_args.kwargs['json'], {'clientId': str(customer.id)})

        # Not a customer of this boutique (or not an id at all): refused, nothing sent.
        post.reset_mock()
        for unknown in ('3f2b8c1e-0000-4000-8000-000000000000', 'not-an-id'):
            res = self.client.post(PREVIEW, {**body, 'clientId': unknown}, format='json')
            self.assertEqual(res.status_code, 400)
        post.assert_not_called()

    @mock.patch.object(generate.requests, 'post')
    def test_stop_cancels_this_persons_own_generation(self, post):
        post.return_value = mock.Mock(ok=True, json=mock.Mock(return_value={'success': True, 'cancelled': True}))
        res = self.client.post(PREVIEW + 'cancel/', {}, format='json')
        self.assertEqual((res.status_code, res.json()), (200, {'cancelled': True}))
        self.assertEqual(post.call_args.args[0], 'https://gw.test/api/v1/designstudio/cancel')
        self.assertEqual(post.call_args.kwargs['json'], {'clientId': f'{self.tenant.schema_name}:{self.owner.id}'})
