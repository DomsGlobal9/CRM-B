"""Design Studio: one photograph of the garment the customer put together.

The same vendor gateway Design Discovery searches also *generates*: given the
design picked for each part and the fabric chosen for each slot, it answers
with a catalogue photograph of that garment on a model. The order wizard's
review step calls it so the customer sees the saree they composed -- this
pallu, that border, on that roll -- before the order is placed.

The vendor speaks in its own vocabulary, already translated once in
web_search.py (GARMENT_IDS, area_for_part); it is reused here rather than
mapped twice. What is new is the fabric side: our slot map {slot: [rolls]}
becomes their fabrics[], the body roll as the main fabric and any pallu or
border roll marked appliesTo.

The answer is an event stream (30-95 s live). It is read to the end here and
the one photograph saved into our storage, so the browser gets a plain URL
back and the draft can carry it exactly as it carries a chosen design.
"""
import base64
import json
import logging
import mimetypes
import re
import uuid

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .web_search import GARMENT_IDS, DiscoveryError, area_for_part, configured, _headers

logger = logging.getLogger(__name__)

# The vendor measured 30-45 s for a first-time pass and 60-95 s with a
# regeneration, and cuts itself off at 100 s plus one retry. The read timeout
# is between bytes; keep-alive pings arrive throughout, so it only has to
# outlast a silent stretch, not the whole run.
TIMEOUT = (12, 150)
MAX_DESIGNS = 6
MAX_FABRICS = 3
MAX_IMAGE_BYTES = 12 * 1024 * 1024
FETCH_TIMEOUT = 15
CLOUDINARY = re.compile(r'^https://res\.cloudinary\.com/', re.I)
DATA_URI = re.compile(r'^data:image/[\w.+-]+;base64,', re.I)
# Slots that clothe the whole garment: their roll is the main fabric, which
# the vendor wants with no appliesTo. Every other slot names a part.
MAIN_SLOTS = {'MAIN_FABRIC', 'SAREE_BODY'}


def _url():
    return getattr(settings, 'DESIGN_STUDIO_URL', '').rstrip('/')


def available():
    return bool(configured() and _url())


def _image_source(url):
    """What the vendor accepts for one picture: a Cloudinary link as it is,
    anything else fetched and inlined as base64.

    Production storage is Cloudinary, so live orders pass links through. A
    development server stores under /media/, which the vendor can neither see
    nor is allowed to fetch; the bytes are read from our own storage instead.
    """
    url = (url or '').strip()
    if not url:
        raise DiscoveryError('A chosen picture has no address.', status=400)
    if CLOUDINARY.match(url) or DATA_URI.match(url):
        return url

    data = b''
    name = url.split('/media/', 1)[1] if '/media/' in url else ''
    if name and default_storage.exists(name):
        with default_storage.open(name, 'rb') as fh:
            data = fh.read(MAX_IMAGE_BYTES + 1)
        mime = mimetypes.guess_type(name)[0] or 'image/jpeg'
    elif re.match(r'^https?://', url, re.I):
        try:
            res = requests.get(url, timeout=FETCH_TIMEOUT, stream=True,
                               headers={'User-Agent': 'Mozilla/5.0 (compatible; ScaleezyCRM/1.0)'})
            res.raise_for_status()
            mime = (res.headers.get('Content-Type') or '').split(';')[0].strip().lower() or 'image/jpeg'
            for chunk in res.iter_content(65536):
                data += chunk
                if len(data) > MAX_IMAGE_BYTES:
                    break
        except requests.RequestException:
            logger.warning('Preview: reference could not be fetched: %s', url, exc_info=True)
            raise DiscoveryError('One of the chosen pictures could not be read.', status=422)
    else:
        raise DiscoveryError('One of the chosen pictures could not be read.', status=422)

    if not data:
        raise DiscoveryError('One of the chosen pictures is empty.', status=422)
    if len(data) > MAX_IMAGE_BYTES:
        raise DiscoveryError('One of the chosen pictures is over 12 MB.', status=422)
    return f'data:{mime};base64,{base64.b64encode(data).decode()}'


