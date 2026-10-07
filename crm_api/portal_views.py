"""The customer portal's public API, at /intake/.

An untrusted browser on the open internet calls these, so the shape of every
answer is part of the security, not just the code behind it:

  * The boutique comes from X-Portal-Key and nowhere else. Not a slug in the
    path, not X-Tenant-ID, not the body, not a query parameter -- those are
    all things the caller writes, and the whole point is that the caller does
    not choose the tenant. A credential belongs to one BoutiqueTenant, so the
    key IS the boutique.
  * Nothing says whether a mobile number belongs to an existing customer until
    that number has answered a WhatsApp code. Before then every reply is the
    same for a customer, a stranger, and a number nobody has ever typed.
  * The portal credential identifies the caller. It does not authorise
    anything -- see tenants.models.PortalCredential for why a browser cannot
    hold a secret.

The gate sequence mirrors crm_api/tracking_views.py, the other public view that
resolves its own tenant: active boutique, then the module switch, then
schema_context. The middleware never ran either check for these, because the
request arrives with no tenant at all.

Everything a customer may describe about themselves and about what they want
is taken from the counter's own Add Customer form (frontend/src/App.jsx,
DEFAULT_CUSTOMER_DATA) -- same field names, same validators -- so the portal
and the counter cannot disagree about what a customer record holds.
"""

import json
import logging
import re
import uuid
from decimal import Decimal, InvalidOperation

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import get_public_schema_name, schema_context
from rest_framework import status, views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.modules import is_enabled
from core.validators import (
    validate_email_address, validate_image_uploads, validate_name,
    validate_text,
)
from crm_api import portal_otp, portal_tokens
from crm_api.models import Customer, Measurement, national_mobile, whatsapp_number
from tenants import portal_credentials

logger = logging.getLogger(__name__)

MODULE_KEY = 'customer_portal'

#: One sentence for every refusal a caller is not entitled to understand.
#: Separate messages here are how enumeration leaks: "no such boutique" versus
#: "portal disabled" tells a prober which boutiques exist.
UNAVAILABLE = 'This boutique is not accepting online submissions.'
BAD_CODE = 'That code is not valid.'
NOT_VERIFIED = 'Verify your mobile number first.'
TOO_MANY = 'Too many attempts. Please try again later.'
TEMPORARY = 'Phone verification is currently unavailable for this boutique.'
BAD_MOBILE = 'Enter a valid 10-digit mobile number.'

#: What the portal may read back about a customer after that customer's own
#: number has answered a code. Their own contact details and nothing the
#: boutique wrote about them: no notes, no tier, no segment, no spend, no
#: order history, no measurements, no referrer, no id.
PROFILE_FIELDS = (
    'first_name', 'last_name', 'email_address', 'address', 'city_region',
    'gender', 'date_of_birth', 'occupation', 'preferred_communication',
)

#: What the portal may WRITE as contact details. A subset of the above -- a
#: customer describes themselves, and everything the boutique decides about
#: them stays the boutique's. `source` is absent on purpose and forced to
#: Website below.
WRITABLE_FIELDS = PROFILE_FIELDS

#: What the customer wants made, taken verbatim from the counter's own Add
#: Customer form (DEFAULT_CUSTOMER_DATA in frontend/src/App.jsx). These are
#: columns on Customer already -- no new model, no invented field.
#:
#: Unlike the contact fields these are OVERWRITTEN on each submission rather
#: than only filled when blank, and the difference is deliberate: a name or an
#: address is a record the boutique may have corrected, while "what I want
#: this time" is a statement only the customer can make, and a returning
#: customer asking for a saree after last year's lehenga has to be able to say
#: so. Nothing is lost either way -- every submission also leaves its own
#: DesignPreference row, which is append-only.
REQUIREMENT_FIELDS = (
    'garment_type', 'occasion', 'neckline_style', 'sleeve_style', 'back_style',
    'length_preference', 'silhouette', 'embellishments', 'pattern_style',
    'custom_requirements',
)

GENDERS = ('Female', 'Male', 'Other')
CONTACT_CHOICES = ('WhatsApp', 'Call', 'Email')

#: How many inspiration links one submission may carry.
MAX_REFERENCE_LINKS = 10

#: A public POST body has no business being large; this is well past any
#: honest submission and far short of anything worth sending to a parser.
MAX_BODY_FIELD = 500

#: Bots fill in every field they find. A human never sees this one.
HONEYPOT_FIELD = 'company_website'

