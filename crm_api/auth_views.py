import logging
import uuid

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.text import slugify
from rest_framework import status, views
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from rest_framework.throttling import AnonRateThrottle
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import connection, transaction
from tenants.models import BoutiqueTenant, Domain
from tenants.provision import provision_tenant
from tenants.slugs import make_shop_slug
from django_tenants.utils import schema_context
from superadmin import signins
from core.modules import DEFAULT_PLAN, MODULE_GROUP, effective_modules
from core.validators import (
    validate_email_address, validate_mobile, validate_name, validate_text,
)
from core.roles import OWNER, resolve_user_role
from apps.email_service.services import EmailService

logger = logging.getLogger(__name__)


def _role_modules():
    """BoutiqueSettings.role_modules, or {} when there is nothing to read.

    ponytail: this is ONE extra query per /auth/me/, not zero. BoutiqueSettings
    is a single row in the tenant schema and nothing else on the auth path
    already fetches it, so there is no ride to hitch on. It is deliberately not
    cached either: the map changes the moment an owner revokes a role's access,
    and a cache would leave the revoked module in that role's navigation until
    it expired. If /auth/me/ ever becomes hot, cache it per (schema, row
    version) and bust it in the BoutiqueSettings write path -- not on a TTL.

    Returns {} rather than raising on anything: login is the one endpoint that
    must never 500, and an unreadable role map means "no explicit decisions",
    which ROLE_DEFAULTS already answers for.
    """
    if connection.schema_name == 'public':
        return {}
    try:
        from crm_api.models import BoutiqueSettings
        # id=1, spelled exactly as core.permissions._role_modules spells it --
        # the gate that actually refuses the request -- and as
        # BoutiqueSettingsViewSet get_or_creates it. This was .first(), which
        # Django orders by pk, and nothing guarantees the lowest pk IS row 1:
        # BoutiqueSettings has no unique constraint and no singleton save(), so
        # a second row can exist (a fixture, a restored dump, a psql session, a
        # future viewset that POSTs without an id). With id=1 missing and a
        # stray row present, this payload described one map while the
        # permission class enforced another: the navigation offered a module
        # every request for it then 403'd.
        stored = BoutiqueSettings.objects.values_list(
            'role_modules', flat=True).filter(id=1).first()
    except Exception:
        logger.exception('role_modules unreadable in schema %s',
                         connection.schema_name)
        return {}
    # isinstance, not `or {}`: the column is JSON written by an API and can hold
    # a list or a string. The gate heals a malformed value to "no explicit
    # decisions" (core.permissions, core.modules.role_allows); healing it the
    # same way here keeps the two agreeing on a corrupt column too. An absent
    # row lands here as None for the same reason.
    return stored if isinstance(stored, dict) else {}