def build_payload(*, client_id, garment_key, parts, part_refs=None, fabrics=None,
                  fabric_items=None, fabric_slots=(), notes='', product_name='',
                  model_image=''):
    """The vendor's request off the wizard's own maps. Pure, so it is testable
    without the vendor: pictures are passed by address and resolved by the
    caller (see `resolve_images`).

    parts        {part_key: {image_url, ...}}   the photograph chosen per part
    part_refs    {part_key: [{image_url, ...}]}  the customer's own, per part
    fabrics      {slot: [inventory id]}          the wizard's slot map
    fabric_items {id: {name, material_type, color, color_hex, image_url, item_code}}
    fabric_slots the slots the garment's fabric taxonomy declares; anything
                 else in the map is an accessory and never a fabric
    model_image  the person to dress -- the plain garment on a model the
                 review step shows -- sent as the vendor's modelImageUrl
    """
    garment_id = GARMENT_IDS.get((garment_key or '').lower(), '')
    if not garment_id:
        raise DiscoveryError('A preview is not available for this garment yet.', status=400)

    designs, seen = [], set()
    chosen = dict(parts or {})
    for part, refs in (part_refs or {}).items():
        if not chosen.get(part) and refs:
            chosen[part] = next((r for r in refs if (r or {}).get('image_url')), None)
    for part, image in chosen.items():
        url = (image or {}).get('image_url')
        if not url:
            continue
        area = area_for_part(garment_id, part)
        # Parts that are not a place on the garment (embroidery, print) have
        # no area on their side; one design per area, the first chosen wins.
        if not area or area in seen:
            continue
        seen.add(area)
        designs.append({'area': area, 'image': url})
    if not designs:
        raise DiscoveryError('Choose at least one design for this garment first.', status=400)

    out_fabrics, main_taken, areas_taken = [], False, set()
    items = fabric_items or {}
    for slot, ids in (fabrics or {}).items():
        if slot not in fabric_slots:
            continue
        for item_id in (ids if isinstance(ids, list) else [ids]):
            item = items.get(str(item_id))
            if not item or not item.get('image_url'):
                continue
            row = {'image': item['image_url']}
            if slot in MAIN_SLOTS:
                if main_taken:
                    continue
                main_taken = True
            else:
                area = area_for_part(garment_id, slot)
                if not area or area in areas_taken:
                    continue
                areas_taken.add(area)
                row['appliesTo'] = [area]
            for ours, theirs, limit in (('name', 'name', 80), ('material_type', 'material', 120),
                                        ('color', 'color', 60), ('item_code', 'itemCode', 40)):
                if item.get(ours):
                    row[theirs] = str(item[ours])[:limit]
            if re.match(r'^#[0-9a-fA-F]{6}$', item.get('color_hex') or ''):
                row['colorHex'] = item['color_hex']
            out_fabrics.append(row)

    payload = {
        'clientId': str(client_id)[:128],
        'garment': garment_id,
        'designs': designs[:MAX_DESIGNS],
        'fabrics': out_fabrics[:MAX_FABRICS],
    }
    if notes and notes.strip():
        payload['notes'] = notes.strip()[:600]
    if product_name and product_name.strip():
        payload['productName'] = product_name.strip()[:120]
    if model_image and model_image.strip():
        payload['modelImageUrl'] = model_image.strip()
    return payload


def resolve_images(payload):
    for row in payload['designs'] + payload['fabrics']:
        row['image'] = _image_source(row['image'])
    if payload.get('modelImageUrl'):
        payload['modelImageUrl'] = _image_source(payload['modelImageUrl'])
    return payload