#: Design photos one submission may carry, across all of the garment's parts.
MAX_DESIGN_PHOTOS = 10

#: A design photo's form field names the part it shows: images[pallu_design].
PHOTO_FIELD = re.compile(r'^images\[([a-z0-9_]{1,60})\]$')

#: The picture formats a customer's design photo may be, by what the bytes
#: are -- never by the name or the type the browser claimed -- and the
#: extension each is stored under.
DESIGN_IMAGE_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}

#: A garment's measurement as the customer's sheet files it. Mirrors
#: MEASURE_KEYS in frontend/src/App.jsx, which the counter's order form fills
#: itself from -- so a number a customer sends here is the one the shop's form
#: offers the next time this customer orders. A key not listed keeps its name.
SHEET_KEYS = {
    'chest': 'bust', 'bust': 'bust', 'waist': 'waist', 'hip': 'hips', 'shoulder': 'shoulder',
    'neck': 'neck', 'height': 'height', 'underbust': 'underbust', 'high_waist': 'high_waist',
    'armhole': 'armhole', 'upper_arm': 'upper_arm', 'bicep': 'upper_arm', 'elbow': 'elbow',
    'wrist': 'wrist', 'shoulder_to_bust': 'shoulder_to_bust',
    'shoulder_to_waist': 'shoulder_to_waist', 'waist_to_hip': 'waist_to_hip',
    'waist_to_floor': 'waist_to_floor', 'floor_length': 'waist_to_floor', 'crotch': 'rise',
    'thigh': 'thigh', 'knee': 'knee', 'calf': 'calf', 'ankle': 'ankle', 'inseam': 'inseam',
    'outseam': 'outseam',
}
#: The sheet's own columns (Measurement); every other key is filed under
#: additional_measurements. Mirrors SHEET_COLUMNS in frontend/src/App.jsx.
SHEET_COLUMNS = ('bust', 'waist', 'hips', 'shoulder', 'arm_length', 'neck', 'length')

#: Of a garment's folded-away measurement groups, the ones a customer can take
#: at home with a tape. The rest -- Pattern, Construction, Border, Layers --
#: are the workroom's own specification and are never asked of a customer.
CUSTOMER_GROUPS = re.compile(r'body|length|neck|sleeve|fit', re.IGNORECASE)


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[-1].strip()
    return request.META.get('REMOTE_ADDR', '') or ''


