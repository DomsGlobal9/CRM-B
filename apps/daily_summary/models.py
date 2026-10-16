from django.conf import settings
from django.db import models

from .text import DEFAULT, LANGUAGES


class SummaryPreference(models.Model):
    """Whether one person gets the daily summary, and in which language.

    Set by the owner, for themselves and each staff member. No row means the
    defaults -- on, English -- so existing and new people need no record.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='summary_preference')
    enabled = models.BooleanField(default=True)
    language = models.CharField(max_length=5, choices=LANGUAGES, default=DEFAULT)
    updated_at = models.DateTimeField(auto_now=True)


class DailySummaryLog(models.Model):
    """One person's summary for one boutique day: the duplicate guard and the
    delivery record in one row.

    The row is written BEFORE anything is sent, under the unique key, so two
    overlapping runs cannot both send: the second finds the row and stops. A
    row left at SENDING (the process died mid-send) is never retried -- a
    missing summary is better than a second one.
    """

    STATUS_SENDING = 'SENDING'
    STATUS_SENT = 'SENT'
    STATUS_FAILED = 'FAILED'
    STATUS_SKIPPED = 'SKIPPED'
    STATUS_CHOICES = [
        (STATUS_SENDING, 'Sending'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                             null=True, related_name='daily_summaries')
    recipient_name = models.CharField(max_length=150, blank=True, default='')
    role = models.CharField(max_length=50, blank=True, default='')
    #: The boutique's own calendar date the summary is about.
    local_date = models.DateField(db_index=True)
    channel = models.CharField(max_length=20, blank=True, default='')
    address = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    #: Why it failed, was skipped, or why it went by email instead of WhatsApp.
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-local_date', 'recipient_name']
        constraints = [
            models.UniqueConstraint(fields=['user', 'local_date'],
                                    name='daily_summary_once_per_day'),
        ]

    def __str__(self):
        return f"{self.recipient_name} {self.local_date} ({self.status})"
