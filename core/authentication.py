"""DRF authentication with the temporary-password gate.

A boutique created from the console starts with a temporary owner password
(BoutiqueTenant.owner_password_temporary). Until the owner chooses their own,
their token authenticates only for the few endpoints the change-password
screen needs; everything else is refused with 403 password_change_required.

The flag is read from request.owner_password_temporary, which the tenant
middleware sets from the control row it already reads fresh on every request,
so there is no extra query and no five-minute cache lag after the change.

Enforced here rather than in each view because authentication runs for every
DRF view that does not opt out, so a view added later cannot forget it.
"""

from django.db import connection
from rest_framework import authentication, exceptions


class PasswordChangeRequired(exceptions.PermissionDenied):
    default_detail = {
        'error': 'Choose a new password before continuing.',
        'code': 'password_change_required',
    }
    default_code = 'password_change_required'


#: What a temporary-password owner can still reach: who am I, change it, leave.
ALLOWED_WHILE_TEMPORARY = frozenset({
    '/api/auth/me/',
    '/api/auth/change-password/',
    '/api/auth/logout/',
    '/api/auth/platform/',
})


def _is_owner(user, tenant):
    owner = (getattr(tenant, 'owner_email', '') or '').lower()
    if not owner:
        return False
    return owner in {(user.email or '').lower(), (user.username or '').lower()}


def enforce_password_change(request, result):
    if result is None:
        return result
    django_request = getattr(request, '_request', request)
    if not getattr(django_request, 'owner_password_temporary', False):
        return result
    if django_request.path in ALLOWED_WHILE_TEMPORARY:
        return result
    if _is_owner(result[0], getattr(connection, 'tenant', None)):
        raise PasswordChangeRequired()
    return result


class TokenAuthentication(authentication.TokenAuthentication):
    def authenticate(self, request):
        return enforce_password_change(request, super().authenticate(request))


class SessionAuthentication(authentication.SessionAuthentication):
    def authenticate(self, request):
        return enforce_password_change(request, super().authenticate(request))
