"""The To-do: each staff member's daily update of their work.

Everyone but the owner posts updates -- a note, photos, a voice note, a video,
any mix -- as often as they like in a day. A person reads their own; the
owner, Masters and Designers read everyone's (views.py).
"""
from django.conf import settings
from django.db import models


class DailyUpdate(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='daily_updates')
    #: Who posted it, as they were at the time: the row still reads right
    #: once the person has left or been renamed.
    author_name = models.CharField(max_length=150, blank=True, default='')
    author_role = models.CharField(max_length=50, blank=True, default='')
    #: The boutique's own calendar day it was posted on.
    date = models.DateField(db_index=True)
    note = models.TextField(blank=True, default='')
    voice_note = models.URLField(max_length=500, blank=True, default='')
    photos = models.JSONField(default=list, blank=True)
    video = models.URLField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.author_name or 'Someone'} · {self.date}"
