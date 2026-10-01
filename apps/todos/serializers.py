from rest_framework import serializers

from . import services
from .models import Todo, TodoPhoto, TodoUpdate


class TodoPhotoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = TodoPhoto
        fields = ['id', 'url']

    def get_url(self, photo):
        url = photo.image.url if photo.image else ''
        request = self.context.get('request')
        if url.startswith('/') and request is not None:
            url = request.build_absolute_uri(url)
        return url


class TodoUpdateSerializer(serializers.ModelSerializer):
    photos = TodoPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = TodoUpdate
        fields = ['id', 'kind', 'author', 'author_name', 'text', 'voice_note',
                  'status_to', 'photos', 'created_at']


class TodoSerializer(serializers.ModelSerializer):
    updates = TodoUpdateSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_change_status = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Todo
        fields = ['id', 'title', 'description', 'status', 'due_date',
                  'created_by', 'created_by_name',
                  'assigned_to', 'assigned_to_name', 'assigned_to_role',
                  'created_at', 'updated_at', 'closed_at', 'updates',
                  'can_edit', 'can_change_status', 'can_delete']

    def _who(self):
        request = self.context['request']
        return request.user, self.context.get('role')

    def get_can_edit(self, todo):
        return services.can_edit(todo, *self._who())

    def get_can_change_status(self, todo):
        return services.can_change_status(todo, *self._who())

    def get_can_delete(self, todo):
        return services.can_delete(todo, *self._who())
