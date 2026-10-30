
from django.db.models import Q
from rest_framework import permissions

from core.admin_access import admin_may, holds
from core.permissions import ModuleAccess
from core.permissions import OwnerOnly as CoreOwnerOnly
from core.roles import DESIGNER, OWNER, resolve_user_role

MASTER = 'Master'
TAILOR = 'Tailor'


class DesignStudioPermission(ModuleAccess):


    message = "Your role does not permit this action in the Design Studio."

    def has_role_permission(self, request, view):
        role = resolve_user_role(request.user)
        if role is None:
            return False
        if role == OWNER:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        if role == MASTER and getattr(view, 'action', None) == 'production_notes':
            return True
        # Design work the owner handed this role (core.admin_access).
        return admin_may(request, view)


class DesignLibraryPermission(DesignStudioPermission):

    OWN_UPLOAD_ACTIONS = {'update', 'partial_update', 'destroy'}

    def has_role_permission(self, request, view):
        action = getattr(view, 'action', None)
        if action == 'create':
            return resolve_user_role(request.user) is not None
        if action in self.OWN_UPLOAD_ACTIONS and resolve_user_role(request.user) == DESIGNER:
            return True
        return super().has_role_permission(request, view)

    def has_object_permission(self, request, view, obj):
        role = resolve_user_role(request.user)
        if role == OWNER or admin_may(request, view):
            return True
        if role == DESIGNER and getattr(view, 'action', None) in self.OWN_UPLOAD_ACTIONS:
            return obj.created_by_id == request.user.id
        return super().has_role_permission(request, view)


class OwnerOnly(CoreOwnerOnly):


    message = "Only the boutique owner can use design discovery."


def visible_boards(queryset, user):
    role = resolve_user_role(user)
    if role == OWNER or holds(user, 'design.view', 'design.boards'):
        return queryset
    if role == MASTER:
        return queryset.exclude(status=queryset.model.STATUS_DRAFT)
    if getattr(user, 'tailor_profile', None) is not None:
        return queryset.filter(status=queryset.model.STATUS_APPROVED)
    return queryset.none()


class DesignAssignmentPermission(ModuleAccess):

    message = "Your role does not permit this action on design assignments."

    #: Handing design work to a designer, or taking it back.
    ASSIGNMENT_ACTIONS = {'create', 'update', 'partial_update', 'destroy'}
    #: A Designer hands work on through `create`, which also reassigns; the
    #: view limits that to work that is theirs or nobody's yet.
    DESIGNER_ACTIONS = {'list', 'retrieve', 'submit', 'create'}

    def has_role_permission(self, request, view):
        role = resolve_user_role(request.user)
        if role is None:
            return False
        if role == OWNER or admin_may(request, view):
            return True
        action = getattr(view, 'action', None)
        # A Designer's work is not shown to anybody below them: the Master and
        # every production role are refused all of it -- reading, submitting
        # and reviewing included. Reviewing is the Owner's.
        if role == DESIGNER:
            return action in self.DESIGNER_ACTIONS
        return False


def visible_assignments(queryset, user):
    role = resolve_user_role(user)
    # The Owner, and whoever the owner handed design work to. Not the Master:
    # the Designer ranks above them (core.roles.ASSIGNMENT_RANK).
    if role == OWNER or holds(user, 'design.assign'):
        return queryset
    if role == DESIGNER:
        profile = getattr(user, 'designer_profile', None)
        if profile is None:
            return queryset.none()
        return queryset.filter(designer_id=profile.id)
    return queryset.none()


def visible_designs(queryset, user):
    """The design library as each role may read it.

    The Owner and Designers see every design. Below them -- the Master and
    every production role -- a Designer's unfinished work is not shown: no
    drafts, nothing waiting for the owner's approval, and nothing marked
    Designer only. People still see what they uploaded themselves. Whoever the
    owner handed design work to sees it all, as they need to.
    """
    role = resolve_user_role(user)
    if role in (OWNER, DESIGNER) or holds(user, 'design.view', 'design.approve', 'design.upload'):
        return queryset
    model = queryset.model
    unfinished = (Q(status__in=(model.Status.DRAFT, model.Status.PENDING))
                  | Q(visibility=model.Visibility.DESIGNER_ONLY))
    return queryset.filter(~unfinished | Q(created_by=user))
