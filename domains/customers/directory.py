"""The Customers page, one page at a time.

The page used to download every customer -- 1,472 rows, 1.6 MB for one
boutique on production -- and filter, sort, count and page them in the browser.
This does the same work here and sends back one page plus the counts the page
draws (the stat cards, the tier chips, the A-Z strip and the filter menus).

The rules are a port of frontend/src/features/customers/filterRules.js and the
directory code in App.jsx, so the same filters pick the same customers. They
run in Python over one slim read of the boutique's customers rather than in
SQL, because several of them -- a birthday in the next 30 days that wraps the
year, the country of a stored mobile -- are far clearer, and easier to keep
identical to the browser's version, as Python than as SQL. The customer rows themselves
are fetched only for the page being shown.
"""

import re
import unicodedata
from datetime import date, timedelta

from django.utils import timezone

from core.dial_codes import DIAL_CODES

TIERS = ('Platinum', 'Gold', 'Silver')
LETTERS = tuple('ABCDEFGHIJKLMNOPQRSTUVWXYZ') + ('#',)
PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100

#: Query parameters, each with the values filterRules.js offers. Anything else
#: is ignored rather than refused, as the browser's version ignored it.
CHOICES = {
    'orders': ('with', 'repeat', 'none'),
    'added': ('month', '30', '90', 'year'),
    'birthday': ('month', 'next30', 'missing'),
    'sort': ('newest', 'oldest', 'name_asc', 'name_desc', 'orders', 'spend'),
}

_SLIM = ('id', 'first_name', 'last_name', 'mobile_number', 'email_address', 'created_at',
         'date_of_birth', 'source', 'gender', 'city_region', 'customer_type', 'is_lead',
         'orders_count', 'orders_total_spend')


# ---- one customer's facts, as filterRules.js reads them ---------------------

def full_name(row):
    return f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()


def tier_of(row):
    return row['customer_type'] if row['customer_type'] in TIERS else 'Silver'


def order_count(row):
    return row['orders_count'] or 0


def is_lead(row):
    """A portal sign-up nobody has contacted or taken an order for yet."""
    return bool(row['is_lead']) and not order_count(row) > 0


def letter_of(row):
    first = full_name(row)[:1].upper()
    return first if len(first) == 1 and 'A' <= first <= 'Z' else '#'


def dial_of(mobile):
    """The country code of a stored mobile: splitStoredMobile in services/phone.js.

    Indian numbers are kept as 91 + ten digits; ten digits or fewer is an Indian
    number typed without its code; anything longer carries its own code, the
    longest known one winning.
    """
    digits = re.sub(r'\D', '', mobile or '')
    if len(digits) == 12 and digits.startswith('91'):
        return '91'
    if len(digits) <= 10:
        return '91'
    for length in (4, 3, 2, 1):
        if digits[:length] in DIAL_CODES:
            return digits[:length]
    return '91'


def _clean(value):
    return str(value or '').strip()


def city_of(row):
    return re.sub(r'\s+', ' ', _clean(row['city_region']))


def _added_matches(row, when, now, today):
    created = row['created_at']
    if created is None:
        return False
    local = timezone.localtime(created).date()
    if when == 'month':
        return (local.year, local.month) == (today.year, today.month)
    if when == 'year':
        return local.year == today.year
    return now - created <= timedelta(days=int(when))


def _birthday_on(year, month, day):
    # JS new Date(y, 1, 29) in a common year rolls over to 1 March.
    try:
        return date(year, month, day)
    except ValueError:
        return date(year, month, 1) + timedelta(days=day - 1)


def _birthday_matches(row, when, today):
    born = row['date_of_birth']
    if when == 'missing':
        return not born
    if not born:
        return False
    if when == 'month':
        return born.month == today.month
    upcoming = _birthday_on(today.year, born.month, born.day)
    if upcoming < today:
        upcoming = _birthday_on(today.year + 1, born.month, born.day)
    return (upcoming - today).days <= 30


def _name_key(row):
    # localeCompare(..., { sensitivity: 'base' }): case and accents ignored.
    decomposed = unicodedata.normalize('NFKD', full_name(row))
    return ''.join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


# ---- the page ---------------------------------------------------------------

def _value_options(rows, pick, key_of=None):
    """Distinct values with their counts, most common first (valueOptions in filterRules.js)."""
    entries = {}
    for row in rows:
        label = pick(row)
        if not label:
            continue
        key = key_of(row) if key_of else label
        entry = entries.setdefault(key, {'key': key, 'label': label, 'count': 0})
        entry['count'] += 1
    return sorted(entries.values(), key=lambda e: (-e['count'], e['label'].casefold()))


