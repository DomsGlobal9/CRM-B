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

The answer is an event stream (30-95 s for one side, up to ~240 s for front
and back, the vendor's default). It is read to the end here and each
photograph saved into our storage, so the browser gets plain URLs back and
the draft can carry them exactly as it carries a chosen design.
"""
import base64
import json
import logging
import mimetypes
import re
import time
import uuid

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .web_search import GARMENT_IDS, DiscoveryError, area_for_part, configured, design_areas, _headers

logger = logging.getLogger(__name__)

# The vendor: about a minute for most pictures, 2-3 minutes on a customer's
# own photo, and "set the timeout for generate to at least 4 minutes; do not
# cancel the request yourself before that". The read timeout is between
# bytes and keep-alive pings arrive every 10 s, so it never trips while the
# vendor is working; it is 4 minutes so a silent stretch is not cut short either.
TIMEOUT = (12, 240)
# When the stream ends without `done` or `error`, the finished job is
# collected from GET /result/{jobId}, asked every POLL_EVERY seconds.
POLL_EVERY = 10
# The whole preview -- stream plus collecting -- must answer before gunicorn's
# 300 s worker timeout (gunicorn.conf.py), with time left to save the pictures.
TOTAL_BUDGET = 270
# The vendor's own limit (GET /options maxDesigns; raised from 6 on 13 Oct
# 2026): a design-library saree has 7 parts, and the 7th used to be cut here.
MAX_DESIGNS = 8
MAX_FABRICS = 3
MAX_IMAGE_BYTES = 12 * 1024 * 1024
FETCH_TIMEOUT = 15
CLOUDINARY = re.compile(r'^https://res\.cloudinary\.com/', re.I)
DATA_URI = re.compile(r'^data:image/[\w.+-]+;base64,', re.I)
# Slots that clothe the whole garment: their roll is the main fabric, which
# the vendor wants with no appliesTo. Every other slot names a part.
MAIN_SLOTS = {'MAIN_FABRIC', 'SAREE_BODY'}
# The vendor makes front then back by default; `views` asks for one side.
VIEWS = ('front', 'back')
# How the garment is shown; the first is the vendor's default and is not sent.
PRESENTATIONS = ('model', 'mannequin', 'sketch')
MAX_MEASUREMENTS = 40
# Our templates say 'Inches'; the vendor gets one short spelling per unit.
MEASUREMENT_UNITS = {'in': 'in', 'inch': 'in', 'inches': 'in', 'cm': 'cm', 'centimetres': 'cm',
                     'centimeters': 'cm', 'm': 'm', 'metre': 'm', 'metres': 'm', 'meter': 'm', 'meters': 'm'}


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
                  model_image='', views=None, measurements=None, presentation='model',
                  model_gender='', pair_with=None, keep_motif_colors=True, coverage='full'):
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
    views        ['front'] or ['back'] for one side; empty or both leaves it
                 out, and the vendor makes front and back
    measurements [{key, label, value, unit}] the customer's, for a picture
                 on the customer; sent only once the vendor takes them
                 (settings.DESIGN_STUDIO_SEND_MEASUREMENTS)
    presentation 'model' (a photograph on a person), 'mannequin' (on a
                 headless dress form) or 'sketch' (one labelled illustration)
    model_gender 'female' or 'male'; the vendor defaults to female
    pair_with    {color, color_hex, note}: what the product is worn with
    keep_motif_colors / coverage  applied to every design (vendor defaults:
                 True / 'full')
    """
    garment_id = GARMENT_IDS.get((garment_key or '').lower(), '')
    if not garment_id:
        raise DiscoveryError('A preview is not available for this garment yet.', status=400)
    # Without the vendor's areas no design can be placed; that is the vendor
    # not answering, not the customer having chosen nothing.
    if not design_areas(garment_id):
        raise DiscoveryError('The design service is not answering right now. '
                             'Try again in a minute.', status=503)

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
        row = {'area': area, 'image': url}
        # The design's own caption is its instruction (the vendor's designs[].note).
        note = str((image or {}).get('caption') or (image or {}).get('note') or '').strip()
        if note:
            row['note'] = note[:300]
        if not keep_motif_colors:
            row['keepMotifColors'] = False
        if coverage == 'reference':
            row['coverage'] = 'reference'
        designs.append(row)
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
    if presentation in PRESENTATIONS[1:]:
        payload['presentation'] = presentation
    elif model_image and model_image.strip():
        # A model photo dresses a real person, so it goes with `model` only
        # (with a mannequin or a sketch the vendor refuses it).
        payload['modelImageUrl'] = model_image.strip()
    if model_gender in ('female', 'male'):
        payload['modelGender'] = model_gender
    pair = _pair_with(pair_with)
    if pair:
        payload['pairWith'] = pair
    wanted = [v for v in VIEWS if v in (views or ())]
    if len(wanted) == 1:
        payload['views'] = wanted
    # The live vendor refuses unknown fields, so this waits on its new version.
    rows = _measurements(measurements)
    if rows and getattr(settings, 'DESIGN_STUDIO_SEND_MEASUREMENTS', False):
        payload['measurements'] = rows
    return payload


def _pair_with(raw):
    """The vendor's pairWith off ours, keeping only what it accepts."""
    raw = raw if isinstance(raw, dict) else {}
    pair = {}
    if str(raw.get('color') or '').strip():
        pair['color'] = str(raw['color']).strip()[:60]
    if re.match(r'^#[0-9a-fA-F]{6}$', str(raw.get('color_hex') or '')):
        pair['colorHex'] = raw['color_hex']
    if str(raw.get('note') or '').strip():
        pair['note'] = str(raw['note']).strip()[:300]
    return pair


def _measurements(raw):
    """Positive numbers only, each with a short key, label and known unit."""
    rows = []
    for row in raw if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        try:
            value = round(float(row.get('value')), 2)
        except (TypeError, ValueError):
            continue
        key = re.sub(r'[^a-z0-9_]', '', str(row.get('key') or '').lower())[:40]
        unit = MEASUREMENT_UNITS.get(str(row.get('unit') or 'in').strip().lower())
        if not key or not 0 < value < 1000 or not unit:
            continue
        rows.append({'key': key, 'label': str(row.get('label') or key)[:60], 'value': value, 'unit': unit})
    return rows[:MAX_MEASUREMENTS]


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
    if res.status_code in (500, 502, 503, 504):
        raise Momentary('The preview service is not answering. Try again in a moment.')
    raise DiscoveryError('The preview service is not answering. Try again in a moment.', status=502)


class Momentary(DiscoveryError):
    """A failure on the way to the vendor in which nothing was generated: the
    vendor's own advice is to send the same request once more, 2 s later."""

    def __init__(self, message):
        super().__init__(message, status=502)


RETRY_AFTER = 2


def generate(payload):
    """POST the payload, read the stream to its end, return the photographs.

    Returns {images, width, height, quality, warnings, attempts, annotations,
    presentation}; `images` is {view: data URI} in the vendor's order (front,
    then back, or one 'sheet'). Raises DiscoveryError for every way it can not
    happen, with a status the view can answer with. A momentary failure is
    tried once more; a stream cut off mid-job is collected by its jobId.
    """
    if not available():
        raise DiscoveryError('Garment preview is not set up on this server.', status=503)
    deadline = time.monotonic() + TOTAL_BUDGET
    try:
        return _attempt(payload, deadline)
    except Momentary:
        logger.info('Preview: momentary failure, retrying once in %ss', RETRY_AFTER)
    time.sleep(RETRY_AFTER)
    return _attempt(payload, deadline)


def _raise_for(code, message):
    """The vendor's error (in the stream or in a collected result) as ours."""
    message = message or 'The preview could not be made.'
    if code in ('GENERATION_BLOCKED', 'GENERATION_REJECTED'):
        raise DiscoveryError(f'{message} Try different pictures.', status=422)
    if code == 'CANCELLED':
        raise DiscoveryError('The preview was cancelled.', status=409)
    if code == 'MODEL_QUOTA_EXCEEDED':
        raise DiscoveryError('The preview service has used up its allowance.', status=503)
    raise DiscoveryError(f'{message} Try again.', status=502)


def _attempt(payload, deadline):
    try:
        res = requests.post(f'{_url()}/generate', json=payload, headers=_headers(),
                            timeout=TIMEOUT, stream=True)
    except requests.RequestException:
        logger.warning('Preview: generate request failed', exc_info=True)
        raise DiscoveryError('The preview service did not answer. Try again in a moment.')

    if res.status_code != 200 or 'text/event-stream' not in (res.headers.get('Content-Type') or ''):
        _refusal(res)

    images, first, done, warnings, events, annotations = {}, {}, {}, [], 0, []
    job_id, finished = '', False
    try:
        for line in res.iter_lines(decode_unicode=True):
            if not line or not line.startswith('data:'):
                continue     # keep-alive pings and frame separators
            try:
                event = json.loads(line[5:].strip())
            except ValueError:
                continue
            events += 1
            kind = event.get('type')
            if kind in ('start', 'brief'):
                # The first event names the job, so a cut-off stream can still be collected.
                job_id = job_id or str(event.get('jobId') or '')
                warnings += [str(w) for w in (event.get('warnings') or [])]
            elif kind == 'image' and event.get('image'):
                # An event with no view is the older single photograph: the
                # front. A sketch arrives once, as view 'sheet', with its labels.
                images[event.get('view') or 'front'] = event['image']
                first = first or event
                annotations = event.get('annotations') or annotations
            elif kind == 'done':
                done, finished = event, True
            elif kind == 'error':
                finished = True
                _raise_for(event.get('code') or '', event.get('message'))
    except requests.RequestException:
        # Cut on the way while the job may well be running on: collected below.
        logger.warning('Preview: stream broke (job %s)', job_id or 'unknown', exc_info=True)
        if not job_id:
            raise DiscoveryError('The connection to the preview service broke. Try again.', status=504)
    finally:
        res.close()

    if not finished and job_id:
        logger.info('Preview: stream ended without done/error; collecting job %s', job_id)
        return _collect(job_id, deadline, warnings)
    if not images:
        if not events:   # closed before `start`: nothing was made
            raise Momentary('The preview service ended without a photograph. Try again.')
        raise DiscoveryError('The preview service ended without a photograph. Try again.', status=502)
    return {
        'images': images,
        'width': first.get('width'),
        'height': first.get('height'),
        'quality': done.get('quality') or {},
        'attempts': done.get('attempts'),
        'warnings': warnings,
        'annotations': annotations,
        'presentation': done.get('presentation') or 'model',
    }


def _collect(job_id, deadline, warnings):
    """Ask GET /result/{jobId} every POLL_EVERY seconds until the job is done.

    Free on the vendor's side (no new picture) and only for our own key; a
    finished job is kept 15 minutes. Stops at the request's deadline rather
    than outlive the worker.
    """
    url = f'{_url()}/result/{job_id}'
    while True:
        body = None
        try:
            res = requests.get(url, headers=_headers(), timeout=(TIMEOUT[0], 30))
            if res.status_code == 404:
                raise DiscoveryError('The picture could not be collected any more. Draw it again.', status=502)
            if res.ok:
                body = res.json() or {}
        except (requests.RequestException, ValueError):
            logger.warning('Preview: collecting job %s failed once', job_id, exc_info=True)

        state = (body or {}).get('status')
        if state == 'done':
            return _collected(body, warnings)
        if state in ('error', 'cancelled'):
            error = body.get('error')
            code = error.get('code') if isinstance(error, dict) else ('CANCELLED' if state == 'cancelled' else '')
            message = error.get('message') if isinstance(error, dict) else error
            _raise_for(code or '', message)
        if time.monotonic() + POLL_EVERY > deadline:
            raise DiscoveryError('The picture is still being made. Draw again in a minute to see it.', status=504)
        time.sleep(POLL_EVERY)


def _collected(body, warnings):
    """A finished job from /result in the same shape the stream gives."""
    raw = body.get('images') or {}
    entries = (list(raw.items()) if isinstance(raw, dict)
               else [((r or {}).get('view') or 'front', r) for r in raw] if isinstance(raw, list) else [])
    images, first, annotations = {}, {}, body.get('annotations') or []
    for view, entry in entries:
        image = entry.get('image') if isinstance(entry, dict) else entry
        if not image:
            continue
        images[view] = image
        if isinstance(entry, dict):
            first = first or entry
            annotations = entry.get('annotations') or annotations
    if not images:
        raise DiscoveryError('The preview service finished without a photograph. Try again.', status=502)
    return {
        'images': images,
        'width': first.get('width') or body.get('width'),
        'height': first.get('height') or body.get('height'),
        'quality': body.get('quality') or {},
        'attempts': body.get('attempts'),
        'warnings': warnings,
        'annotations': annotations,
        'presentation': body.get('presentation') or 'model',
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