class PortalView(views.APIView):
    """Shared gates. DRF with no authentication at all, deliberately.

    authentication_classes is empty rather than defaulted: the project's
    default includes SessionAuthentication, which would make a staff member's
    cookie meaningful on a public endpoint and drag CSRF into a cross-origin
    POST. With no authenticator there is no session, no cookie and nothing for
    CSRF to protect -- the exemption is this class, not the project.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def _fail(self, message, code=status.HTTP_400_BAD_REQUEST, origin=''):
        return self._cors(Response({'error': message}, status=code), origin)

    def _cors(self, response, origin):
        """Echo the credential's one registered origin, or send no header.

        A browser cannot read a cross-origin reply without this. curl can, and
        always could -- CORS tells an honest browser what to refuse, it is not
        a control over who may call.
        """
        if origin:
            response['Access-Control-Allow-Origin'] = origin
            response['Vary'] = 'Origin'
            response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Portal-Key'
            response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            response['Access-Control-Max-Age'] = '600'
        response['Cache-Control'] = 'private, no-store'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response

    def resolve(self, request):
        """(tenant, credential, origin) or (None, None, '').

        THE KEY IS THE BOUTIQUE. A PortalCredential belongs to exactly one
        BoutiqueTenant, so the caller never names one and there is nothing for
        it to substitute -- no slug in the path, no X-Tenant-ID, no field in
        the body or the query string. That is the whole reason the slug came
        out of these URLs: a value the client supplies is a value the client
        can change, and the boutique is not the client's to choose.

        Every refusal answers with the same sentence, because the differences
        between them -- unknown key, revoked key, suspended boutique, portal
        switched off -- are all facts an anonymous caller has not earned.
        """
        with schema_context(get_public_schema_name()):
            credential = portal_credentials.resolve_any(
                request.META.get('HTTP_X_PORTAL_KEY', ''))
            if credential is None:
                return None, None, ''
            tenant = credential.tenant
            if tenant.schema_name == get_public_schema_name():
                return None, None, ''
            # The platform's own switch, read here for the same reason
            # crm_api/tracking_views.py reads it: the middleware never ran a
            # module check for a request that arrives with no tenant at all.
            if not is_enabled(getattr(tenant, 'plan', None),
                              getattr(tenant, 'enabled_modules', None), MODULE_KEY):
                return None, None, ''

        request_origin = request.META.get('HTTP_ORIGIN', '')
        origin = (credential.allowed_origin
                  if credential.allowed_origin
                  and credential.allowed_origin == request_origin else '')
        portal_credentials.touch(credential)
        return tenant, credential, origin

    def options(self, request, *args, **kwargs):
        _tenant, _credential, origin = self.resolve(request)
        return self._cors(Response(status=status.HTTP_200_OK), origin)

    @staticmethod
    def normalised_mobile(data):
        """The spelling Customer.mobile_number is stored in, or ''.

        The same two helpers CustomerSerializer uses, so the portal and the CRM
        cannot disagree about who is on the other end of a number.
        """
        raw = data.get('mobile_number') if hasattr(data, 'get') else None
        raw = '' if raw is None else str(raw).strip()
        if len(raw) > 32:
            return ''
        national = national_mobile(raw)
        return whatsapp_number(national) if national else ''


@method_decorator(csrf_exempt, name='dispatch')
class VerifyRequestView(PortalView):
    """POST /intake/customer/verify/request/ -- send a code."""

    def post(self, request):
        tenant, credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        if request.data.get(HONEYPOT_FIELD):
            # Answer a bot exactly as a person, so the next attempt is not
            # tuned around the rejection.
            return self._cors(
                Response({'sent': True, 'channel': 'whatsapp',
                          'expires_in': portal_otp.TTL}), origin)

        mobile = self.normalised_mobile(request.data)
        if not mobile:
            return self._fail(BAD_MOBILE, status.HTTP_400_BAD_REQUEST, origin)

        try:
            if not portal_otp.check_limits(
                    schema_name=tenant.schema_name, mobile=mobile,
                    ip=_client_ip(request), credential_id=credential.key_id):
                return self._fail(TOO_MANY, status.HTTP_429_TOO_MANY_REQUESTS, origin)
            if portal_otp.cooling_down(tenant.schema_name, mobile):
                return self._fail(TOO_MANY, status.HTTP_429_TOO_MANY_REQUESTS, origin)
            code = portal_otp.issue(tenant.schema_name, mobile)
        except portal_otp.RedisUnavailable:
            # Fail closed. Without Redis there is nowhere to remember the code,
            # so there is no honest way to check an answer later.
            logger.error('customer portal OTP store unavailable')
            return self._fail(TEMPORARY, status.HTTP_503_SERVICE_UNAVAILABLE, origin)

        if not self._send(tenant, mobile, code):
            return self._fail(TEMPORARY, status.HTTP_503_SERVICE_UNAVAILABLE, origin)

        # Identical for a known customer, a stranger and a number nobody has
        # ever typed. This is the enumeration guard.
        return self._cors(
            Response({'sent': True, 'channel': 'whatsapp',
                      'expires_in': portal_otp.TTL}), origin)

    @staticmethod
    def _send(tenant, mobile, code):
        """True if WhatsApp accepted it. Never lets the provider's words out.

        A Baileys error carries session ids and internal URLs, and the caller
        is told one sentence instead. The code is not in the log line either.
        """
        from crm_api.whatsapp_service import send_whatsapp_message
        try:
            result = send_whatsapp_message(
                phone=mobile,
                message_text=(f'{code} is your verification code for '
                              f'{tenant.name}. It expires in 5 minutes.'),
                tenant=tenant,
            )
        except Exception:  # noqa: BLE001 - provider down, timeout, bad config
            logger.exception('customer portal could not send a code for %s',
                             tenant.schema_name)
            return False
        if not result or not result.get('success'):
            logger.error('customer portal WhatsApp send refused for %s',
                         tenant.schema_name)
            return False
        return True


@method_decorator(csrf_exempt, name='dispatch')
class VerifyView(PortalView):
    """POST /intake/customer/verify/ -- answer the code."""

    def post(self, request):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        mobile = self.normalised_mobile(request.data)
        code = str(request.data.get('code') or '').strip()
        # One message for a wrong code, an expired code, a code for another
        # number and a number that was never sent one. Separating them would
        # say which mobiles have codes in flight.
        if not mobile or not code or len(code) > 12:
            return self._fail(BAD_CODE, status.HTTP_400_BAD_REQUEST, origin)

        try:
            ok = portal_otp.verify(tenant.schema_name, mobile, code)
        except portal_otp.RedisUnavailable:
            logger.error('customer portal OTP store unavailable')
            return self._fail(TEMPORARY, status.HTTP_503_SERVICE_UNAVAILABLE, origin)

        if not ok:
            return self._fail(BAD_CODE, status.HTTP_400_BAD_REQUEST, origin)

        return self._cors(
            Response({'verified': True,
                      'token': portal_tokens.issue(tenant.schema_name, mobile)}),
            origin)


@method_decorator(csrf_exempt, name='dispatch')
class ProfileView(PortalView):
    """GET /intake/customer/profile/ -- autofill, after verifying."""

    def get(self, request):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        # read() checks the signature, the expiry, the purpose AND the schema,
        # so a token minted at another boutique cannot be read here at all.
        payload = portal_tokens.read(portal_tokens.bearer(request),
                                     schema_name=tenant.schema_name)
        if payload is None:
            return self._fail(NOT_VERIFIED, status.HTTP_401_UNAUTHORIZED, origin)

        # The mobile comes out of the signed token, never off the request: a
        # holder cannot ask about a number other than the one they proved.
        with schema_context(tenant.schema_name):
            customer = Customer.objects.filter(mobile_number=payload['m']).first()
            body = ({'exists': True, 'profile': _profile(customer)}
                    if customer is not None else
                    {'exists': False, 'profile': None})
        return self._cors(Response(body), origin)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerIntakeView(PortalView):
    """POST /intake/customer/ -- the customer's own details."""

    def post(self, request):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        payload = portal_tokens.read(portal_tokens.bearer(request),
                                     schema_name=tenant.schema_name)
        if payload is None:
            return self._fail(NOT_VERIFIED, status.HTTP_401_UNAUTHORIZED, origin)

        if request.data.get(HONEYPOT_FIELD):
            return self._fail(UNAVAILABLE, status.HTTP_400_BAD_REQUEST, origin)

        # A body may name a mobile, but only the one already proved. Silently
        # accepting a different number would let a verified caller write a row
        # for somebody else.
        sent = self.normalised_mobile(request.data)
        if sent and sent != payload['m']:
            return self._fail(NOT_VERIFIED, status.HTTP_403_FORBIDDEN, origin)
        mobile = payload['m']

        # One-use for the write. Reading a profile may repeat -- it changes
        # nothing -- but two creates from one verification must not.
        try:
            if not portal_otp.consume_token_id(tenant.schema_name, payload['j'],
                                               portal_tokens.MAX_AGE):
                return self._fail(NOT_VERIFIED, status.HTTP_401_UNAUTHORIZED, origin)
        except portal_otp.RedisUnavailable:
            logger.error('customer portal OTP store unavailable')
            return self._fail(TEMPORARY, status.HTTP_503_SERVICE_UNAVAILABLE, origin)

        try:
            fields = _clean(request.data, WRITABLE_FIELDS)
        except ValueError as exc:
            return self._fail(str(exc), status.HTTP_400_BAD_REQUEST, origin)
        if not fields.get('first_name'):
            return self._fail('Enter your first name.',
                              status.HTTP_400_BAD_REQUEST, origin)

        with schema_context(tenant.schema_name):
            created = _save(mobile, fields)

        return self._cors(
            Response({'saved': True, 'created': created},
                     status=status.HTTP_201_CREATED if created else status.HTTP_200_OK),
            origin)


