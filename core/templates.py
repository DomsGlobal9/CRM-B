
from decimal import Decimal, InvalidOperation


class SpecValidationError(ValueError):


    def __init__(self, errors):
        self.errors = errors
        super().__init__(f"{len(errors)} invalid field(s): {', '.join(sorted(errors))}")



def _as_list(value):
    return value if isinstance(value, (list, tuple)) else [value]


def evaluate_rule(rule, values):

    if not rule:
        return True
    if 'all' in rule:
        return all(evaluate_rule(r, values) for r in rule['all'])
    if 'any' in rule:
        return any(evaluate_rule(r, values) for r in rule['any'])

    actual = values.get(rule['field'])
    op = rule.get('op', 'eq')
    expected = rule.get('value')

    if op == 'is_set':
        return actual not in (None, '', [], {})
    if op == 'in':
        return bool(set(_as_list(actual)) & set(_as_list(expected)))
    if op == 'not_in':
        return not (set(_as_list(actual)) & set(_as_list(expected)))
    if op == 'neq':
        return actual != expected
    return actual == expected


def is_visible(field, values):
    return evaluate_rule(field.visible_when, values)


def visible_fields(template, values):

    result = []
    for section in template.sections.all():
        for field in section.fields.all():
            if is_visible(field, values):
                result.append(field)
    return result



def _clean_number(field, raw, errors):
    try:
        number = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        errors[field.key] = f"{field.label} must be a number."
        return None

    rules = field.validation or {}
    minimum, maximum = rules.get('min'), rules.get('max')
    if minimum is not None and number < Decimal(str(minimum)):
        errors[field.key] = f"{field.label} cannot be below {minimum}."
    elif maximum is not None and number > Decimal(str(maximum)):
        errors[field.key] = f"{field.label} cannot exceed {maximum}."
    return str(number)


#: A dropdown answer the boutique typed because no option fit: "other:Banarasi".
#: Stored verbatim in the select's own key, so drafts, the spec and the brief
#: need no second field. Mirrored in frontend/src/services/templates.js.
OTHER_PREFIX = 'other:'
OTHER_MAX_LENGTH = 200


def _is_typed_other(raw):
    return (isinstance(raw, str) and raw.startswith(OTHER_PREFIX)
            and 0 < len(raw[len(OTHER_PREFIX):].strip()) <= OTHER_MAX_LENGTH)


#: Measurements the template does not ask for, added by hand at the counter
#: ("Add other measurement"): [{"label": "Bicep", "value": "11.5"}] under this
#: one key of a garment's measurements, in inches like the rest. Mirrored in
#: frontend/src/services/templates.js.
EXTRA_MEASUREMENTS = 'extra_measurements'
EXTRA_MEASUREMENTS_MAX = 20
EXTRA_LABEL_MAX = 60
EXTRA_VALUE_MAX = Decimal('999.99')


def clean_extra_measurements(raw):
    """The added measurements, cleaned: (rows, error sentence or None).

    Rows left wholly blank are dropped; a name needs a value and a value a
    name; the value is a number of inches above 0, at most 999.99.
    """
    if raw in (None, '', []):
        return [], None
    if not isinstance(raw, list):
        return [], 'Extra measurements must be a list.'
    rows = []
    for row in raw:
        if not isinstance(row, dict):
            return [], 'Each extra measurement needs a name and a value.'
        label = str(row.get('label') or '').strip()
        value = str(row.get('value') if row.get('value') is not None else '').strip()
        if not label and not value:
            continue
        if not label:
            return [], 'Give each extra measurement a name.'
        if len(label) > EXTRA_LABEL_MAX:
            return [], f'{label[:20]}...: a measurement name is limited to {EXTRA_LABEL_MAX} characters.'
        if not value:
            return [], f'Enter a value for {label}.'
        try:
            number = Decimal(value)
        except (InvalidOperation, ValueError):
            return [], f'{label} must be a number.'
        if not number.is_finite() or number <= 0 or number > EXTRA_VALUE_MAX:
            return [], f'{label} must be more than 0 and at most {EXTRA_VALUE_MAX}.'
        rows.append({'label': label, 'value': str(number)})
    if len(rows) > EXTRA_MEASUREMENTS_MAX:
        return [], f'Add at most {EXTRA_MEASUREMENTS_MAX} extra measurements to a garment.'
    return rows, None


