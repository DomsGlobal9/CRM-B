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
    'data: {"type":"image","mimeType":"image/jpeg","width":1536,"height":2048,"image":"data:image/jpeg;base64,' + PIXEL + '"}',
    'data: {"type":"done","status":"ok","attempts":1,"quality":{"checked":true,"passed":true,"regenerated":false,"failures":[]}}',
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

    def test_refuses_garment_and_empty_design(self):
        with self.assertRaises(DiscoveryError):
            generate.build_payload(client_id='t', garment_key='jacket', parts={'front_design': {'image_url': 'x'}})
        with mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy):
            with self.assertRaises(DiscoveryError):
                generate.build_payload(client_id='t', garment_key='saree', parts={})

    @mock.patch.object(generate.requests, 'post', return_value=FakeStream())
    def test_reads_stream_to_the_photograph(self, post):
        result = generate.generate({'clientId': 't', 'garment': 'SAREE', 'designs': [], 'fabrics': []})
        self.assertEqual(result['image'], 'data:image/jpeg;base64,' + PIXEL)
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
        self.assertIn('/design_previews/', res.json()['image_url'])
        self.assertTrue(res.json()['image_url'].endswith('.jpg'))
        sent = post.call_args.kwargs['json']
        self.assertTrue(sent['clientId'].endswith(f':{self.owner.id}'))
        self.assertEqual(sent['fabrics'], [{'image': 'https://res.cloudinary.com/x/roll.jpg',
                                            'name': 'Wine silk', 'itemCode': 'FAB-9', 'colorHex': '#722F37'}])
        self.assertEqual(sent['designs'][0]['area'], 'PALLU')

    @mock.patch.object(generate.requests, 'get', side_effect=fake_taxonomy)
    def test_no_design_is_a_400(self, _get):
        res = self.client.post(PREVIEW, {'garment_key': 'saree', 'parts': {}}, format='json')
        self.assertEqual(res.status_code, 400)