def _refusal(res):
    """Map the vendor's pre-stream refusal onto what we answer with."""
    try:
        error = (res.json() or {}).get('error') or {}
    except ValueError:
        error = {}
    message = error.get('message') or 'The preview service refused the request.'
    details = '; '.join(
        f"{d.get('field')}: {d.get('message')}" if d.get('field') else str(d.get('message') or d)
        for d in (error.get('details') or []) if d)
    if details:
        message = f'{message} {details}'
    if res.status_code == 401:
        raise DiscoveryError('The preview service key was refused.', status=503)
    if res.status_code == 429:
        raise DiscoveryError('The preview service is busy. Wait a minute and try again.', status=429)
    if res.status_code in (400, 413, 422):
        raise DiscoveryError(message, status=res.status_code)
    raise DiscoveryError('The preview service is not answering. Try again in a moment.', status=502)


def generate(payload):
    """POST the payload, read the stream to its end, return the photograph.

    Returns {image, width, height, quality, warnings, attempts}; `image` is
    the data URI the vendor sent. Raises DiscoveryError for every way it can
    not happen, with a status the view can answer with.
    """
    if not available():
        raise DiscoveryError('Garment preview is not set up on this server.', status=503)
    try:
        res = requests.post(f'{_url()}/generate', json=payload, headers=_headers(),
                            timeout=TIMEOUT, stream=True)
    except requests.RequestException:
        logger.warning('Preview: generate request failed', exc_info=True)
        raise DiscoveryError('The preview service did not answer. Try again in a moment.')

    if res.status_code != 200 or 'text/event-stream' not in (res.headers.get('Content-Type') or ''):
        _refusal(res)

    image, done, warnings = None, {}, []
    try:
        for line in res.iter_lines(decode_unicode=True):
            if not line or not line.startswith('data:'):
                continue     # keep-alive pings and frame separators
            try:
                event = json.loads(line[5:].strip())
            except ValueError:
                continue
            kind = event.get('type')
            if kind in ('start', 'brief'):
                warnings += [str(w) for w in (event.get('warnings') or [])]
            elif kind == 'image':
                image = event
            elif kind == 'done':
                done = event
            elif kind == 'error':
                code = event.get('code') or ''
                message = event.get('message') or 'The preview could not be made.'
                if code in ('GENERATION_BLOCKED', 'GENERATION_REJECTED'):
                    raise DiscoveryError(f'{message} Try different pictures.', status=422)
                if code == 'CANCELLED':
                    raise DiscoveryError('The preview was cancelled.', status=409)
                if code == 'MODEL_QUOTA_EXCEEDED':
                    raise DiscoveryError('The preview service has used up its allowance.', status=503)
                raise DiscoveryError(f'{message} Try again.', status=502)
    except requests.RequestException:
        logger.warning('Preview: stream broke', exc_info=True)
        raise DiscoveryError('The preview took too long. Try again.', status=504)
    finally:
        res.close()

    if not image or not image.get('image'):
        raise DiscoveryError('The preview service ended without a photograph. Try again.', status=502)
    return {
        'image': image['image'],
        'width': image.get('width'),
        'height': image.get('height'),
        'quality': done.get('quality') or {},
        'attempts': done.get('attempts'),
        'warnings': warnings,
    }


def keep(data_uri):
    """Save the photograph into our storage; return the stored path.

    Same reason web_search.keep exists: the picture has to be on the order
    for as long as the order is, and a base64 blob does not belong in a
    JSON draft.
    """
    match = re.match(r'^data:(image/[\w.+-]+);base64,(.+)$', data_uri or '', re.S)
    if not match:
        raise DiscoveryError('The preview service sent an unreadable photograph.', status=502)
    try:
        data = base64.b64decode(match.group(2))
    except ValueError:
        raise DiscoveryError('The preview service sent an unreadable photograph.', status=502)
    ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}.get(match.group(1), 'jpg')
    return default_storage.save(f'design_previews/{uuid.uuid4()}.{ext}', ContentFile(data))


def cancel(client_id):
    """Best effort: stop whatever this client has running. Never raises."""
    if not available():
        return False
    try:
        res = requests.post(f'{_url()}/cancel', json={'clientId': str(client_id)[:128]},
                            headers=_headers(), timeout=TIMEOUT[0])
        return bool(res.ok and (res.json() or {}).get('cancelled'))
    except (requests.RequestException, ValueError):
        return False