def user_payload(user, role=None):
    """The ONE user object /auth/login/, /auth/me/ and /auth/signup/ return.

    Written once because it used to be written three times. Login and
    /auth/me/ disagreeing about the same account is a bug this codebase has
    already shipped (see the core/roles.py docstring), and it is worse now
    that the frontend gates its navigation on "modules": a login reporting a
    different set from /auth/me/ makes the nav change shape on first refresh.

    `role` is passed in only where it is already a fact (signup creates the
    owner); everywhere else it is resolved.
    """
    if role is None:
        role = resolve_user_role(user)

    tailor_id = designer_id = None
    profile_photo = ''
    if connection.schema_name != 'public':
        # The profile tables only exist in a tenant schema. getattr covers the
        # reverse one-to-one raising instead of returning None; the try covers
        # the table being unreadable, which must not take login down with it.
        try:
            tailor = getattr(user, 'tailor_profile', None)
            designer = getattr(user, 'designer_profile', None)
            tailor_id = getattr(tailor, 'id', None)
            designer_id = getattr(designer, 'id', None)
            # The avatar the workspace shows for this login, in preference
            # order: the user's own choice (UserAvatar, which the owner also
            # uses), then a staff member's owner-assigned photo, then a
            # designer's Design Studio image. The frontend resolves each the
            # same way.
            avatar = getattr(user, 'avatar', None)
            if avatar is not None and avatar.image:
                profile_photo = avatar.image.url
            elif tailor is not None and tailor.profile_photo:
                profile_photo = tailor.profile_photo.url
            elif designer is not None and getattr(designer, 'profile_image', ''):
                profile_photo = designer.profile_image
        except Exception:
            logger.exception('profile lookup failed for user %s', user.pk)

    # ponytail: entitlement is read off the tenant object the middleware
    # attached, which it caches for 300s -- so a module the platform switched
    # off can linger in the navigation for that long. The gate itself reads a
    # fresh row every request, so the stale case is a dead nav item that 403s,
    # not access. Read the control row here too if that becomes a support call.
    tenant = getattr(connection, 'tenant', None)
    modules = effective_modules(
        getattr(tenant, 'plan', None),
        getattr(tenant, 'enabled_modules', None),
        _role_modules(),
        role,
    )

    module_groups = {}
    for key in modules:
        # .get, not []: a module added to the registry without a group entry is
        # a KeyError, and a KeyError here is a 500 on login.
        group = MODULE_GROUP.get(key)
        if group:
            module_groups.setdefault(group, []).append(key)

    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "username": user.username,
        "role": role,
        "tailor_id": tailor_id,
        "designer_id": designer_id,
        "profile_photo": profile_photo,
        "modules": modules,
        "module_groups": module_groups,
        # The look the platform enabled for this boutique; the workspace applies
        # it at sign-in. A public-schema login (the console) has no tenant.
        "design_system": getattr(getattr(connection, 'tenant', None), 'design_system', 'scaleezy'),
        "color_mode": getattr(getattr(connection, 'tenant', None), 'color_mode', 'light'),
        # This boutique's portal path, so the workspace can put the URL bar
        # right after a sign-in that arrived at /app or at another boutique's
        # slug. Read off the tenant object like the two above, so it carries
        # their staleness window and nothing more: it labels a URL, it never
        # decides which schema a request reads.
        "shop_slug": getattr(getattr(connection, 'tenant', None), 'shop_slug', None) or '',
    }


def find_tenants_for_account(email_or_username, shop_slug=None):
    """Every boutique this account could belong to, best candidate first.

    `shop_slug` is the portal URL the sign-in screen was opened at, and it is
    a HINT about ordering, nothing more. It moves that boutique to the front so
    an address that exists in two of them resolves to the one whose URL the
    person actually used; it never admits an account that boutique does not
    have, because the caller still has to authenticate inside each schema this
    yields.

    It also fixes a real ambiguity. `others` had no ordering, so for an account
    that exists in more than one boutique the winner was whatever order
    Postgres happened to return -- stable in practice, guaranteed by nothing,
    and different between a replica and the primary. order_by('pk') makes the
    slug-less case deterministic too.
    """
    with schema_context('public'):
        owner_tenant = BoutiqueTenant.objects.filter(
            owner_email=email_or_username).first()
        hinted = (BoutiqueTenant.objects
                  .filter(shop_slug=shop_slug, is_active=True)
                  .exclude(schema_name='public')
                  .first()) if shop_slug else None
        others = list(BoutiqueTenant.objects
                      .exclude(schema_name='public')
                      .order_by('pk'))

    seen = set()
    for candidate in (hinted, owner_tenant):
        if candidate is not None and candidate.pk not in seen:
            seen.add(candidate.pk)
            yield candidate

    for t in others:
        if t.pk in seen:
            continue
        with schema_context(t.schema_name):
            if (User.objects.filter(email__iexact=email_or_username).exists()
                    or User.objects.filter(
                        username__iexact=email_or_username).exists()):
                yield t


def find_tenant_for_account(email_or_username):
    return next(find_tenants_for_account(email_or_username), None)


class LoginThrottle(AnonRateThrottle):

    scope = 'login'

    def throttle_success(self):
        return True

    @classmethod
    def record_failure(cls, request):
        throttle = cls()
        if throttle.rate is None:
            return
        key = throttle.get_cache_key(request, None)
        if key is None:
            return
        now = throttle.timer()
        history = throttle.cache.get(key, [])
        while history and history[-1] <= now - throttle.duration:
            history.pop()
        history.insert(0, now)
        throttle.cache.set(key, history, throttle.duration)


