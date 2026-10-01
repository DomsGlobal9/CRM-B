"""To-dos: small pieces of work a person takes on or is given.

A to-do belongs to logins rather than roster rows, because the people who use
it are the owner, floor staff and designers -- three different records with
one thing in common, a User. Names are kept beside each link so the history
still reads properly after someone leaves.
"""

import uuid

from django.conf import settings
from django.db import models

IMAGE_PATH_MAX_LENGTH = 500


def upload_to_todo_photos(instance, filename):
    return f"todo_photos/{uuid.uuid4().hex}/{filename}"


class Todo(models.Model):
    STATUS_OPEN = 'OPEN'
    STATUS_IN_PROGRESS = 'IN_PROGRESS'
    STATUS_CLOSED = 'CLOSED'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_IN_PROGRESS, 'In progress'),
        (STATUS_CLOSED, 'Closed'),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    #: When the work starts and when it should end (the end is `due_date`).
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='todos_created')
    created_by_name = models.CharField(max_length=150, blank=True, default='')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='todos_assigned')
    assigned_to_name = models.CharField(max_length=150, blank=True, default='')
    assigned_to_role = models.CharField(max_length=50, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['assigned_to', 'status']),
            models.Index(fields=['created_by', 'status']),
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"


class TodoUpdate(models.Model):
    """One entry on a to-do: a note with photos and a voice clip, or a record
    of the status or the assignee changing."""

    KIND_NOTE = 'NOTE'
    KIND_STATUS = 'STATUS'
    KIND_ASSIGNED = 'ASSIGNED'
    KIND_CHOICES = [
        (KIND_NOTE, 'Note'),
        (KIND_STATUS, 'Status change'),
        (KIND_ASSIGNED, 'Assigned'),
    ]

    todo = models.ForeignKey(Todo, on_delete=models.CASCADE, related_name='updates')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_NOTE)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='todo_updates')
    author_name = models.CharField(max_length=150, blank=True, default='')
    text = models.TextField(blank=True, default='')
    #: URL of a clip stored through /api/voice-notes/.
    voice_note = models.CharField(max_length=IMAGE_PATH_MAX_LENGTH, blank=True, default='')
    status_to = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']


class TodoPhoto(models.Model):
    update = models.ForeignKey(TodoUpdate, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to=upload_to_todo_photos,
                              max_length=IMAGE_PATH_MAX_LENGTH)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