#: An answer whose option has been retired, and what it means now. Saree
#: "Fall + Pico" was one tick for two services; the two are ticked on their
#: own since, and an order taken before that still reads as both.
RETIRED_CHOICES = {'fall_pico': ('fall', 'pico'),
                   # Work On's Hand was the sleeve under another name.
                   'hand_design': ('sleeve_design',)}

#: A question that has been retired, and the one that asks it now: an order
#: taken before reads on, its answer under the new key (unless that has one).
RETIRED_FIELDS = {'hand_work_kind_hand_design': 'hand_work_kind_sleeve_design'}


#: Multiple-choice questions that also take a choice typed at the counter
#: ("+ Add" under Work On), kept in the list as "other:<text>". Mirrored in
#: frontend/src/services/templates.js.
MULTI_TYPED = {'hand_work_parts'}


def _clean_choice(field, raw, errors, multi):
    if not multi and _is_typed_other(raw):
        return raw
    allowed = {o.value for o in field.options.all() if o.is_active}
    chosen = _as_list(raw) if multi else [raw]
    typed = set()
    if multi:
        chosen = [out for c in chosen
                  for out in (RETIRED_CHOICES[c] if c in RETIRED_CHOICES and c not in allowed else (c,))]
        chosen = list(dict.fromkeys(chosen))
        if field.key in MULTI_TYPED:
            typed = {c for c in chosen if _is_typed_other(c)}
    unknown = [c for c in chosen if c not in allowed and c not in typed]
    if unknown:
        errors[field.key] = f"{field.label}: unknown option {', '.join(map(str, unknown))}."
        return None
    return list(chosen) if multi else raw


def validate_spec(template, spec, *, partial=False):
    errors = {}
    cleaned = {}
    known = {}

    for section in template.sections.all():
        for field in section.fields.all():
            known[field.key] = field

    # An order taken before a question or a choice was retired reads as what
    # it means now -- before visibility is worked out, so a question that
    # hangs off the retired choice (Hand's own design) still applies.
    if any(old in spec for old in RETIRED_FIELDS) or any(
            isinstance(v, list) and any(c in RETIRED_CHOICES for c in v if isinstance(c, str))
            for v in spec.values()):
        spec = dict(spec)
        for old, new in RETIRED_FIELDS.items():
            if old in spec:
                answer = spec.pop(old)
                spec.setdefault(new, answer)
        for key, value in list(spec.items()):
            field = known.get(key)
            if field is not None and field.field_type == 'multiselect' and isinstance(value, list):
                allowed = {o.value for o in field.options.all() if o.is_active}
                spec[key] = list(dict.fromkeys(
                    out for c in value
                    for out in (RETIRED_CHOICES[c] if isinstance(c, str) and c in RETIRED_CHOICES
                                and c not in allowed else (c,))))

    unknown_keys = set(spec) - set(known)
    if unknown_keys:
        for key in unknown_keys:
            errors[key] = "Unknown field for this garment."

    for key, field in known.items():
        if not is_visible(field, spec):
            continue  # hidden: not required, not stored

        raw = spec.get(key)
        if raw in (None, '', [], {}):
            # A question with a declared default (hand work: "Without Work")
            # is answered by it on a full validation, the same as the form
            # does before a submit -- never "missing". A partial (draft)
            # validation leaves it out, so a draft stays what was typed.
            if not partial and field.default not in (None, '', [], {}):
                raw = field.default
            elif field.is_required and not partial:
                errors[key] = f"{field.label} is required."
                continue
            else:
                continue

        field_type = field.field_type
        if field_type == 'number':
            value = _clean_number(field, raw, errors)
        elif field_type == 'select':
            value = _clean_choice(field, raw, errors, multi=False)
        elif field_type == 'multiselect':
            value = _clean_choice(field, raw, errors, multi=True)
        elif field_type == 'boolean':
            value = bool(raw)
        else:
            value = raw
            max_length = (field.validation or {}).get('max_length')
            if max_length and isinstance(raw, str) and len(raw) > max_length:
                errors[key] = f"{field.label} is limited to {max_length} characters."

        if key not in errors and value is not None:
            cleaned[key] = value

    _validate_cross_field(cleaned, errors)

    if errors:
        raise SpecValidationError(errors)
    return cleaned


def _validate_cross_field(cleaned, errors):

    trial, delivery = cleaned.get('trial_date'), cleaned.get('delivery_date')
    if trial and delivery and str(trial) > str(delivery):
        errors['trial_date'] = "Trial date must fall before the delivery date."
