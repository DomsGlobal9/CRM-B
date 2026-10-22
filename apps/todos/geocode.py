"""A place name for a to-do's coordinates, from free services only.

OpenStreetMap's Nominatim first, then Photon (komoot, also OpenStreetMap
data). Both are free with no key. Nominatim's usage policy asks for an
identifying User-Agent, at most one request a second and an "OpenStreetMap"
credit wherever the name is shown -- one lookup per to-do created is far
below that limit. Never raises: when neither answers, the name is '' and the
to-do keeps its coordinates and map link.
"""

import logging

import requests

logger = logging.getLogger(__name__)

USER_AGENT = 'ScaleezyCRM/1.0 (boutique to-do locations)'
TIMEOUT = 4  # seconds per service; the to-do save waits on this


def _nominatim(lat, lng):
    response = requests.get(
        'https://nominatim.openstreetmap.org/reverse',
        params={'lat': lat, 'lon': lng, 'format': 'jsonv2', 'zoom': 18},
        headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en'}, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json() or {}
    # display_name lists every ward and zone; keep what a person reads: place, road, area, city, state, PIN.
    a = data.get('address') or {}
    parts = [data.get('name'), a.get('road'), a.get('neighbourhood') or a.get('suburb'),
             a.get('city') or a.get('town') or a.get('village') or a.get('county'),
             a.get('state'), a.get('postcode')]
    return ', '.join(dict.fromkeys(str(p) for p in parts if p)) or data.get('display_name') or ''


def _photon(lat, lng):
    response = requests.get(
        'https://photon.komoot.io/reverse', params={'lat': lat, 'lon': lng},
        headers={'User-Agent': USER_AGENT}, timeout=TIMEOUT)
    response.raise_for_status()
    props = (((response.json() or {}).get('features') or [{}])[0]).get('properties') or {}
    parts = [props.get(k) for k in ('name', 'street', 'district', 'city', 'state', 'postcode', 'country')]
    return ', '.join(dict.fromkeys(str(p) for p in parts if p))


def place_name(lat, lng):
    """'Madhapur, Hyderabad, Telangana, 500081, India', or '' when no service answers."""
    for lookup in (_nominatim, _photon):
        try:
            name = lookup(lat, lng)
        except Exception:  # network, timeout, bad JSON: try the next, never fail the save
            logger.warning('place name lookup failed (%s)', lookup.__name__, exc_info=True)
            continue
        if name:
            return name[:255]
    return ''
