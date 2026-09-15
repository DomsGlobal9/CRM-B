"""Design Discovery: garment photographs from the open web, one part at a time.

The vendor's search takes a garment id, optionally one of that garment's
design areas, and words; it returns links to photographs it found, with the
page each came from. It never returns image bytes and its links expire, so
`keep` copies a chosen picture into our own storage the moment it is picked.

Two vocabularies are translated here and nowhere else: our GarmentTemplate
keys to the vendor's garment ids (spelt LEHANGA and KURTHI on their side),
and our design part keys (pallu_design) to their design areas (PALLU). The
area list is theirs to define, so it is read from their taxonomy endpoint
and cached; a part we cannot map is described in words instead, which their
instruction parser resolves on its own.
"""
import logging
import re
import uuid

import requests
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

SEARCH_TIMEOUT = 12       # the vendor quotes 2-4 s live
# The document says 100; the live service refuses anything over 50
# ("Too big: expected number to be <=50"). Measured, not read.
MAX_LIMIT = 50
FETCH_TIMEOUT = 15
KEEP_MAX_BYTES = 15 * 1024 * 1024
TAXONOMY_TTL = 24 * 3600

# GarmentTemplate.key -> vendor garment id. Absent keys search without a
# category, on words alone.
GARMENT_IDS = {
    'saree': 'SAREE',
    'blouse': 'BLOUSE',
    'lehenga_blouse': 'BLOUSE',
    'dupatta': 'DUPATTA',
    'kurti': 'KURTHI',
    'anarkali': 'ANARKALI',
    'petticoat': 'PETTICOAT',
    'gown': 'GOWN',
    'suit': 'SUIT',
    'sherwani': 'SHERWANI',
    'bottom_wear': 'BOTTOM_WEAR',
    'lehenga': 'LEHANGA',
    'sharara': 'SHARARA',
}

# Words in a part key that name a vendor design area. Checked longest first
# so 'pallu_end' beats 'pallu' where both exist on their side.
AREA_WORDS = {
    'overall': 'OVERALL', 'pallu': 'PALLU', 'border': 'BORDER', 'body': 'BODY',
    'pleat': 'PLEAT', 'print': 'PRINT', 'embroidery': 'EMBROIDERY', 'zari': 'ZARI',
    'front': 'FRONT', 'back': 'BACK', 'neck': 'NECK', 'collar': 'COLLAR',
    'sleeve': 'SLEEVE', 'hand': 'SLEEVE', 'hem': 'HEM', 'hemline': 'HEM',
    'waist': 'WAIST', 'waistband': 'WAIST', 'flare': 'FLARE', 'ghera': 'FLARE',
    'skirt': 'SKIRT', 'dupatta': 'DUPATTA', 'tassel': 'TASSEL', 'latkan': 'TASSEL',
    'corner': 'CORNER', 'pocket': 'POCKET', 'button': 'BUTTON', 'side': 'SIDE',
    'leg': 'LEG', 'ankle': 'ANKLE', 'belt': 'BELT', 'end': 'END',
}


