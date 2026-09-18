"""Validators shared by serializers in more than one app.

One rule per kind of thing a person types: a mobile is ten national digits,
an Aadhaar is twelve, a PAN is AAAAA9999A, an amount is not negative and not
absurd, a note has an end. Each returns the value the way it will be stored
(normalised), or raises a sentence the counter can act on. The frontend keeps
a courtesy copy of the same rules in frontend/src/services/validate.js; this
module is the one that counts.
"""

import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from rest_framework import serializers

MOBILE_ERROR = 'Enter a 10-digit mobile number.'
PHONE_ERROR = 'Enter a phone number (digits, spaces, +, brackets, / or -).'

#: Ceilings that keep a slip of the finger from becoming a record: no boutique
#: bills a crore for a blouse, and no note needs a novel.
MAX_AMOUNT = Decimal('10000000')      # ₹1 crore
MAX_QUANTITY = Decimal('100000')
MAX_NOTE = 2000
MAX_REASON = 500
MAX_NAME = 100
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGES_PER_UPLOAD = 5

#: Punctuation a name may carry besides letters: "Lakshmi (Amma)", "M/s Sharma & Sons".
NAME_PUNCTUATION = " .'-()&/"
PINCODE_RE = re.compile(r'^[1-9]\d{5}$')
PAN_RE = re.compile(r'^[A-Z]{5}\d{4}[A-Z]$')
AADHAAR_RE = re.compile(r'^[2-9]\d{11}$')
IFSC_RE = re.compile(r'^[A-Z]{4}0[A-Z0-9]{6}$')
BANK_ACCOUNT_RE = re.compile(r'^\d{9,18}$')
GSTIN_RE = re.compile(r'^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
HSN_RE = re.compile(r'^\d{4}(\d{2})?(\d{2})?$')
VOTER_ID_RE = re.compile(r'^[A-Z]{3}\d{7}$')
#: Cards issued before the ten-character EPIC: 'KA/01/001/123456'. Still in wallets.
VOTER_ID_LEGACY_RE = re.compile(r'^[A-Z]{2,3}/\d{2}/\d{3}/\d{6}$')
DRIVING_LICENCE_RE = re.compile(r'^[A-Z]{2}[ /-]?\d{2}[ /-]?\d{4}[ /-]?\d{4,7}$')


def validate_mobile(value):
    """Blank, or exactly ten national digits -- normalised, not merely checked.

    Returns the number the way it will be stored, so "+91 98765 43210" and
    "9876543210" become one spelling of one person rather than two rows that
    fail to match. Anything that does not reduce to ten digits is refused with
    a sentence; a maxLength on the input is a courtesy to the typist, and this
    is the rule.

    crm_api.models is imported lazily: it is a tenant app, and this module has
    to stay importable before the app registry is ready.
    """
    value = '' if value is None else str(value)
    if not value:
        return ''
    from crm_api.models import national_mobile
    national = national_mobile(value)
    if not national:
        raise serializers.ValidationError(MOBILE_ERROR)
    return national


def _is_name_char(c):
    # Indic scripts spell a syllable as a letter plus a vowel sign or virama,
    # which Unicode files as Mn/Mc, not as letters: "प्रिया" is three letters
    # and two marks. A regex on \w refuses every such name; this does not.
    return c.isalpha() or unicodedata.category(c) in ('Mn', 'Mc') or c in NAME_PUNCTUATION


def validate_phone(value, *, label='Phone', max_length=50):
    """A store phone as printed on an invoice: a landline, an STD code, two
    numbers with a slash. Not normalised -- it is read by people, not dialled
    by the system -- only kept to phone-looking characters with enough digits."""
    value = ('' if value is None else str(value)).strip()
    if not value:
        return ''
    if len(value) > max_length:
        raise serializers.ValidationError(f'{label} is limited to {max_length} characters.')
    if not re.fullmatch(r'[0-9 +()/.,-]+', value) or not 6 <= len(re.sub(r"\D", "", value)) <= 30:
        raise serializers.ValidationError(PHONE_ERROR)
    return value


def validate_name(value, *, label='Name', required=True, max_length=MAX_NAME):
    """Letters (any script), spaces, dots, apostrophes, hyphens, brackets, & and /; two characters or more."""
    value = ('' if value is None else str(value)).strip()
    if not value:
        if required:
            raise serializers.ValidationError(f'{label} is required.')
        return ''
    if len(value) < 2:
        raise serializers.ValidationError(f'{label} needs at least 2 characters.')
    if len(value) > max_length:
        raise serializers.ValidationError(f'{label} is limited to {max_length} characters.')
    if not value[0].isalpha() or not all(_is_name_char(c) for c in value):
        raise serializers.ValidationError(
            f'{label} can only have letters, spaces, dots, apostrophes, hyphens, brackets, & and /.')
    return value


def validate_email_address(value):
    """Blank, or a well-formed address -- trimmed and lower-cased for matching."""
    value = ('' if value is None else str(value)).strip().lower()
    if not value:
        return ''
    from django.core.validators import validate_email
    from django.core.exceptions import ValidationError as DjangoValidationError
    if len(value) > 254:
        raise serializers.ValidationError('Email address is too long.')
    try:
        validate_email(value)
    except DjangoValidationError:
        raise serializers.ValidationError('Enter a valid email address.')
    return value


def validate_text(value, *, label='This field', max_length=MAX_NOTE, required=False):
    """Trimmed free text with an end. Notes get MAX_NOTE, reasons MAX_REASON."""
    # JSON can carry a number where a string was expected; str() rather than a 500.
    value = ('' if value is None else str(value)).strip()
    if not value:
        if required:
            raise serializers.ValidationError(f'{label} is required.')
        return ''
    if len(value) > max_length:
        raise serializers.ValidationError(f'{label} is limited to {max_length} characters.')
    return value


def validate_amount(value, *, label='Amount', minimum=Decimal('0'), maximum=MAX_AMOUNT, allow_zero=True):
    """A money figure: a number, not negative, and not more than the boutique could ever bill."""
    if value in (None, ''):
        return Decimal('0')
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise serializers.ValidationError(f'{label} must be a number.')
    if not amount.is_finite():
        raise serializers.ValidationError(f'{label} must be a number.')
    if amount < minimum:
        raise serializers.ValidationError(f'{label} cannot be negative.' if minimum == 0 else f'{label} cannot be below {minimum}.')
    if not allow_zero and amount == 0:
        raise serializers.ValidationError(f'{label} must be more than zero.')
    if amount > maximum:
        raise serializers.ValidationError(f'{label} cannot be more than {maximum:,.0f}.')
    return amount.quantize(Decimal('0.01'))


def validate_quantity(value, *, label='Quantity', maximum=MAX_QUANTITY, allow_zero=False):
    """A count or measure of stock: positive, finite, within reason."""
    if value in (None, ''):
        raise serializers.ValidationError(f'{label} is required.')
    try:
        quantity = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise serializers.ValidationError(f'{label} must be a number.')
    if not quantity.is_finite() or quantity < 0:
        raise serializers.ValidationError(f'{label} cannot be negative.')
    if not allow_zero and quantity == 0:
        raise serializers.ValidationError(f'{label} must be more than zero.')
    if quantity > maximum:
        raise serializers.ValidationError(f'{label} cannot be more than {maximum:,.0f}.')
    return quantity.quantize(Decimal('0.001'))


def validate_percentage(value, *, label='Percentage'):
    if value in (None, ''):
        return Decimal('0')
    try:
        pct = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise serializers.ValidationError(f'{label} must be a number.')
    if not pct.is_finite() or pct < 0 or pct > 100:
        raise serializers.ValidationError(f'{label} must be between 0 and 100.')
    return pct.quantize(Decimal('0.01'))


def validate_pincode(value):
    value = ('' if value is None else str(value)).strip()
    if not value:
        return ''
    if not PINCODE_RE.match(value):
        raise serializers.ValidationError('Enter a 6-digit PIN code.')
    return value


def _upper_compact(value):
    return re.sub(r'[\s-]', '', ('' if value is None else str(value)).strip().upper())


def _digits(value):
    return re.sub(r'\D', '', '' if value is None else str(value))


def validate_pan(value):
    value = _upper_compact(value)
    if not value:
        return ''
    if not PAN_RE.match(value):
        raise serializers.ValidationError('Enter a PAN like ABCDE1234F.')
    return value


def validate_aadhaar(value):
    value = _digits(value)
    if not value:
        return ''
    if not AADHAAR_RE.match(value):
        raise serializers.ValidationError('Enter the 12-digit Aadhaar number.')
    return value


def validate_ifsc(value):
    value = _upper_compact(value)
    if not value:
        return ''
    if not IFSC_RE.match(value):
        raise serializers.ValidationError('Enter an IFSC like HDFC0001234.')
    return value


def validate_bank_account(value):
    value = _digits(value)
    if not value:
        return ''
    if not BANK_ACCOUNT_RE.match(value):
        raise serializers.ValidationError('Enter a bank account number of 9 to 18 digits.')
    return value


def validate_gstin(value):
    value = _upper_compact(value)
    if not value:
        return ''
    if not GSTIN_RE.match(value):
        raise serializers.ValidationError('Enter a 15-character GSTIN like 22AAAAA0000A1Z5.')
    return value


def validate_hsn(value):
    value = _digits(value)
    if not value:
        return ''
    if not HSN_RE.match(value):
        raise serializers.ValidationError('Enter a 4, 6 or 8-digit HSN code.')
    return value


#: Per-kind rule for a staff document's number. Kinds not listed are free
#: text with an end (a certificate number can be anything).
DOCUMENT_RULES = {
    'AADHAAR': validate_aadhaar,
    'PAN': validate_pan,
    'VOTER_ID': lambda v: _voter_id(v),
    'DRIVING_LICENCE': lambda v: _match_or_error(_upper_compact(v), DRIVING_LICENCE_RE, 'Enter a driving licence like KA0120201234567.'),
}


def _voter_id(value):
    # The modern EPIC is stored compact; the legacy slashed form is kept as
    # typed (upper-cased, trimmed) because the slashes are part of the number.
    compact = _upper_compact(value)
    if not compact:
        return ''
    if VOTER_ID_RE.match(compact):
        return compact
    slashed = ('' if value is None else str(value)).strip().upper()
    if VOTER_ID_LEGACY_RE.match(slashed):
        return slashed
    raise serializers.ValidationError('Enter a Voter ID like ABC1234567 or KA/01/001/123456.')


def _match_or_error(value, pattern, message):
    if not value:
        return ''
    if not pattern.match(value):
        raise serializers.ValidationError(message)
    return value


def validate_document_number(kind, value):
    rule = DOCUMENT_RULES.get((kind or '').upper())
    if rule:
        return rule(value)
    return validate_text(value, label='Document number', max_length=64)


def validate_not_past(value, *, label='Date'):
    """A date the boutique is promising or booking: today or later."""
    if value in (None, ''):
        return value
    # A datetime is also a date; take its local day before comparing.
    if isinstance(value, datetime):
        aware = value if timezone.is_aware(value) else timezone.make_aware(value)
        when = timezone.localtime(aware).date()
    else:
        when = value
    from django.utils import timezone
    # The boutique's day, not the server's: a booking for today made after
    # midnight UTC must not be refused as yesterday.
    if isinstance(when, date) and when < timezone.localdate():
        raise serializers.ValidationError(f'{label} cannot be in the past.')
    return value


def validate_image_upload(uploaded, *, label='Photo', max_bytes=MAX_IMAGE_BYTES):
    """An actual image, of a size a phone would send. The same guard the
    voice-note endpoint already applies to audio."""
    if uploaded is None:
        raise serializers.ValidationError(f'{label} is missing.')
    content_type = (getattr(uploaded, 'content_type', '') or '')
    if not content_type.startswith('image/'):
        raise serializers.ValidationError(f'{label} must be an image (JPG, PNG or WebP).')
    size = getattr(uploaded, 'size', 0) or 0
    if size > max_bytes:
        raise serializers.ValidationError(f'{label} is larger than {max_bytes // (1024 * 1024)} MB.')
    # The content type is whatever the client said it was; the bytes are not.
    # verify() reads the headers and refuses an SVG or HTML page renamed .jpg.
    from PIL import Image
    try:
        Image.open(uploaded).verify()
    except Exception:
        raise serializers.ValidationError(f'{label} must be an image (JPG, PNG or WebP).')
    finally:
        uploaded.seek(0)
    return uploaded


def validate_image_uploads(files, *, label='Photos', max_count=MAX_IMAGES_PER_UPLOAD):
    files = list(files or [])
    if len(files) > max_count:
        raise serializers.ValidationError(f'{label}: at most {max_count} at a time.')
    return [validate_image_upload(f, label=label) for f in files]