def _profile(customer):
    out = {}
    for field in PROFILE_FIELDS:
        value = getattr(customer, field, None)
        out[field] = '' if value is None else (
            value.isoformat() if hasattr(value, 'isoformat') else str(value))
    return out


def _clean(data, allowed=WRITABLE_FIELDS):
    """Only the fields a customer owns, validated by the CRM's own rules.

    `allowed` is the allow-list, never a deny-list: a field nobody named
    here cannot be written however it is spelled in the body, which is what
    keeps source, tier, notes and the rest of the boutique's own record out
    of reach of a public form.
    """
    out = {}
    for field in allowed:
        if field not in data:
            continue
        value = data.get(field)
        value = '' if value is None else str(value).strip()
        if len(value) > MAX_BODY_FIELD:
            raise ValueError('One of those answers is too long.')
        out[field] = value

    try:
        if out.get('first_name'):
            out['first_name'] = validate_name(out['first_name'], label='First name')
        if out.get('last_name'):
            out['last_name'] = validate_name(out['last_name'], label='Last name',
                                             required=False)
        if out.get('email_address'):
            out['email_address'] = validate_email_address(out['email_address'])
        if out.get('address'):
            out['address'] = validate_text(out['address'], label='Address', max_length=500)
    except Exception as exc:  # noqa: BLE001 - DRF ValidationError and friends
        detail = getattr(exc, 'detail', None)
        raise ValueError(str(detail[0]) if detail else 'Please check what you typed.') from exc

    if out.get('gender') and out['gender'] not in GENDERS:
        raise ValueError('Gender must be Female, Male or Other.')
    if out.get('preferred_communication') and out['preferred_communication'] not in CONTACT_CHOICES:
        raise ValueError('Preferred contact must be WhatsApp, Call or Email.')
    if 'date_of_birth' in out and not out['date_of_birth']:
        out.pop('date_of_birth')
    return out