class SignupView(views.APIView):
    permission_classes = [AllowAny]

    #: The floor the sign-up form promises; Django's validators re-check it.
    PASSWORD_MIN_LENGTH = 8

    def post(self, request):
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        email = (request.data.get('email_address') or '').strip().lower()
        mobile = request.data.get('mobile_number')
        password = request.data.get('password')

        if not email or not password or not first_name or not last_name:
            return Response(
                {"error": "Please provide first_name, last_name, email_address and password"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # One rule set with the customer book and the staff roster: the name
        # becomes the tenant's, the mobile the boutique's WhatsApp identity.
        try:
            first_name = validate_name(first_name, label='First name', max_length=150)
            last_name = validate_name(last_name, label='Last name', max_length=150)
            email = validate_email_address(email)
            mobile = validate_mobile(mobile)
            business_name = validate_text(request.data.get('business_name'),
                                          label='Boutique name', max_length=100)
            business_address = validate_text(request.data.get('business_address'),
                                             label='Boutique address', max_length=500)
        except ValidationError as exc:
            return Response({"error": str(exc.detail[0])}, status=status.HTTP_400_BAD_REQUEST)

        if len(password) < self.PASSWORD_MIN_LENGTH:
            return Response(
                {"error": f"Password needs at least {self.PASSWORD_MIN_LENGTH} characters."},
                status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return Response({"error": " ".join(exc.messages)},
                            status=status.HTTP_400_BAD_REQUEST)

        if BoutiqueTenant.objects.filter(owner_email=email).exists():
            return Response(
                {"error": "A user with this email address already exists"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                base = slugify(email).replace('-', '_')[:50].strip('_') or 'boutique'
                if not base[0].isalpha():
                    base = f"b_{base}"[:50]
                schema_name = f"{base}_{uuid.uuid4().hex[:8]}"
            
                boutique_name = business_name or f"{first_name}'s Boutique"

                # Checked against what is already taken rather than trusting
                # the name to be unique, because neither boutique name is
                # unique -- two Sarala Boutiques are allowed, and the second
                # one gets saralaboutique2 rather than an IntegrityError that
                # would roll back the whole provisioning.
                tenant = provision_tenant(
                    schema_name=schema_name,
                    owner_email=email,
                    name=boutique_name,
                    shop_slug=make_shop_slug(
                        boutique_name,
                        BoutiqueTenant.objects.exclude(shop_slug=None)
                        .values_list('shop_slug', flat=True),
                        fallback=schema_name,
                    ),
                    # The business decision lives here, not in the column
                    # default: a boutique that signs up starts on the smallest
                    # plan and is moved up from the console.
                    plan=DEFAULT_PLAN,
                )
            
                Domain.objects.create(
                    domain=f"{schema_name}.localhost",
                    tenant=tenant,
                    is_primary=True
                )
            
                from tenants.middleware import clear_tenant_cache
                clear_tenant_cache()

                connection.set_tenant(tenant)

                from crm_api.utils import seed_tenant_defaults
                seed_tenant_defaults(demo=False)

                from crm_api.models import BoutiqueSettings
                BoutiqueSettings.objects.update_or_create(
                    id=1,
                    defaults={
                        'name': boutique_name,
                        'email': email,
                        **({'phone': mobile} if mobile else {}),
                        **({'address': business_address} if business_address else {}),
                    },
                )

                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name
                )
            
                token, created = Token.objects.get_or_create(user=user)
            
                return Response({
                    "token": token.key,
                    "tenant_id": tenant.schema_name,
                    # This account IS the owner -- it is what signup just made
                    # -- so the role is asserted rather than looked up.
                    "user": user_payload(user, role=OWNER),
                }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception('%s failed', self.__class__.__name__)
            connection.set_schema_to_public()
            return Response({"error": "Something went wrong. Please try again."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class _BoutiqueLookupThrottle(AnonRateThrottle):

    scope = 'boutique_lookup'


class BoutiqueBySlugView(views.APIView):
    """Which boutique a portal path belongs to, so the sign-in screen can say so.

    Deliberately NOT a way in. It answers with a display name and the slug it
    was asked about, and nothing else -- no schema name, no owner address, no
    plan, no module list. The tenant a request acts on is still decided by its
    token (LoginView below) and re-checked per request by
    tenants.middleware.TenantHeaderMiddleware, so a browser that invents a slug
    changes what the login screen is labelled and nothing whatsoever about
    which boutique it can read.

    Mounted under /api/auth/, which core.modules.ALWAYS_ON and the middleware's
    TENANT_OPTIONAL_PREFIXES both already cover: no module governs it and it is
    reachable with no tenant context, which is what a sign-in screen needs.

    Throttled because it is an unauthenticated read that confirms whether a
    boutique exists, and a suspended boutique is 404 rather than 403 -- the
    platform's own suspensions are not something an anonymous caller is owed.
    """

    permission_classes = [AllowAny]
    throttle_classes = [_BoutiqueLookupThrottle]

    def get(self, request, slug):
        with schema_context('public'):
            tenant = (BoutiqueTenant.objects
                      .filter(shop_slug=(slug or '').lower(), is_active=True)
                      .exclude(schema_name='public')
                      .first())
        if tenant is None:
            return Response({"error": "No such boutique."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response({"name": tenant.name, "shop_slug": tenant.shop_slug,
                         "owner_first_name": _owner_first_name(tenant)},
                        status=status.HTTP_200_OK)


def _owner_first_name(tenant):
    """The owner's first name for the sign-in greeting, or ''.

    First name only, deliberately: this endpoint answers anyone who knows a
    slug, so it carries the least that makes "Welcome back, Sarala" possible
    -- never the surname, the email or anything that identifies the person
    beyond what the boutique's own sign-in page would show.

    Never raises. The owner row lives in the boutique's schema, and a missing
    schema or account must cost the greeting, not the sign-in screen.
    """
    try:
        with schema_context(tenant.schema_name):
            owner = (User.objects.filter(email__iexact=tenant.owner_email)
                     .only('first_name').first())
            return (owner.first_name or '').strip() if owner else ''
    except Exception:  # noqa: BLE001 - see docstring
        return ''


class LoginView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        username_or_email = (request.data.get('username') or '').strip().lower()
        password = request.data.get('password')
        shop_slug = (request.data.get('shop_slug') or '').strip().lower()

        if not username_or_email or not password:
            return Response(
                {"error": "Please provide email/username and password"},
                status=status.HTTP_400_BAD_REQUEST
            )

        suspended = None
        authenticated = None
        for candidate in find_tenants_for_account(username_or_email, shop_slug):
            if not candidate.is_active:
                suspended = candidate
                continue

            connection.set_tenant(candidate)
            user_obj = (User.objects.filter(email__iexact=username_or_email).first()
                        or User.objects.filter(username__iexact=username_or_email).first())
            username_to_auth = user_obj.username if user_obj else username_or_email
            user = authenticate(username=username_to_auth, password=password)
            if user:
                authenticated = (candidate, user)
                break
            connection.set_schema_to_public()

        if authenticated is None:
            connection.set_schema_to_public()
            if suspended is not None:
                return Response(
                    {"error": "This boutique's access has been suspended. "
                              "Please contact support."},
                    status=status.HTTP_403_FORBIDDEN
                )
            LoginThrottle.record_failure(request)
            signins.record(request, 'login', username_or_email, ok=False)
            return Response(
                {"error": "Invalid login credentials. Please try again."},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant, user = authenticated
        signins.record(request, 'login', user.username, ok=True, boutique=tenant.schema_name)
        connection.set_tenant(tenant)

        try:
            token, created = Token.objects.get_or_create(user=user)
            return Response({
                "token": token.key,
                "tenant_id": tenant.schema_name,
                "user": user_payload(user),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception('%s failed', self.__class__.__name__)
            connection.set_schema_to_public()
            return Response({"error": "Something went wrong. Please try again."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class LogoutView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            try:
                request.user.auth_token.delete()
            except Exception:
                pass
            return Response({"success": "Successfully logged out"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class MeView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Same user object as login, plus the schema the caller is in. The
        # extra key is the ONLY difference the two responses may have.
        return Response({**user_payload(request.user),
                         "tenant_id": connection.schema_name},
                        status=status.HTTP_200_OK)

    def patch(self, request):
        """Let a signed-in staff member set their own avatar.

        Self-scoped by construction: it writes to request.user's own roster row
        and nothing else, so it needs no role gate beyond being authenticated.
        Returns the same user object get() does, so the caller can drop the
        response straight back into its currentUser and the new face shows at
        once.
        """
        photo = request.FILES.get('profile_photo')
        if photo is None:
            return Response({'error': 'No photo was sent.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (photo.content_type or '').startswith('image/'):
            return Response({'error': 'Your profile photo must be an image.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if photo.size > 5 * 1024 * 1024:
            return Response({'error': 'That image is larger than 5MB.'},
                            status=status.HTTP_400_BAD_REQUEST)
        # Per-user store, so this works for the owner as well as staff and
        # designers -- none of whom may have a Tailor row. user_payload reads
        # this before the roster photo, so the user's own choice wins.
        from crm_api.models import UserAvatar
        avatar, _ = UserAvatar.objects.get_or_create(user=request.user)
        avatar.image = photo
        avatar.save()
        return Response({**user_payload(request.user),
                         "tenant_id": connection.schema_name},
                        status=status.HTTP_200_OK)

class _PasswordResetThrottle(AnonRateThrottle):

    scope = 'password_reset'


def make_reset_link(tenant, user):
    with schema_context(tenant.schema_name):
        payload = '.'.join([
            tenant.schema_name,
            urlsafe_base64_encode(force_bytes(user.pk)),
            default_token_generator.make_token(user),
        ])
    # The boutique's own portal path, because /app is registration now and a
    # reset link landing there would show a sign-up form. A tenant with no
    # slug yet keeps the slug-less entry point rather than being sent to a
    # URL with an empty segment in it.
    if tenant.shop_slug:
        return f"{settings.PORTAL_BASE_URL.rstrip('/')}/{tenant.shop_slug}?reset={payload}"
    return f"{settings.PASSWORD_RESET_BASE_URL}?reset={payload}"


def send_reset_email(tenant, user, link, address):
    return EmailService.send_password_reset_email(tenant, user, link, address)


class PasswordResetRequestView(views.APIView):

    permission_classes = [AllowAny]
    throttle_classes = [_PasswordResetThrottle]

    ANSWER = {"detail": "If that account exists, a reset link is on its way."}

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({"error": "Enter your email address."},
                            status=status.HTTP_400_BAD_REQUEST)

        tenant = find_tenant_for_account(email)
        signins.record(request, 'reset', email, ok=bool(tenant),
                       boutique=tenant.schema_name if tenant else '')
        if not tenant:
            return Response(self.ANSWER, status=status.HTTP_200_OK)

        with schema_context(tenant.schema_name):
            user = (User.objects.filter(email__iexact=email).first()
                    or User.objects.filter(username__iexact=email).first())
            if not user or not user.is_active:
                return Response(self.ANSWER, status=status.HTTP_200_OK)

            address = user.email or email

        link = make_reset_link(tenant, user)
        send_reset_email(tenant, user, link, address)

        return Response(self.ANSWER, status=status.HTTP_200_OK)


class PasswordResetConfirmView(views.APIView):


    permission_classes = [AllowAny]
    throttle_classes = [_PasswordResetThrottle]

    INVALID = {"error": "This reset link is no longer valid. "
                        "Please request a new one."}

    def post(self, request):
        payload = (request.data.get('token') or '').strip()
        password = request.data.get('password') or ''

        parts = payload.split('.')
        if len(parts) != 3:
            return Response(self.INVALID, status=status.HTTP_400_BAD_REQUEST)
        schema_name, uidb64, token = parts

        with schema_context('public'):
            tenant = BoutiqueTenant.objects.filter(
                schema_name=schema_name).first()
        if not tenant:
            return Response(self.INVALID, status=status.HTTP_400_BAD_REQUEST)
        if not tenant.is_active:
            return Response(
                {"error": "This boutique's access has been suspended. "
                          "Please contact support."},
                status=status.HTTP_403_FORBIDDEN)

        with schema_context(tenant.schema_name):
            try:
                user = User.objects.get(
                    pk=force_str(urlsafe_base64_decode(uidb64)))
            except (User.DoesNotExist, ValueError, TypeError, OverflowError):
                return Response(self.INVALID,
                                status=status.HTTP_400_BAD_REQUEST)

            if not default_token_generator.check_token(user, token):
                return Response(self.INVALID,
                                status=status.HTTP_400_BAD_REQUEST)

            try:
                validate_password(password, user)
            except DjangoValidationError as exc:
                return Response({"error": " ".join(exc.messages)},
                                status=status.HTTP_400_BAD_REQUEST)

            user.set_password(password)
            user.save(update_fields=['password'])

            Token.objects.filter(user=user).delete()

        return Response({"detail": "Your password has been changed. "
                                   "Please sign in."},
                        status=status.HTTP_200_OK)


class SeedDataView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if resolve_user_role(request.user) != OWNER:
            return Response({"error": "Only the boutique owner can seed data."},
                            status=status.HTTP_403_FORBIDDEN)

        from crm_api.utils import seed_tenant_defaults
        try:
            seed_tenant_defaults()
            return Response({"success": "Tenant data seeded successfully"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
