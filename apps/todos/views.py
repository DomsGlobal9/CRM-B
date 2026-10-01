from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import ModuleAccess
from core.roles import resolve_user_role
from core.validators import validate_http_url, validate_image_uploads, validate_text

from . import services
from .models import Todo, TodoPhoto, TodoUpdate
from .serializers import TodoSerializer

MAX_TITLE = 200
MAX_PHOTOS_PER_UPDATE = 10
STATUS_LABELS = dict(Todo.STATUS_CHOICES)


class TodoPermission(ModuleAccess):
    """Anyone with a role may open the to-do list; what they may do with a
    particular to-do is decided per object in the view."""

    message = "Your role does not permit this."

    def has_role_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated
                    and resolve_user_role(user) is not None)


class TodoViewSet(viewsets.GenericViewSet):
    serializer_class = TodoSerializer
    permission_classes = [TodoPermission]
    queryset = Todo.objects.all()

    # -- helpers -----------------------------------------------------------

    def _role(self):
        if not hasattr(self, '_cached_role'):
            self._cached_role = resolve_user_role(self.request.user)
        return self._cached_role

    def get_queryset(self):
        queryset = Todo.objects.prefetch_related('updates__photos')
        return services.visible_todos(queryset, self.request.user, self._role())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['role'] = self._role()
        return context

    def _render(self, todo, code=status.HTTP_200_OK):
        todo = self.get_queryset().get(pk=todo.pk)
        return Response(self.get_serializer(todo).data, status=code)

    def _refuse(self, message):
        return Response({'detail': message}, status=status.HTTP_403_FORBIDDEN)

    def _assignee(self, raw):
        """The User a to-do is being given to, checked against who this login
        may assign to. Blank means themselves."""
        user = self.request.user
        if raw in (None, ''):
            return user
        try:
            target_id = int(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'assigned_to': 'Choose a person from the list.'})
        if target_id == user.id:
            return user
        allowed = {p['id'] for p in services.assignable_people(user, self._role())}
        if target_id not in allowed:
            raise serializers.ValidationError(
                {'assigned_to': 'You cannot assign a to-do to that person.'})
        return User.objects.get(pk=target_id)

    @staticmethod
    def _due_date(raw):
        if raw in (None, ''):
            return None
        try:
            parsed = parse_date(str(raw))
        except ValueError:
            parsed = None
        if parsed is None:
            raise serializers.ValidationError({'due_date': 'Enter a valid date.'})
        return parsed

    def _set_assignee(self, todo, target):
        todo.assigned_to = target
        todo.assigned_to_name = services.display_name(target)
        todo.assigned_to_role = resolve_user_role(target) or ''

    def _add_note(self, todo, request):
        """A note from the request's text, photos and voice clip, or None when
        the request carries none of them."""
        text = validate_text(request.data.get('text'), label='Note')
        voice = validate_http_url(request.data.get('voice_note'), label='Voice note')
        photos = validate_image_uploads(
            request.FILES.getlist('photos'), max_count=MAX_PHOTOS_PER_UPDATE)
        if not (text or voice or photos):
            return None
        update = TodoUpdate.objects.create(
            todo=todo, kind=TodoUpdate.KIND_NOTE, author=request.user,
            author_name=services.display_name(request.user),
            text=text, voice_note=voice)
        for photo in photos:
            TodoPhoto.objects.create(update=update, image=photo)
        return update

    def _notify_assigned(self, todo):
        if todo.assigned_to_id and todo.assigned_to_id != self.request.user.id:
            who = services.display_name(self.request.user)
            services.notify(
                todo.assigned_to, f"New to-do: {todo.title}",
                f"{who} assigned you a to-do: {todo.title}. Open To-do to see it.")

    # -- endpoints ---------------------------------------------------------

    def list(self, request):
        queryset = self.get_queryset()
        wanted = request.query_params.get('status')
        if wanted in STATUS_LABELS:
            queryset = queryset.filter(status=wanted)
        return Response(self.get_serializer(queryset, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @transaction.atomic
    def create(self, request):
        title = validate_text(request.data.get('title'), label='Title',
                              max_length=MAX_TITLE, required=True)
        todo = Todo(
            title=title,
            description=validate_text(request.data.get('description'), label='Description'),
            due_date=self._due_date(request.data.get('due_date')),
            created_by=request.user,
            created_by_name=services.display_name(request.user),
        )
        self._set_assignee(todo, self._assignee(request.data.get('assigned_to')))
        todo.save()
        self._add_note(todo, request)
        self._notify_assigned(todo)
        return self._render(todo, status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, pk=None):
        todo = self.get_object()
        if not services.can_edit(todo, request.user, self._role()):
            return self._refuse('Only the person who created this to-do, the owner '
                                'or a Master can edit it.')
        data = request.data
        if 'title' in data:
            todo.title = validate_text(data.get('title'), label='Title',
                                       max_length=MAX_TITLE, required=True)
        if 'description' in data:
            todo.description = validate_text(data.get('description'), label='Description')
        if 'due_date' in data:
            todo.due_date = self._due_date(data.get('due_date'))
        reassigned = False
        if 'assigned_to' in data:
            target = self._assignee(data.get('assigned_to'))
            if target.id != todo.assigned_to_id:
                self._set_assignee(todo, target)
                reassigned = True
        todo.save()
        if reassigned:
            TodoUpdate.objects.create(
                todo=todo, kind=TodoUpdate.KIND_ASSIGNED, author=request.user,
                author_name=services.display_name(request.user),
                text=f"Assigned to {todo.assigned_to_name}")
            self._notify_assigned(todo)
        return self._render(todo)

    def destroy(self, request, pk=None):
        todo = self.get_object()
        if not services.can_delete(todo, request.user, self._role()):
            return self._refuse('Only the person who created this to-do or the owner '
                                'can delete it.')
        todo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['GET'], url_path='people')
    def people(self, request):
        """Who this login may assign a to-do to."""
        role = self._role()
        return Response({
            'can_assign': role in services.ASSIGNER_ROLES,
            'people': services.assignable_people(request.user, role),
        })

    @action(detail=True, methods=['POST'], url_path='status')
    @transaction.atomic
    def set_status(self, request, pk=None):
        todo = self.get_object()
        if not services.can_change_status(todo, request.user, self._role()):
            return self._refuse('Only the person this to-do is assigned to, its creator, '
                                'the owner or a Master can change its status.')
        wanted = request.data.get('status')
        if wanted not in STATUS_LABELS:
            raise serializers.ValidationError(
                {'status': 'Choose Open, In progress or Closed.'})
        if wanted != todo.status:
            todo.status = wanted
            todo.closed_at = timezone.now() if wanted == Todo.STATUS_CLOSED else None
            todo.save()
            who = services.display_name(request.user)
            TodoUpdate.objects.create(
                todo=todo, kind=TodoUpdate.KIND_STATUS, author=request.user,
                author_name=who, status_to=wanted,
                text=f"Marked {STATUS_LABELS[wanted]}")
            if (wanted == Todo.STATUS_CLOSED and todo.created_by_id
                    and todo.created_by_id != request.user.id):
                services.notify(
                    todo.created_by, f"To-do closed: {todo.title}",
                    f"{who} closed the to-do: {todo.title}.")
        return self._render(todo)

    @action(detail=True, methods=['POST'], url_path='updates')
    @transaction.atomic
    def add_update(self, request, pk=None):
        """Add a note to a to-do: text, photos, a voice note, or any mix."""
        todo = self.get_object()
        if self._add_note(todo, request) is None:
            raise serializers.ValidationError(
                {'detail': 'Add a note, a photo or a voice note.'})
        todo.save(update_fields=['updated_at'])
        return self._render(todo, status.HTTP_201_CREATED)