def _save(mobile, fields):
    """Create this customer, or fill the blanks on the one already there.

    Returns True if a row was created.

    The unique index on mobile_number is the authority, not a prior SELECT:
    two submissions arriving together would both pass a check-then-create and
    one would raise. Catching IntegrityError and falling through to the update
    is what makes the race safe, and the whole thing runs in one transaction so
    a refused insert leaves nothing behind.

    An existing customer is never overwritten. Only fields the boutique has
    left blank are filled -- the same rule the spreadsheet importer follows in
    domains/customers/services.py::_fill_existing -- so a portal submission can
    add a missing email but cannot replace a corrected address, and nothing a
    customer sends can touch notes, tier, source or anything else that is the
    boutique's own record.
    """
    try:
        with transaction.atomic():
            customer = Customer.objects.create(
                mobile_number=mobile, source='Website', **fields)
            Measurement.objects.create(customer=customer)
            return True
    except IntegrityError:
        pass

    with transaction.atomic():
        customer = (Customer.objects.select_for_update()
                    .filter(mobile_number=mobile).first())
        if customer is None:
            return False
        changed = [name for name, value in fields.items()
                   if value and not getattr(customer, name, None)]
        if changed:
            for name in changed:
                setattr(customer, name, fields[name])
            customer.save(update_fields=changed)
    return False


@method_decorator(csrf_exempt, name='dispatch')
class ProductsView(PortalView):
    """GET /intake/products/ -- what this boutique makes, for the form's menu.

    The boutique's own active garment templates (apps.catalog.GarmentTemplate),
    which is what the counter's order wizard offers, so the website cannot
    offer a garment the workroom has switched off. Key and name only: a
    template also carries sections, fields, options and pricing hints, and none
    of that is a customer's business.
    """

    def get(self, request):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        from apps.catalog.models import GarmentTemplate

        with schema_context(tenant.schema_name):
            # resolve() is the catalogue's own per-boutique override rule: a
            # boutique that has forked a template sees its version, everyone
            # else sees the global one.
            rows = (GarmentTemplate.objects
                    .filter(is_active=True, tenant__isnull=True)
                    .order_by('sequence', 'name')
                    .values('key', 'name'))
            overrides = {
                row['key']: row['name']
                for row in GarmentTemplate.objects
                .filter(is_active=True, tenant=tenant.schema_name)
                .values('key', 'name')
            }
            products = [{'key': row['key'], 'name': overrides.get(row['key'], row['name'])}
                        for row in rows]

        return self._cors(Response({'products': products}), origin)


def _template_for(tenant, product):
    """This boutique's active garment template named by key or by name, or None.

    The website may send either: GET /intake/products/ gives both, and the
    documentation has always told developers to send the name.
    """
    from apps.catalog.models import GarmentTemplate

    product = str(product or '').strip()
    if not product:
        return None
    rows = GarmentTemplate.objects.filter(is_active=True).filter(
        Q(tenant__isnull=True) | Q(tenant=tenant.schema_name))
    match = rows.filter(key__iexact=product).first() or rows.filter(name__iexact=product).first()
    return GarmentTemplate.resolve(match.key, tenant=tenant.schema_name) if match else None


