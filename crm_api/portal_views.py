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

import logging

from django.db import IntegrityError, transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import get_public_schema_name, schema_context
from rest_framework import status, views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.modules import is_enabled
from core.validators import validate_email_address, validate_name, validate_text
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
        except ValueError as exc:
            return self._fail(str(exc), status.HTTP_400_BAD_REQUEST, origin)

        if not any(fields.values()) and not notes and not links:
            return self._fail('Tell us what you would like made.',
                              status.HTTP_400_BAD_REQUEST, origin)

        with schema_context(tenant.schema_name):
            customer = Customer.objects.filter(mobile_number=payload['m']).first()
            if customer is None:
                # The details form has to land first; without a customer there
                # is nothing to attach a requirement to.
                return self._fail('Send your details first.',
                                  status.HTTP_409_CONFLICT, origin)
            _save_requirement(customer, fields, notes, links)

        return self._cors(Response({'saved': True}, status=status.HTTP_201_CREATED),
                          origin)


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
    raw = data.get('reference_links') or []
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


def _save_requirement(customer, fields, notes, links):
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

        summary = ' · '.join(f'{name.replace("_", " ")}: {fields[name]}'
                             for name in changed if name != 'custom_requirements')
        body = '\n'.join(part for part in (notes, summary) if part)
        DesignPreference.objects.create(
            customer=customer,
            # The customer described it themselves; it is not off the
            # boutique's catalogue and nobody has approved it yet.
            source='CUSTOM_DESIGN',
            notes=body or None,
            reference_links=links,
            is_approved=False,
        )
