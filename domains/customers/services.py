"""Bulk customer import from a spreadsheet.

One sheet, one customer per row, keyed on the mobile number. Every row goes
through CustomerSerializer so the file obeys exactly the rules the Add
Customer form does. An existing customer is only ever *filled in*: a cell
never overwrites a value the boutique already recorded.
"""
import csv
import io
import re
from datetime import date, datetime

from rest_framework import serializers as drf_serializers

from apps.catalog.definitions import all_templates
from core.validators import MAX_NOTE
from crm_api.models import Customer, Measurement, whatsapp_number
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


def _row_payload(headers, row, measurement_keys, ignored):
    """One row -> (serializer payload, sheet_extras) or a row-level error."""
    profile, sheet, extras = {}, {}, {}
    full_name = None
    for header, raw in zip(headers, row):
        if not header or raw == '':
            continue
        # One name column: the first word is the first name, the rest the last.
        if header == 'full_name':
            full_name = ' '.join(raw.split()).partition(' ')
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
    return profile, sheet, extras


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


def import_customers(upload, *, commit=False):
    """Validate every row; with commit, save the valid ones in one transaction.

    Returns {'valid': [...], 'errors': [...], 'ignored_columns': [...]} and,
    after a commit, 'created' / 'updated' counts.
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
            profile, sheet, extras = _row_payload(headers, row, measurement_keys, ignored)
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
        else:
            merged[key] = {'rows': [index], 'profile': profile, 'sheet': sheet, 'extras': extras}

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
        })

    result = {
        'valid': [{k: v for k, v in item.items() if k != 'serializer'} for item in valid],
        'errors': sorted(errors, key=lambda e: e['row']),
        'ignored_columns': sorted(ignored),
    }
    if commit:
        with transaction.atomic():
            for item in valid:
                item['serializer'].save()
        result['created'] = sum(1 for item in valid if item['action'] == 'create')
        result['updated'] = len(valid) - result['created']
    return result