def _measurement_fields(template):
    """The measurements a customer is asked for this garment, in its own order.

    The garment's own Measurements step, cut to what a person can measure:
    numbers in inches, never one that depends on another answer (the website
    does not have the style answers), and of the folded-away groups only the
    body ones. `group` None is the garment's main list; a named group is extra
    detail the website may fold away, as the counter's form does.
    """
    out = []
    for section in template.sections.filter(key='measurements'):
        for f in section.fields.all():
            if f.field_type != 'number' or f.unit != 'Inches' or f.visible_when:
                continue
            rules = f.validation or {}
            group = rules.get('group')
            if group and not CUSTOMER_GROUPS.search(group):
                continue
            out.append({
                'key': f.key, 'label': f.label, 'unit': 'inches', 'group': group or None,
                'min': rules.get('min', 0), 'max': rules.get('max', 120),
                'step': rules.get('step', 0.25), 'help_text': f.help_text or '',
            })
    return out


def _clean_measurements(data, template):
    """{key: Decimal} from the body's `measurements`, or ValueError.

    Only this garment's own measurement keys, each a number in its range. A
    blank value is skipped, so a customer may send only what they know.
    """
    raw = _json_field(data, 'measurements')
    if raw in (None, '', {}):
        return {}
    if not isinstance(raw, dict):
        raise ValueError('Measurements must be a list of name and number pairs.')
    if template is None:
        raise ValueError('Choose a product from the list before sending measurements.')
    allowed = {f['key']: f for f in _measurement_fields(template)}
    out = {}
    for key, value in raw.items():
        field = allowed.get(key)
        if field is None:
            raise ValueError(f'"{str(key)[:40]}" is not a measurement for {template.name}.')
        if value in (None, ''):
            continue
        try:
            number = Decimal(str(value).strip())
        except InvalidOperation:
            raise ValueError(f'{field["label"]} must be a number.') from None
        if not number.is_finite() or number < Decimal(str(field['min'])) or number > Decimal(str(field['max'])):
            raise ValueError(f'{field["label"]} must be between {field["min"]} and {field["max"]} inches.')
        out[key] = number.quantize(Decimal('0.01'))
    return out


def _save_measurements(customer, values):
    """The customer's sheet takes what they sent: their number replaces the one
    on file. The portal serves customers new to the boutique, so there is no
    tape-measured number of the shop's to protect; Measurement.save keeps the
    previous sheet in MeasurementHistory regardless."""
    sheet, _ = Measurement.objects.get_or_create(customer=customer)
    extras = dict(sheet.additional_measurements or {})
    for key, number in values.items():
        target = SHEET_KEYS.get(key, key)
        if target in SHEET_COLUMNS:
            setattr(sheet, target, number)
        else:
            extras[target] = float(number)
    sheet.additional_measurements = extras
    sheet.save()


@method_decorator(csrf_exempt, name='dispatch')
class ProductMeasurementsView(PortalView):
    """GET /intake/products/<key>/measurements/ -- what to measure for one garment.

    Public, like the products list: these are the boutique's own questions,
    not anything about a customer. Unknown or switched-off products answer the
    same 404 as an unknown boutique.
    """

    def get(self, request, key):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)
        with schema_context(tenant.schema_name):
            template = _template_for(tenant, key)
            if template is None:
                return self._fail('No such product.', status.HTTP_404_NOT_FOUND, origin)
            body = {'product': {'key': template.key, 'name': template.name},
                    'measurements': _measurement_fields(template)}
        return self._cors(Response(body), origin)


@method_decorator(csrf_exempt, name='dispatch')
class ProductPartsView(PortalView):
    """GET /intake/products/<key>/parts/ -- the parts a design photo can show.

    The garment's own design parts (pallu, border, body...), the same list the
    counter's order form files reference photos under. Public, like the
    products list; an unknown product answers 404.
    """

    def get(self, request, key):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)
        with schema_context(tenant.schema_name):
            template = _template_for(tenant, key)
            if template is None:
                return self._fail('No such product.', status.HTTP_404_NOT_FOUND, origin)
            body = {'product': {'key': template.key, 'name': template.name},
                    'parts': [{'key': p['key'], 'label': p['label']}
                              for p in (template.design_parts or [])],
                    'max_photos': MAX_DESIGN_PHOTOS}
        return self._cors(Response(body), origin)


