"""Bulk customer import from a spreadsheet.

One sheet, one customer per row, keyed on the mobile number. Every row goes
through CustomerSerializer so the file obeys exactly the rules the Add
Customer form does. An existing customer is only ever *filled in*: a cell
never overwrites a value the boutique already recorded.

`referred_by_mobile` names the customer who referred that row, by the same
canonical mobile the book is keyed on. The referrer must already be in the
book or be another row of the same sheet; one that is neither is reported on
the row and the customer is imported without a referral.
"""
import csv
import io
import re
from datetime import date, datetime

from rest_framework import serializers as drf_serializers

from apps.catalog.definitions import all_templates
from core.validators import MAX_NOTE
from crm_api.models import Customer, CustomerReferral, Measurement, whatsapp_number
from crm_api.serializers import INCH_FIELDS, CustomerSerializer, GENDERS, SOURCES, TIERS
from domains.orders.drafts import first_error

MAX_ROWS = 2000

# Spreadsheet header (normalised) -> Customer field.
PROFILE_COLUMNS = {
    'mobile': 'mobile_number', 'mobile_number': 'mobile_number', 'phone': 'mobile_number',
    'phone_number': 'mobile_number', 'whatsapp': 'mobile_number', 'contact': 'mobile_number',
    'first_name': 'first_name', 'last_name': 'last_name',
    'email': 'email_address', 'email_id': 'email_address', 'email_address': 'email_address',
    'gender': 'gender', 'address': 'address',
    'city': 'city_region', 'city_region': 'city_region',
    'source': 'source', 'tier': 'customer_type', 'customer_type': 'customer_type',
    'date_of_birth': 'date_of_birth', 'dob': 'date_of_birth', 'notes': 'notes',
}
#: The column naming the referrer, by mobile. Not a Customer field: it is
#: resolved after every row of the sheet has been saved.
REFERRER_COLUMNS = frozenset({'referred_by_mobile', 'referred_by', 'referrer_mobile'})
MEASURE_ALIASES = {'chest': 'bust', 'hip': 'hips'}
CHOICES = {'gender': GENDERS, 'source': SOURCES, 'customer_type': TIERS}


def _template_measurement_keys():
    keys = set()
    for template in all_templates():
        for section in template['sections']:
            if section['key'] != 'measurements':
                continue
            keys.update(f['key'] for f in section['fields'] if f.get('unit') == 'Inches')
    return keys


def _norm_header(text):
    return re.sub(r'[^a-z0-9]+', '_', str(text or '').strip().lower()).strip('_')


def _cell(value):
    if value is None:
        return ''
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def read_sheet(upload):
    """Headers and (spreadsheet row number, cells) pairs of an .xlsx or .csv upload."""
    name = (upload.name or '').lower()
    if name.endswith('.csv'):
        text = upload.read().decode('utf-8-sig', errors='replace')
        rows = list(csv.reader(io.StringIO(text)))
    elif name.endswith('.xlsx'):
        from openpyxl import load_workbook
        sheet = load_workbook(upload, read_only=True, data_only=True).worksheets[0]
        rows = [list(r) for r in sheet.iter_rows(values_only=True)]
    else:
        raise drf_serializers.ValidationError('Upload an .xlsx or .csv file.')
    rows = [[_cell(v) for v in r] for r in rows]
    # The sample sheet carries a colour-band row above the headers: the header
    # row is the first one that names the mobile column.
    for i, row in enumerate(rows):
        if any(PROFILE_COLUMNS.get(_norm_header(h)) == 'mobile_number' for h in row):
            headers = [_norm_header(h) for h in row]
            data = [(i + 2 + j, r) for j, r in enumerate(rows[i + 1:]) if any(r)]
            return headers, data
    raise drf_serializers.ValidationError('The sheet needs a "mobile" column.')


def _choice(field, value):
    for option in CHOICES[field]:
        if option.lower() == value.lower():
            return option
    return value  # the serializer names the allowed values in its refusal