class DiscoveryError(Exception):
    """A search or a keep that did not happen; `status` is what to answer with."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def configured():
    return bool(getattr(settings, 'DESIGN_DISCOVERY_URL', '')
                and getattr(settings, 'DESIGN_DISCOVERY_API_KEY', ''))


def _headers():
    return {'x-api-key': settings.DESIGN_DISCOVERY_API_KEY,
            'Content-Type': 'application/json'}


def _taxonomy_url():
    # Documented as a sibling of /search on the same prefix.
    return re.sub(r'/search/?$', '/taxonomy', settings.DESIGN_DISCOVERY_URL)


def design_areas(garment_id):
    """The vendor's design areas for one garment, cached for a day.

    Read from their taxonomy rather than hard-coded: 'SLEEVE is not a design
    area of Saree' is a 400 on their side, and their list is the only truth.
    Unreachable taxonomy means no areas, and the search proceeds on words.
    """
    if not garment_id:
        return set()
    key = f'design_discovery:taxonomy:{garment_id}'
    cached = cache.get(key)
    if cached is not None:
        return set(cached)
    areas = []
    try:
        res = requests.get(_taxonomy_url(), headers=_headers(), timeout=SEARCH_TIMEOUT)
        if res.ok:
            areas = _areas_from_taxonomy(res.json(), garment_id)
    except (requests.RequestException, ValueError):
        logger.warning('Design Discovery taxonomy unreachable', exc_info=True)
    cache.set(key, areas, TAXONOMY_TTL)
    return set(areas)


def _areas_from_taxonomy(body, garment_id):
    """Tolerant of the two shapes a taxonomy tends to take: a list of garments
    each carrying its areas, or a map keyed by garment id."""
    garments = body.get('garments') if isinstance(body, dict) else body
    if isinstance(garments, dict):
        entry = garments.get(garment_id) or {}
        rows = entry if isinstance(entry, list) else (
            entry.get('designTypes') or entry.get('areas') or [])
    else:
        entry = next((g for g in (garments or [])
                      if isinstance(g, dict) and str(g.get('id') or g.get('key') or '').upper() == garment_id), {})
        rows = entry.get('designTypes') or entry.get('areas') or []
    out = []
    for row in rows:
        code = row if isinstance(row, str) else (row.get('id') or row.get('key') or row.get('code'))
        if code:
            out.append(str(code).upper())
    return out


def area_for_part(garment_id, part_key):
    """The vendor design area a part key names, or '' when it names none the
    vendor knows for that garment."""
    known = design_areas(garment_id)
    if not known:
        return ''
    words = [w for w in re.split(r'[_\s]+', (part_key or '').lower()) if w and w != 'design']
    # Two-word areas first (pallu_end), then single words.
    for i in range(len(words) - 1):
        joined = f'{words[i]}_{words[i + 1]}'.upper()
        if joined in known:
            return joined
    for word in words:
        area = AREA_WORDS.get(word, word.upper())
        if area in known:
            return area
    return ''


def search(*, client_id, garment_key='', part_key='', part_label='', keywords=(),
           instruction='', colour='', fabric='', occasion='', limit=None, page=1):
    if not configured():
        raise DiscoveryError('Design search is not set up on this server.', status=503)

    garment_id = GARMENT_IDS.get((garment_key or '').lower(), '')
    area = area_for_part(garment_id, part_key) if garment_id else ''

    words = [str(w).strip()[:64] for w in (keywords or []) if str(w).strip()][:12]
    instruction = (instruction or '').strip()[:500]
    # A part the vendor has no area for is still a part: say it in words so
    # the search is about the pallu, not the whole saree.
    if part_label and not area:
        instruction = (f'{part_label} {instruction}'.strip())[:500]
    if not (words or instruction or garment_id):
        raise DiscoveryError('Describe what to look for.', status=400)

    # Every call costs the same however many results it asks for, so ask for
    # the ceiling unless the caller narrows it.
    try:
        limit = max(1, min(MAX_LIMIT, int(limit or MAX_LIMIT)))
        page = max(1, min(20, int(page or 1)))
    except (TypeError, ValueError):
        raise DiscoveryError('Bad page or limit.', status=400)

    payload = {'clientId': str(client_id)[:128], 'limit': limit, 'page': page}
    if garment_id:
        payload['category'] = garment_id
    if area:
        payload['designType'] = area
    if words:
        payload['keywords'] = words
    if instruction:
        payload['instruction'] = instruction
    filters = {k: v.strip()[:64] for k, v in (('color', colour), ('fabric', fabric), ('occasion', occasion))
               if v and v.strip()}
    if filters:
        payload['filters'] = filters

    try:
        res = requests.post(settings.DESIGN_DISCOVERY_URL, json=payload,
                            headers=_headers(), timeout=SEARCH_TIMEOUT)
    except requests.RequestException:
        logger.warning('Design Discovery search failed', exc_info=True)
        raise DiscoveryError('The design search did not answer. Try again in a moment.')
    try:
        body = res.json()
    except ValueError:
        raise DiscoveryError('The design search gave an unreadable answer.')

    if not res.ok or not body.get('success', res.ok):
        error = body.get('error') or {}
        code = error.get('code', '')
        message = error.get('message') or 'The design search refused the request.'
        # A validation refusal names its field in `details`; that is the part
        # worth showing, not the generic sentence above it.
        details = '; '.join(
            f"{d.get('field')}: {d.get('message')}" if d.get('field') else str(d.get('message') or d)
            for d in (error.get('details') or []) if d)
        if details:
            message = f'{message} {details}'
        if code == 'RATE_LIMIT_EXCEEDED':
            raise DiscoveryError('Too many searches this minute. Wait a moment and try again.', status=429)
        if res.status_code == 401:
            raise DiscoveryError('The design search key was refused.', status=503)
        if code == 'DISCOVERY_NOT_CONFIGURED':
            raise DiscoveryError('Design search is switched off by the provider.', status=503)
        raise DiscoveryError(message, status=400 if res.status_code == 400 else 502)

    interpreted = body.get('interpreted') or {}
    return {
        'results': [_result(r) for r in body.get('results') or [] if _fetchable(r)],
        'interpreted': {
            'garment': interpreted.get('categoryName') or garment_id or '',
            'area': interpreted.get('designTypeName') or area or '',
            'keywords': interpreted.get('keywords') or [],
            'unresolved': interpreted.get('unresolved') or [],
        },
        'cached': bool(body.get('cached')),
        'has_more': bool((body.get('pagination') or {}).get('hasMore')),
        'query': body.get('query') or '',
    }


def _fetchable(row):
    # `fetchable` is the one truth about what can be retrieved; a row without
    # it has nothing we could keep.
    return bool(((row or {}).get('fetchable') or {}).get('url'))


def _result(row):
    fetchable = row.get('fetchable') or {}
    return {
        'id': row.get('id') or f"web_{uuid.uuid5(uuid.NAMESPACE_URL, fetchable['url'])}",
        'title': (row.get('title') or '').strip(),
        'image_url': fetchable['url'],
        'width': fetchable.get('width'),
        'height': fetchable.get('height'),
        'source_url': row.get('sourceUrl') or '',
        'source_domain': row.get('sourceDomain') or '',
        'position': row.get('position'),
    }


def keep(image_url, *, title=''):
    """Copy one search result into our storage and return the saved path.

    The vendor's URLs are point-in-time. A reference on an order has to be
    there when the tailor opens it months later, so the bytes are ours from
    the moment the picture is chosen.
    """
    if not image_url or not re.match(r'^https?://', image_url, re.I):
        raise DiscoveryError('That is not a picture we can keep.', status=400)
    try:
        res = requests.get(image_url, timeout=FETCH_TIMEOUT, stream=True,
                           headers={'User-Agent': 'Mozilla/5.0 (compatible; ScaleezyCRM/1.0)'})
        res.raise_for_status()
        content_type = (res.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if not content_type.startswith('image/'):
            raise DiscoveryError('That link no longer serves a picture.', status=422)
        data = b''
        for chunk in res.iter_content(65536):
            data += chunk
            if len(data) > KEEP_MAX_BYTES:
                raise DiscoveryError('That picture is too large to keep.', status=422)
    except requests.RequestException:
        logger.warning('Design Discovery keep failed for %s', image_url, exc_info=True)
        raise DiscoveryError('That picture could not be fetched. Its link may have expired.', status=422)
    if not data:
        raise DiscoveryError('That link served an empty picture.', status=422)

    ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
           'image/gif': 'gif', 'image/avif': 'avif'}.get(content_type, 'jpg')
    slug = re.sub(r'[^a-z0-9]+', '-', (title or 'web-design').lower()).strip('-')[:40] or 'web-design'
    path = f'design_references/web/{uuid.uuid4()}_{slug}.{ext}'
    return default_storage.save(path, ContentFile(data))