@method_decorator(csrf_exempt, name='dispatch')
class RequirementView(PortalView):
    """POST /intake/customer/product/ -- what the customer wants made.

    Deliberately NOT an Order. Creating one mints an order number, lays down
    the whole stage line and expects a tailor and a master to be assigned --
    decisions the boutique makes when it accepts the work, not ones a website
    visitor can make for it. What this records is a REQUIREMENT: the garment
    and style fields on the customer's own row, plus a DesignPreference, which
    is the model this product already uses for "what this customer is asking
    for" and which the CRM already shows on the customer.

    So the boutique receives the enquiry in the places it already looks, and
    decides for itself whether it becomes an order.
    """

    def post(self, request):
        tenant, _credential, origin = self.resolve(request)
        if tenant is None:
            return self._fail(UNAVAILABLE, status.HTTP_404_NOT_FOUND)

        payload = portal_tokens.read(portal_tokens.bearer(request),
                                     schema_name=tenant.schema_name)
        if payload is None:
            return self._fail(NOT_VERIFIED, status.HTTP_401_UNAUTHORIZED, origin)

        if request.data.get(HONEYPOT_FIELD):
            return self._fail(UNAVAILABLE, status.HTTP_400_BAD_REQUEST, origin)

        try:
            fields = _clean(request.data, REQUIREMENT_FIELDS)
            links = _reference_links(request.data)
            notes = _text(request.data.get('notes'), 'Requirement')
            photos = _design_photos(request.FILES)
        except ValueError as exc:
            return self._fail(str(exc), status.HTTP_400_BAD_REQUEST, origin)

        if not any(fields.values()) and not notes and not links and not photos:
            return self._fail('Tell us what you would like made.',
                              status.HTTP_400_BAD_REQUEST, origin)

        with schema_context(tenant.schema_name):
            customer = Customer.objects.filter(mobile_number=payload['m']).first()
            if customer is None:
                # The details form has to land first; without a customer there
                # is nothing to attach a requirement to.
                return self._fail('Send your details first.',
                                  status.HTTP_409_CONFLICT, origin)
            # Measurements belong to the product chosen: checked against that
            # garment's own list, so a blouse cannot be sent a trouser's inseam.
            template = _template_for(tenant, fields.get('garment_type'))
            try:
                measured = _clean_measurements(request.data, template)
            except ValueError as exc:
                return self._fail(str(exc), status.HTTP_400_BAD_REQUEST, origin)
            try:
                part_labels = _photo_parts(photos, template)
            except ValueError as exc:
                return self._fail(str(exc), status.HTTP_400_BAD_REQUEST, origin)
            labels = {f['key']: f['label'] for f in _measurement_fields(template)} if measured else {}
            _save_requirement(customer, fields, notes, links,
                              [(labels[k], v) for k, v in measured.items()], measured,
                              _store_photos(photos, part_labels, tenant, request))

        return self._cors(Response({'saved': True}, status=status.HTTP_201_CREATED),
                          origin)


def _json_field(data, name, many=False):
    """A list or object from a JSON body, or the same sent as text in a form.

    Photos need multipart/form-data, where a field is only ever text: there the
    website sends `measurements` as a JSON string, and `reference_links` either
    the same way or as one field per link.
    """
    if hasattr(data, 'getlist') and not isinstance(data.get(name), (dict, list)):
        values = data.getlist(name)
        if many and len(values) > 1:
            return values
        raw = values[0] if values else None
    else:
        raw = data.get(name)
    if isinstance(raw, str) and raw.strip()[:1] in ('[', '{'):
        try:
            return json.loads(raw)
        except ValueError:
            raise ValueError(f'{name.replace("_", " ").capitalize()} could not be read.') from None
    return raw


def _design_photos(uploads):
    """[(part, file, ext)] from the form's images[<part>] fields.

    Every photo is filed under the part of the garment it shows, so a field
    without one -- a bare `images` -- is refused rather than guessed. At most
    MAX_DESIGN_PHOTOS across all parts. core.validators does the size and opens
    the bytes; the format is then pinned to the three a phone or website sends,
    so a GIF, TIFF or anything PIL happens to read never reaches the boutique.
    """
    from PIL import Image

    named = []
    for field in uploads:
        match = PHOTO_FIELD.match(field)
        if not match:
            raise ValueError('Send each design photo under the part it shows: images[<part>], '
                             'with a part from GET /intake/products/<product>/parts/.')
        named.extend((match.group(1), f) for f in uploads.getlist(field))
    if len(named) > MAX_DESIGN_PHOTOS:
        raise ValueError(f'Up to {MAX_DESIGN_PHOTOS} design photos at a time.')
    try:
        validate_image_uploads([f for _, f in named], label='Design photos',
                               max_count=MAX_DESIGN_PHOTOS)
    except Exception as exc:  # noqa: BLE001 - DRF ValidationError
        detail = getattr(exc, 'detail', None)
        raise ValueError(str(detail[0]) if detail else 'Design photos could not be read.') from exc
    out = []
    for part, f in named:
        try:
            kind = Image.open(f).format
        except Exception:  # noqa: BLE001
            kind = None
        finally:
            f.seek(0)
        if kind not in DESIGN_IMAGE_FORMATS:
            raise ValueError('Design photos must be JPG, PNG or WebP images.')
        out.append((part, f, DESIGN_IMAGE_FORMATS[kind]))
    return out