def _row_payload(headers, row, measurement_keys, ignored, referrals=True):
    """One row -> (serializer payload, sheet extras, referrer mobile) or a row-level error.

    Without `referrals` -- an import by anyone but the owner -- the referrer
    column is read as any other unknown column is: listed as ignored, and
    nothing is recorded from it.
    """
    profile, sheet, extras = {}, {}, {}
    full_name = None
    referrer = ''
    for header, raw in zip(headers, row):
        if not header or raw == '':
            continue
        # One name column: the first word is the first name, the rest the last.
        if header == 'full_name':
            full_name = ' '.join(raw.split()).partition(' ')
            continue
        if header in REFERRER_COLUMNS:
            if referrals:
                referrer = referrer or raw
            else:
                ignored.add(header)
            continue
        if header in PROFILE_COLUMNS:
            field = PROFILE_COLUMNS[header]
            profile[field] = _choice(field, raw) if field in CHOICES else raw
            continue
        key = MEASURE_ALIASES.get(header, header)
        if key in INCH_FIELDS or key in measurement_keys:
            try:
                number = round(float(raw), 2)
            except ValueError:
                raise drf_serializers.ValidationError(f'{header}: "{raw}" is not a number.')
            (sheet if key in INCH_FIELDS else extras)[key] = number
        else:
            ignored.add(header)
    if full_name:
        profile.setdefault('first_name', full_name[0])
        if full_name[2]:
            profile.setdefault('last_name', full_name[2])
    if 'mobile_number' not in profile:
        raise drf_serializers.ValidationError('Mobile number is missing.')
    return profile, sheet, extras, referrer


def _merge(target, source):
    """Fill target's blanks from source; never overwrite."""
    for key, value in source.items():
        if key not in target or target[key] in (None, '', {}):
            target[key] = value


def _fill_existing(customer, profile, sheet, extras):
    """The subset of the row that lands on blank fields of an existing customer."""
    data = {k: v for k, v in profile.items()
            if k not in ('mobile_number', 'first_name', 'last_name') and not getattr(customer, k)}
    sheet_row = Measurement.objects.filter(customer=customer).first()
    measurements = {k: v for k, v in sheet.items() if sheet_row is None or getattr(sheet_row, k) is None}
    have = dict(sheet_row.additional_measurements) if sheet_row else {}
    new_extras = {k: v for k, v in extras.items() if have.get(k) in (None, '')}
    if new_extras:
        measurements['additional_measurements'] = {**have, **new_extras}
    if measurements:
        data['measurements'] = measurements
    return data


def _plan_referrals(valid):
    """Settle each row's `referred_by_mobile` before anything is saved.

    Sets `referrer_mobile` on the rows whose referral can go ahead -- the
    canonical mobile of a referrer who is either already in the book or
    another row of this same sheet -- and leaves a note on the rows where it
    cannot. A refusal here never removes the row from the import: the
    customer is added or filled in exactly as they would be without the
    column.
    """
    for item in valid:
        item['referrer_mobile'] = ''
    wanted = [item for item in valid if item.get('referrer')]
    if not wanted:
        return

    in_sheet = {item['mobile'] for item in valid}
    known = set(Customer.objects.filter(
        mobile_number__in={whatsapp_number(item['referrer']) for item in wanted} - {''}
    ).values_list('mobile_number', flat=True))
    already = set(CustomerReferral.objects.filter(
        referred__in=[item['customer'] for item in wanted if item['customer'] is not None]
    ).values_list('referred_id', flat=True))

    for item in wanted:
        raw = item['referrer']
        mobile = whatsapp_number(raw)
        if not mobile:
            item['notes'].append(f'Referrer "{raw}" is not a valid mobile number, '
                                 'so no referral was recorded.')
        elif mobile == item['mobile']:
            item['notes'].append('A customer cannot refer themselves.')
        elif mobile not in known and mobile not in in_sheet:
            item['notes'].append(f'Referrer {raw} not found, so no referral was recorded.')
        elif item['customer'] is not None and item['customer'].pk in already:
            item['notes'].append('They already have a referrer on file, which was kept.')
        else:
            item['referrer_mobile'] = mobile


def _save_referrals(valid, user):
    """Record the referrals _plan_referrals settled, every customer now saved.

    Runs inside the import's transaction and after every row of the sheet has
    been written, so a referrer named by another row of the same file is found
    here exactly as one already in the book is. The referrer's own profile is
    not touched.
    """
    wanted = [item for item in valid if item.get('referrer_mobile')]
    if not wanted:
        return
    user = user if getattr(user, 'is_authenticated', False) else None
    referrers = {c.mobile_number: c for c in Customer.objects.filter(
        mobile_number__in={item['referrer_mobile'] for item in wanted})}
    taken = set(CustomerReferral.objects.filter(
        referred__in=[item['customer'] for item in wanted]).values_list('referred_id', flat=True))
    rows = []
    for item in wanted:
        referrer, customer = referrers.get(item['referrer_mobile']), item['customer']
        if referrer is None or referrer.pk == customer.pk or customer.pk in taken:
            continue
        taken.add(customer.pk)
        rows.append(CustomerReferral(referrer=referrer, referred=customer, created_by=user,
                                     referrer_name_snapshot=f'{referrer.first_name} {referrer.last_name}'.strip(),
                                     referrer_mobile_snapshot=referrer.mobile_number))
    CustomerReferral.objects.bulk_create(rows)


