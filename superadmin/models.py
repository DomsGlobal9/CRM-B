
from django.db import models


class AuditLog(models.Model):

    ACTIONS = [
        ('boutique.suspend', 'Boutique suspended'),
        ('boutique.reactivate', 'Boutique reactivated'),
        ('boutique.modules', 'Boutique modules changed'),
        ('boutique.appearance', 'Boutique appearance changed'),
        ('user.deactivate', 'User deactivated'),
        ('user.activate', 'User activated'),
        ('user.revoke_token', 'User sessions revoked'),
        ('user.password_reset', 'Password reset triggered'),
        ('user.access_link', 'Sign-in link issued'),
        ('lead.update', 'Lead updated'),
        ('flag.change', 'Feature flag changed'),
        ('setting.change', 'Platform setting changed'),
        ('error.acknowledge', 'Error acknowledged'),
        ('error.resolve', 'Error resolved'),
        ('data.view', 'Boutique data viewed'),
        ('console.login', 'Console sign-in'),
        ('console.logout', 'Console sign-out'),
        ('console.login_failed', 'Console sign-in failed'),
    ]

    actor = models.CharField(
        max_length=150, db_index=True,
        help_text="Username of the administrator. Stored as text, not a FK, so "
                  "the entry outlives the account.")
    action = models.CharField(max_length=40, choices=ACTIONS, db_index=True)

    target = models.CharField(max_length=255, blank=True, db_index=True)
    boutique = models.CharField(max_length=63, blank=True, db_index=True)

    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)

    reason = models.TextField(blank=True)

    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['boutique', '-created_at']),
            models.Index(fields=['actor', '-created_at']),
            models.Index(fields=['action', '-created_at']),
        ]

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.actor} {self.action} {self.target}'


class ErrorEvent(models.Model):

    SEVERITIES = [('critical', 'Critical'), ('high', 'High'),
                  ('medium', 'Medium'), ('low', 'Low')]
    STATUSES = [('new', 'New'), ('acknowledged', 'Acknowledged'),
                ('resolved', 'Resolved'), ('ignored', 'Ignored')]

    
    KINDS = [('crash', 'Unhandled crash'), ('handled', 'Handled exception'),
             ('refusal', 'Refused by a platform control'),
             ('client', 'Client error'), ('frontend', 'Frontend crash')]

    
    kind = models.CharField(max_length=10, choices=KINDS, default='crash', db_index=True)

    fingerprint = models.CharField(max_length=40, unique=True, db_index=True)

    exception_type = models.CharField(max_length=200, db_index=True)

    
    source = models.CharField(max_length=200, blank=True)
    message = models.TextField()
    traceback = models.TextField(blank=True)

    path = models.CharField(max_length=300, db_index=True)
    method = models.CharField(max_length=10, blank=True)
    status_code = models.PositiveSmallIntegerField(default=500)

    boutique = models.CharField(max_length=63, blank=True, db_index=True)
    boutiques = models.JSONField(default=list, blank=True)
    username = models.CharField(max_length=150, blank=True)

    severity = models.CharField(max_length=10, choices=SEVERITIES, default='high', db_index=True)
    status = models.CharField(max_length=12, choices=STATUSES, default='new', db_index=True)

    count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True, db_index=True)
    last_seen = models.DateTimeField(auto_now=True, db_index=True)

    notes = models.TextField(blank=True)
    resolved_by = models.CharField(max_length=150, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_seen']
        indexes = [
            models.Index(fields=['status', '-last_seen']),
            models.Index(fields=['severity', '-last_seen']),
            models.Index(fields=['boutique', '-last_seen']),
            
            models.Index(fields=['kind', '-last_seen']),
        ]

    def __str__(self):
        return f'{self.get_kind_display()}: {self.exception_type} at {self.path} (x{self.count})'


class FeatureFlag(models.Model):

    key = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=False)

    enabled_for = models.JSONField(default=list, blank=True)
    rollout_percent = models.PositiveSmallIntegerField(default=0)

    created_by = models.CharField(max_length=150, blank=True)
    modified_by = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return f'{self.key} ({"on" if self.enabled else "off"})'

    def applies_to(self, schema_name):

        if schema_name and schema_name in (self.enabled_for or []):
            return True
        if self.enabled:
            return True
        if self.rollout_percent and schema_name:
            import hashlib
            digest = hashlib.sha1(f'{self.key}:{schema_name}'.encode()).hexdigest()
            return int(digest[:8], 16) % 100 < self.rollout_percent
        return False


class PlatformSetting(models.Model):

    key = models.SlugField(max_length=80, unique=True)
    value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    updated_by = models.CharField(max_length=150, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key


class LoginAttempt(models.Model):
    """
    Every sign-in and reset request, pass or fail, in one place.

    The throttles in crm_api.auth_views stop a brute-force run; this is what
    lets somebody find out afterwards that one happened, from where, and at
    which accounts. Not an AuditLog row: that table is what administrators
    did, and burying it under every wrong password would make its daily digest
    unreadable.
    """
    KINDS = [('login', 'Boutique sign-in'), ('console', 'Console sign-in'),
             ('reset', 'Password reset requested')]

    kind = models.CharField(max_length=10, choices=KINDS, db_index=True)
    username = models.CharField(max_length=150, blank=True, db_index=True)
    boutique = models.CharField(max_length=63, blank=True, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    ok = models.BooleanField()
    user_agent = models.CharField(max_length=300, blank=True)
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-at']
        indexes = [models.Index(fields=['ok', '-at'])]

    def __str__(self):
        return f'{self.kind} {self.username} {"ok" if self.ok else "failed"}'


class PlatformNotification(models.Model):
    """Something the platform administrators should know about, shown on the
    console's bell until someone marks it read.

    One shared inbox rather than per-administrator read state: the console is
    run by a small team, and "has anyone looked at this yet" is the question
    the bell answers.
    """

    BOUTIQUE_SIGNUP = 'boutique_signup'
    KINDS = [(BOUTIQUE_SIGNUP, 'New boutique signed up')]

    kind = models.CharField(max_length=40, choices=KINDS, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    boutique = models.CharField(max_length=63, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    read_by = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
