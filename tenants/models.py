from django.db import models
from django_tenants.models import TenantMixin, DomainMixin

class BoutiqueTenant(TenantMixin):
    owner_email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)
    created_on = models.DateField(auto_now_add=True)

    timezone = models.CharField(
        max_length=64, default='Asia/Kolkata',
        help_text="IANA name, e.g. Asia/Kolkata. Used to show this boutique "
                  "and its customers their own local time. Storage stays UTC.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Unticked, this boutique cannot sign in or use the API. Its data is kept.",
    )

    # The bundle this boutique is on (core.modules.PLANS). The column default
    # is the largest so that boutiques from before plans existed (and every
    # test fixture) keep the whole product; signup sets the smallest
    # explicitly (crm_api/auth_views.py), which is where that decision belongs.
    plan = models.CharField(max_length=20, default='atelier')

    # This boutique's own portal path: boutique.scaleezy.com/<shop_slug>
    # instead of /app. Here rather than on BoutiqueSettings because the lookup
    # has to answer before a schema is chosen, and BoutiqueSettings lives
    # inside the schema it would be identifying. Nullable: a boutique without
    # one keeps using /app, which stays a working entry point.
    shop_slug = models.SlugField(
        max_length=63, unique=True, null=True, blank=True,
        help_text="The boutique's portal path, e.g. 'saralaboutique' for "
                  "boutique.scaleezy.com/saralaboutique. An alias only -- the "
                  "tenant a request acts on is still decided by its token.",
    )

    enabled_modules = models.JSONField(
        default=dict, blank=True,
        help_text="Overrides on top of the plan, as {module_key: true/false}: "
                  "an add-on bought, or a module granted or withheld by hand. "
                  "A module not listed follows the plan.",
    )

    # The look the platform has enabled for this boutique. Set from the
    # console, not by the boutique: the design system is part of the product
    # it is sold, so the workspace's own Settings has no control for it.
    DESIGN_SYSTEMS = [('scaleezy', 'Scaleezy'), ('atelier', 'Atelier')]
    COLOR_MODES = [('light', 'Light'), ('dark', 'Dark'), ('system', 'Match device')]
    design_system = models.CharField(max_length=32, choices=DESIGN_SYSTEMS, default='scaleezy')
    color_mode = models.CharField(max_length=16, choices=COLOR_MODES, default='light')

    auto_create_schema = True

    def __str__(self):
        return f"{self.name} ({self.owner_email})"

class Domain(DomainMixin):
    pass


class WhatsAppAccount(models.Model):
    STATUS_CHOICES = [
        ('DISCONNECTED', 'Disconnected'),
        ('CONNECTING', 'Connecting'),
        ('CONNECTED', 'Connected'),
    ]

    tenant = models.OneToOneField(
        BoutiqueTenant,
        on_delete=models.CASCADE,
        related_name='whatsapp_account'
    )
    session_id = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique session identifier for the WhatsApp Baileys socket instance."
    )
    phone_number = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text="Paired WhatsApp phone number for this tenant."
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DISCONNECTED'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"WhatsApp ({self.session_id}) for {self.tenant.name}"


class PortalCredential(models.Model):
    """Which customer portal is calling, and for which boutique.

    NOT AN AUTHENTICATION BOUNDARY when the portal is a browser page. The value
    ships inside JavaScript a visitor can read, so it must be assumed public:
    it names the caller, it does not prove anything about them. What actually
    protects customer data is further down -- a WhatsApp OTP, then a signed,
    short-lived, mobile-and-boutique-bound token (crm_api/portal_tokens.py).
    Nothing here is allowed to stand in for either.

    What it does buy, which is why it exists: a portal can be switched off
    without touching the boutique, rotated without a deploy, rate limited as a
    unit, and -- the part that matters most -- pinned to exactly ONE boutique,
    so a credential issued to one shop cannot be replayed against another's
    slug.

    Lives in the shared schema because the lookup happens before any schema is
    chosen, the same reason BoutiqueTenant.shop_slug does.
    """

    #: Shown once, at creation, and never again -- only the hash is kept.
    #: `key_id` is the public half: it is what the lookup is by, so a wrong
    #: secret costs one indexed query and no timing signal about which part
    #: was wrong.
    tenant = models.ForeignKey(
        BoutiqueTenant, on_delete=models.CASCADE, related_name='portal_credentials')
    label = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Which portal this is, for the person revoking it later.")
    key_id = models.CharField(max_length=32, unique=True, db_index=True)
    secret_hash = models.CharField(max_length=64)

    #: The one browser origin allowed to read a cross-origin response from the
    #: intake endpoints. A courtesy to the browser, not a control: curl ignores
    #: CORS entirely, so this narrows who can be *tricked* into calling, never
    #: who can call.
    allowed_origin = models.CharField(
        max_length=200, blank=True, default='',
        help_text="e.g. https://sarala.example.com. Blank sends no CORS header, "
                  "so only same-origin and non-browser callers can read a reply.")

    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        state = 'active' if self.is_active else 'revoked'
        return f"{self.label or self.key_id} for {self.tenant.schema_name} ({state})"


class DemoRequest(models.Model):

    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('CONTACTED', 'Contacted'),
        ('QUALIFIED', 'Qualified'),
        ('CONVERTED', 'Converted'),
        ('DECLINED', 'Declined'),
    ]

    name = models.CharField(max_length=100)
    boutique = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=40)

    makes = models.CharField(max_length=200, blank=True)
    orders_per_month = models.CharField(max_length=40, blank=True)
    people = models.CharField(max_length=40, blank=True)
    problem = models.CharField(max_length=2000, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='NEW', db_index=True)
    notes = models.TextField(blank=True)

    ip = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.boutique} ({self.created_at:%Y-%m-%d})"