def facets_for(rows):
    """What the filter bar offers, counted over the page's book (customers or leads)."""
    countries = {}
    for row in rows:
        dial = dial_of(row['mobile_number'])
        countries[dial] = countries.get(dial, 0) + 1
    genders = _value_options(rows, lambda r: _clean(r['gender']))
    unset = sum(1 for r in rows if not _clean(r['gender']))
    if unset:
        genders.append({'key': '__none', 'label': 'Not set', 'count': unset})
    letters = dict.fromkeys(LETTERS, 0)
    for row in rows:
        letters[letter_of(row)] += 1
    return {
        'countries': [{'key': dial, 'count': n} for dial, n in
                      sorted(countries.items(), key=lambda item: (-item[1], int(item[0])))],
        'sources': _value_options(rows, lambda r: _clean(r['source'])),
        'genders': genders,
        'cities': _value_options(rows, city_of, lambda r: city_of(r).lower()),
        'letters': letters,
    }


def summary_for(rows, today):
    """The stat cards and tier chips, over the page's book."""
    tiers = dict.fromkeys(TIERS, 0)
    for row in rows:
        tiers[tier_of(row)] += 1
    return {
        'total': len(rows),
        'with_orders': sum(1 for r in rows if order_count(r) > 0),
        'new_this_month': sum(1 for r in rows if _added_matches(r, 'month', None, today)),
        'tiers': tiers,
    }


def _matches(row, params, now, today):
    term = params['search'].lower()
    if term and not (term in full_name(row).lower()
                     or term in (row['mobile_number'] or '')
                     or term in (row['email_address'] or '').lower()):
        return False
    if params['tier'] and tier_of(row) != params['tier']:
        return False
    if params['country'] and dial_of(row['mobile_number']) != params['country']:
        return False
    if params['letter'] and letter_of(row) != params['letter']:
        return False
    orders = order_count(row)
    if params['orders'] == 'with' and orders < 1:
        return False
    if params['orders'] == 'repeat' and orders < 2:
        return False
    if params['orders'] == 'none' and orders > 0:
        return False
    if params['added'] and not _added_matches(row, params['added'], now, today):
        return False
    if params['birthday'] and not _birthday_matches(row, params['birthday'], today):
        return False
    if params['source'] and _clean(row['source']) != params['source']:
        return False
    if params['gender'] == '__none' and _clean(row['gender']):
        return False
    if params['gender'] and params['gender'] != '__none' and _clean(row['gender']) != params['gender']:
        return False
    if params['city'] and city_of(row).lower() != params['city']:
        return False
    return True


def _sorted(rows, sort):
    if sort == 'newest':
        return sorted(rows, key=lambda r: r['created_at'], reverse=True)
    if sort == 'oldest':
        return sorted(rows, key=lambda r: r['created_at'])
    if sort == 'name_asc':
        return sorted(rows, key=_name_key)
    if sort == 'name_desc':
        return sorted(rows, key=_name_key, reverse=True)
    if sort == 'orders':
        return sorted(rows, key=lambda r: (-order_count(r), _name_key(r)))
    if sort == 'spend':
        return sorted(rows, key=lambda r: (-float(r['orders_total_spend'] or 0), _name_key(r)))
    return rows  # the queryset's own order: newest first


def _int(raw, default, lo, hi):
    try:
        return min(max(int(raw), lo), hi)
    except (TypeError, ValueError):
        return default


def read_params(query):
    """The directory's query string, cleaned. Unknown values are dropped."""
    params = {key: (query.get(key) or '').strip() for key in (
        'search', 'view', 'tier', 'country', 'letter', 'orders',
        'added', 'birthday', 'source', 'gender', 'city', 'sort')}
    for key, allowed in CHOICES.items():
        if params[key] not in allowed:
            params[key] = ''
    if params['tier'] not in TIERS:
        params['tier'] = ''
    if params['letter'] not in LETTERS:
        params['letter'] = ''
    if params['view'] not in ('customers', 'leads'):
        params['view'] = 'customers'
    params['city'] = params['city'].lower()
    params['page'] = _int(query.get('page'), 1, 1, 10 ** 6)
    params['page_size'] = _int(query.get('page_size'), PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX)
    return params


def directory_page(queryset, query):
    """One page of the directory, its counts, and the ids to serialise.

    `queryset` is the customers this user may see, annotated as
    CustomerRepository.summary_queryset() annotates them. Returns the response
    body without `results`, and the page's ids in display order.
    """
    params = read_params(query)
    now = timezone.now()
    today = timezone.localdate()
    every = list(queryset.values(*_SLIM))
    book = [r for r in every if is_lead(r) == (params['view'] == 'leads')]
    chosen = _sorted([r for r in book if _matches(r, params, now, today)], params['sort'])

    count = len(chosen)
    page_count = max(1, -(-count // params['page_size']))
    page = min(params['page'], page_count)
    start = (page - 1) * params['page_size']
    ids = [r['id'] for r in chosen[start:start + params['page_size']]]
    body = {
        'count': count,
        'page': page,
        'page_size': params['page_size'],
        'page_count': page_count,
        'summary': summary_for(book, today),
        'facets': facets_for(book),
    }
    return body, ids