def import_customers(upload, *, commit=False, user=None, referrals=True):
    """Validate every row; with commit, save the valid ones in one transaction.

    Returns {'valid': [...], 'errors': [...], 'ignored_columns': [...]} and,
    after a commit, 'created' / 'updated' counts.

    `referrals` is the caller's permission to record what `referred_by_mobile`
    says, which only the owner has; without it the column is ignored. A
    referral that cannot be recorded never costs the row its import -- the
    customer lands either way and the reason is a note on the row.
    """
    from django.db import transaction

    headers, data = read_sheet(upload)
    if len(data) > MAX_ROWS:
        raise drf_serializers.ValidationError(
            f'Up to {MAX_ROWS} customers per upload; this sheet has {len(data)}.')
    if 'full_name' not in headers and 'first_name' not in headers:
        raise drf_serializers.ValidationError('The sheet needs a "full_name" column (or "first_name").')

    measurement_keys = _template_measurement_keys()
    ignored = set()
    errors = []
    # Rows sharing a mobile collapse into one payload, first row winning.
    merged = {}
    for index, row in data:
        try:
            profile, sheet, extras, referrer = _row_payload(
                headers, row, measurement_keys, ignored, referrals)
        except drf_serializers.ValidationError as exc:
            errors.append({'row': index, 'error': first_error(exc.detail)})
            continue
        key = whatsapp_number(profile['mobile_number']) or profile['mobile_number']
        if key in merged:
            entry = merged[key]
            entry['rows'].append(index)
            _merge(entry['profile'], profile)
            _merge(entry['sheet'], sheet)
            _merge(entry['extras'], extras)
            entry['referrer'] = entry['referrer'] or referrer
        else:
            merged[key] = {'rows': [index], 'profile': profile, 'sheet': sheet,
                           'extras': extras, 'referrer': referrer}

    existing = {c.mobile_number: c for c in Customer.objects.filter(mobile_number__in=list(merged))}

    valid = []
    for key, entry in merged.items():
        profile, sheet, extras = entry['profile'], entry['sheet'], entry['extras']
        customer = existing.get(key)
        notes = []
        if customer is None:
            payload = dict(profile)
            if sheet or extras:
                payload['measurements'] = {**sheet, 'additional_measurements': extras}
            serializer = CustomerSerializer(data=payload)
        else:
            payload = _fill_existing(customer, profile, sheet, extras)
            name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
            known = f"{customer.first_name} {customer.last_name}".strip()
            if name and name.lower() != known.lower():
                alias = f'Also known as: {name}'
                if alias.lower() not in (customer.notes or '').lower():
                    combined = f'{customer.notes}\n{alias}'.strip() if customer.notes else alias
                    if len(combined) <= MAX_NOTE:
                        payload['notes'] = combined
                notes.append(f'Name on file is "{known}"; "{name}" noted as an alias.')
            serializer = CustomerSerializer(customer, data=payload, partial=True)
        if not serializer.is_valid():
            field = next(iter(serializer.errors))
            message = first_error(serializer.errors)
            errors.append({'row': entry['rows'][0],
                           'error': message if field == 'non_field_errors' else f'{field}: {message}'})
            continue
        valid.append({
            'rows': entry['rows'], 'mobile': key, 'serializer': serializer,
            'name': f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip(),
            'action': 'update' if customer else 'create', 'notes': notes,
            'referrer': entry['referrer'], 'customer': customer,
        })

    _plan_referrals(valid)

    hidden = ('serializer', 'customer', 'referrer', 'referrer_mobile')
    result = {
        'valid': [{k: v for k, v in item.items() if k not in hidden} for item in valid],
        'errors': sorted(errors, key=lambda e: e['row']),
        'ignored_columns': sorted(ignored),
    }
    if commit:
        with transaction.atomic():
            for item in valid:
                item['customer'] = item['serializer'].save()
            _save_referrals(valid, user)
        result['created'] = sum(1 for item in valid if item['action'] == 'create')
        result['updated'] = len(valid) - result['created']
    return result
