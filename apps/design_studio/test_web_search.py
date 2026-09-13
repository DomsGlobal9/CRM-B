"""Design Discovery: the vendor stubbed, our translation and storage real."""
import shutil
import tempfile
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIClient

from crm_api.models import Tailor
from . import web_search

SEARCH = '/api/design-studio/web-search/'
KEEP = '/api/design-studio/web-keep/'

TAXONOMY = {'garments': [
    {'id': 'SAREE', 'designTypes': [{'id': 'OVERALL'}, {'id': 'PALLU'}, {'id': 'BORDER'}, {'id': 'BODY'}]},
]}

VENDOR_HIT = {
    'id': 'result_1d37', 'position': 1,
    'title': 'Luxury Red Bridal Saree',
    'imageUrl': 'https://www.instagram.com/p/x/media',      # serves HTML: never used
    'sourceUrl': 'https://www.instagram.com/p/x/',
    'sourceDomain': 'www.instagram.com',
    'width': 2298, 'height': 4082,
    'fetchable': {'url': 'https://cdn.test/thumb.jpg', 'width': 335, 'height': 597, 'from': 'thumbnailUrl'},
}


class FakeResponse:
    def __init__(self, status=200, body=None, content=b'', content_type='application/json'):
        self.status_code = status
        self.ok = status < 400
        self._body = body
        self._content = content
        self.headers = {'Content-Type': content_type}

    def json(self):
        if self._body is None:
            raise ValueError('not json')
        return self._body

    def raise_for_status(self):
        if not self.ok:
            raise web_search.requests.HTTPError(str(self.status_code))

    def iter_content(self, size):
        for i in range(0, len(self._content), size):
            yield self._content[i:i + size]


@override_settings(DESIGN_DISCOVERY_URL='https://vendor.test/api/v1/discovery/search',
                   DESIGN_DISCOVERY_API_KEY='k-123')
class WebSearchTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@web.test'
        tenant.name = 'Web Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        cache.clear()
        self.owner = User.objects.create_user(
            username='owner@web.test', email='owner@web.test', password='pass12345')
        self.client = APIClient()
        self.client.credentials(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.client.force_authenticate(user=self.owner)

    def _vendor(self, search_body=None, search_status=200):
        """Patch requests so GET answers the taxonomy and POST the search."""
        def get(url, **kw):
            return FakeResponse(200, TAXONOMY)

        def post(url, json=None, **kw):
            post.calls.append(json)
            return FakeResponse(search_status, search_body)
        post.calls = []
        patcher = mock.patch.multiple(web_search.requests, get=get, post=post)
        patcher.start()
        self.addCleanup(patcher.stop)
        return post

    def test_available_only_when_both_settings_are_set(self):
        self.assertTrue(self.client.get(SEARCH).data['available'])
        with override_settings(DESIGN_DISCOVERY_API_KEY=''):
            self.assertFalse(self.client.get(SEARCH).data['available'])

    def test_a_part_search_names_the_garment_and_its_area(self):
        post = self._vendor({'success': True, 'cached': False, 'query': 'gold zari',
                             'interpreted': {'categoryName': 'Saree', 'designTypeName': 'Pallu'},
                             'results': [VENDOR_HIT], 'pagination': {'hasMore': False}})
        res = self.client.post(SEARCH, {
            'garment_key': 'saree', 'part_key': 'pallu_design', 'part_label': 'Pallu Design',
            'keywords': 'gold zari',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)

        sent = post.calls[0]
        self.assertEqual(sent['clientId'], self.tenant.schema_name)
        self.assertEqual(sent['category'], 'SAREE')
        self.assertEqual(sent['designType'], 'PALLU')
        self.assertEqual(sent['keywords'], ['gold', 'zari'])
        self.assertEqual(sent['limit'], 50, 'a full page costs the same as a small one; 50 is the live ceiling')
        self.assertNotIn('instruction', sent, 'a mapped area needs no words about the part')

        hit = res.data['results'][0]
        # The one URL that is actually retrievable, never the HTML-serving original.
        self.assertEqual(hit['image_url'], 'https://cdn.test/thumb.jpg')
        self.assertEqual(hit['source_url'], 'https://www.instagram.com/p/x/')
        self.assertEqual(hit['source_domain'], 'www.instagram.com')
        self.assertEqual(res.data['interpreted']['area'], 'Pallu')

    def test_a_part_the_vendor_has_no_area_for_is_described_in_words(self):
        post = self._vendor({'success': True, 'results': []})
        res = self.client.post(SEARCH, {
            'garment_key': 'saree', 'part_key': 'zari_work_design', 'part_label': 'Zari / Work Design',
            'keywords': 'temple',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        sent = post.calls[0]
        self.assertEqual(sent['category'], 'SAREE')
        self.assertNotIn('designType', sent)
        self.assertEqual(sent['instruction'], 'Zari / Work Design')

    def test_lehenga_and_kurti_use_the_vendor_spelling(self):
        post = self._vendor({'success': True, 'results': []})
        for key, expected in (('lehenga', 'LEHANGA'), ('kurti', 'KURTHI'), ('lehenga_blouse', 'BLOUSE')):
            self.client.post(SEARCH, {'garment_key': key, 'keywords': 'red'}, format='json')
            self.assertEqual(post.calls[-1]['category'], expected, key)

    def test_a_result_without_a_fetchable_url_is_dropped(self):
        broken = {**VENDOR_HIT, 'fetchable': None}
        self._vendor({'success': True, 'results': [broken, VENDOR_HIT]})
        res = self.client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json')
        self.assertEqual(len(res.data['results']), 1)

    def test_vendor_rate_limit_is_reported_as_such(self):
        self._vendor({'success': False, 'error': {'code': 'RATE_LIMIT_EXCEEDED', 'message': 'slow down'}},
                     search_status=429)
        res = self.client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json')
        self.assertEqual(res.status_code, 429)
        self.assertIn('minute', res.data['error'])

    def test_a_validation_refusal_names_the_field(self):
        self._vendor({'success': False, 'error': {
            'code': 'VALIDATION_ERROR', 'message': 'Request validation failed.',
            'details': [{'field': 'designType', 'message': '"SLEEVE" is not a design area of Saree.'}]}},
            search_status=400)
        res = self.client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('designType: "SLEEVE" is not a design area of Saree.', res.data['error'])

    def test_a_vendor_outage_does_not_become_a_server_error(self):
        def post(url, **kw):
            raise web_search.requests.ConnectionError('down')
        patcher = mock.patch.multiple(web_search.requests, get=lambda *a, **k: FakeResponse(200, TAXONOMY), post=post)
        patcher.start()
        self.addCleanup(patcher.stop)
        res = self.client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json')
        self.assertEqual(res.status_code, 502)

    def test_nothing_to_search_for_is_refused_before_the_vendor_is_asked(self):
        post = self._vendor({'success': True, 'results': []})
        res = self.client.post(SEARCH, {'garment_key': 'churidar'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(post.calls, [])

    def test_unconfigured_search_answers_503(self):
        with override_settings(DESIGN_DISCOVERY_API_KEY=''):
            res = self.client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json')
        self.assertEqual(res.status_code, 503)

    def test_a_tailor_cannot_search(self):
        tailor = User.objects.create_user(username='t@web.test', email='t@web.test', password='pass12345')
        Tailor.objects.create(name='T', specialty='Blouses', role='Tailor', user=tailor)
        client = APIClient()
        client.credentials(HTTP_X_TENANT_ID=self.tenant.schema_name)
        client.force_authenticate(user=tailor)
        self._vendor({'success': True, 'results': []})
        self.assertEqual(client.post(SEARCH, {'garment_key': 'saree', 'keywords': 'red'}, format='json').status_code, 403)


class KeepTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@keep.test'
        tenant.name = 'Keep Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        media_root = tempfile.mkdtemp(prefix='design-web-keep-test-')
        override = override_settings(
            MEDIA_ROOT=media_root,
            STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                      'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, media_root, True)
        self.owner = User.objects.create_user(
            username='owner@keep.test', email='owner@keep.test', password='pass12345')
        self.client = APIClient()
        self.client.credentials(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.client.force_authenticate(user=self.owner)

    def _serving(self, content_type, content):
        patcher = mock.patch.object(web_search.requests, 'get',
                                    lambda *a, **k: FakeResponse(200, content=content, content_type=content_type))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_a_picked_picture_becomes_our_own_copy(self):
        self._serving('image/png', b'\x89PNG\r\n\x1a\n fake bytes')
        res = self.client.post(KEEP, {'image_url': 'https://cdn.test/thumb.png', 'title': 'Red Bridal Saree'},
                               format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn('/media/design_references/web/', res.data['image_url'])
        self.assertTrue(res.data['image_url'].endswith('_red-bridal-saree.png'))

    def test_a_link_that_now_serves_html_is_refused(self):
        self._serving('text/html', b'<html>gone</html>')
        res = self.client.post(KEEP, {'image_url': 'https://cdn.test/expired'}, format='json')
        self.assertEqual(res.status_code, 422)
        self.assertIn('no longer serves a picture', res.data['error'])

    def test_a_non_http_url_is_refused_without_a_fetch(self):
        res = self.client.post(KEEP, {'image_url': 'file:///etc/passwd'}, format='json')
        self.assertEqual(res.status_code, 400)
