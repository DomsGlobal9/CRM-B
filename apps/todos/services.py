"""Who is who on a to-do, and who may do what with it."""

from django.contrib.auth.models import User
from django.db import connection
from django.db.models import Q

from apps.design_studio.models import Designer
from core.roles import (
    ASSIGNMENT_RANK, DESIGNER, MASTER, OWNER, WORKER_RANK, assigns_work, can_assign,
    resolve_user_role,
)
from crm_api.models import Notification, Tailor

#: Roles that may give a to-do to somebody else -- core.roles decides.
ASSIGNER_ROLES = tuple(r for r, rank in ASSIGNMENT_RANK.items() if rank < WORKER_RANK)


def display_name(user):
    tailor = getattr(user, 'tailor_profile', None)
    if tailor is not None and tailor.name:
        return tailor.name
    designer = getattr(user, 'designer_profile', None)
    if designer is not None and designer.name:
        return designer.name
    return user.get_full_name() or user.username or user.email or 'Someone'


def person(user, role=None):
    return {
        'id': user.id,
        'name': display_name(user),
        'role': role if role is not None else (resolve_user_role(user) or ''),
    }


def _owner_users():
    owner_email = (getattr(connection.tenant, 'owner_email', '') or '').lower()
    if not owner_email:
        return []
    return list(User.objects.filter(email__iexact=owner_email, is_active=True))


def assignable_people(user, role):
    """The people this login may give a to-do to, themselves first.

    Everyone core.roles.can_assign lets this role reach: Owner, everyone with a
    login; Designer, the floor and the other designers; Master, the floor;
    anyone else, only themselves.
    """
    people = {user.id: person(user, role)}
    if not assigns_work(role):
        return list(people.values())

    owners = _owner_users()
    owner_ids = {u.id for u in owners}
    if can_assign(role, OWNER):
        for owner in owners:
            people.setdefault(owner.id, person(owner, OWNER))

    floor = (Tailor.objects.filter(user__isnull=False, user__is_active=True)
             .select_related('user').order_by('name'))
    for tailor in floor:
        if tailor.user_id in owner_ids or not can_assign(role, tailor.role):
            continue
        people.setdefault(tailor.user_id, {
            'id': tailor.user_id, 'name': tailor.name, 'role': tailor.role})

    if can_assign(role, DESIGNER):
        designers = (Designer.objects.filter(user__isnull=False, user__is_active=True)
                     .select_related('user').order_by('name'))
        for designer in designers:
            if designer.user_id in owner_ids:
                continue
            people.setdefault(designer.user_id, {
                'id': designer.user_id, 'name': designer.name, 'role': DESIGNER})
    return list(people.values())


def visible_todos(queryset, user, role):
    """Owner, Designer and Master see every to-do; everyone else only their own."""
    if role in (OWNER, DESIGNER, MASTER):
        return queryset
    return queryset.filter(Q(assigned_to=user) | Q(created_by=user))


def can_edit(todo, user, role):
    return role in (OWNER, DESIGNER, MASTER) or todo.created_by_id == user.id


def can_change_status(todo, user, role):
    return can_edit(todo, user, role) or todo.assigned_to_id == user.id


def can_delete(todo, user, role):
    return role == OWNER or todo.created_by_id == user.id


def notify(user, title, message):
    """Put a line on this person's bell."""
    if user is None:
        return
    role = resolve_user_role(user)
    if role == OWNER:
        Notification.objects.create(title=title, message=message, recipient_role='Owner')
        return
    profile = getattr(user, 'tailor_profile', None) or getattr(user, 'designer_profile', None)
    if profile is None:
        return
    email = profile.email or user.email
    if email:
        Notification.objects.create(
            title=title, message=message,
            recipient_role=getattr(profile, 'role', DESIGNER), recipient_email=email)