def _photo_parts(photos, template):
    """{part: label} for the parts these photos name, all of them the chosen
    garment's own -- or ValueError. No photos, nothing to check."""
    if not photos:
        return {}
    if template is None:
        raise ValueError('Choose a product from the list before sending design photos.')
    parts = {p['key']: p['label'] for p in (template.design_parts or [])}
    for part, _f, _ext in photos:
        if part not in parts:
            raise ValueError(f'"{part}" is not a part of {template.name}.')
    return parts


def _store_photos(photos, part_labels, tenant, request):
    """Save each photo under a name of our own -- never the uploader's -- and
    return [(url, part, label)] in the garment's own part order."""
    order = {key: i for i, key in enumerate(part_labels)}
    out = []
    for part, f, ext in sorted(photos, key=lambda row: order.get(row[0], 99)):
        path = f'design_references/portal/{tenant.schema_name}/{part}/{uuid.uuid4().hex}.{ext}'
        saved = default_storage.save(path, ContentFile(f.read()))
        out.append((request.build_absolute_uri(default_storage.url(saved)), part, part_labels[part]))
    return out


def _text(value, label, limit=MAX_BODY_FIELD):
    value = '' if value is None else str(value).strip()
    if len(value) > limit:
        raise ValueError(f'{label} is too long.')
    return value


def _reference_links(data):
    """Inspiration URLs, http(s) only.

    Anything else -- javascript:, data:, a file path -- is refused rather than
    cleaned, because these are shown to boutique staff later and a link is only
    safe if it is the kind of link it claims to be.
    """
    raw = _json_field(data, 'reference_links', many=True) or []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        raise ValueError('Reference links must be a list of web addresses.')
    if len(raw) > MAX_REFERENCE_LINKS:
        raise ValueError(f'Up to {MAX_REFERENCE_LINKS} reference links.')

    links = []
    for item in raw:
        link = str(item or '').strip()
        if not link:
            continue
        if len(link) > MAX_BODY_FIELD or not link.lower().startswith(('http://', 'https://')):
            raise ValueError('A reference link must be a web address starting http:// or https://.')
        links.append(link)
    return links


def _save_requirement(customer, fields, notes, links, measured_lines=(), measured=None,
                      photo_urls=()):
    """The style fields on the customer, and one DesignPreference per submission.

    The DesignPreference is append-only and is what keeps this honest: the
    customer's own words and links survive even where a style field was
    replaced by a later submission, so the boutique can always see what was
    actually asked for and when.
    """
    from crm_api.models import DesignPreference

    with transaction.atomic():
        changed = [name for name, value in fields.items() if value]
        if changed:
            for name in changed:
                setattr(customer, name, fields[name])
            customer.save(update_fields=changed)

        if measured:
            _save_measurements(customer, measured)

        summary = ' · '.join(f'{name.replace("_", " ")}: {fields[name]}'
                             for name in changed if name != 'custom_requirements')
        # What the customer measured, kept in their own words on the enquiry
        # too, so staff can see what came from the website and when.
        sizes = ('Measurements (inches): ' + ' · '.join(f'{label} {value.normalize():f}'
                                                       for label, value in measured_lines)
                 if measured_lines else '')
        body = '\n'.join(part for part in (notes, summary, sizes) if part)
        DesignPreference.objects.create(
            customer=customer,
            # The customer described it themselves; it is not off the
            # boutique's catalogue and nobody has approved it yet.
            source='CUSTOM_DESIGN',
            notes=body or None,
            reference_links=links,
            # The customer's own design photos, where the customer page already
            # shows a preference's reference pictures.
            reference_images=[url for url, _part, _label in photo_urls],
            reference_parts={url: {'part': part, 'label': label}
                             for url, part, label in photo_urls},
            is_approved=False,
        )
