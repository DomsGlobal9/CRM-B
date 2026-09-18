from django.db import models
import re
import uuid
from urllib.parse import quote
from django.conf import settings
from django.contrib.auth.models import User


NATIONAL_NUMBER_LENGTH = 10


# 500, not the ImageField default of 100.
#
# What is stored is the name the STORAGE BACKEND returns, not the path
# upload_to proposed. `completed_garments/<32-hex>/<original filename>` is
# already 96 characters for an ordinary phone filename, and Cloudinary returns
# its public id -- the same path under a `media/` prefix with a random suffix
# appended -- which puts it past 100 and made Postgres reject the row with
# "value too long for type character varying(100)". A tailor submitting a
# completed garment photograph got a 500 and the order kept its old status.
#
# Wide enough for a 255-character filename, which is what a filesystem allows,
# so the limit stops depending on how the customer named the picture.
IMAGE_PATH_MAX_LENGTH = 500


def _unguessable_path(directory, filename):
    return f"{directory}/{uuid.uuid4().hex}/{filename}"


def upload_to_customer_profiles(instance, filename):
    return _unguessable_path('customer_profiles', filename)


def upload_to_completed_garments(instance, filename):
    return _unguessable_path('completed_garments', filename)


def upload_to_stage_images(instance, filename):
    return _unguessable_path('stage_images', filename)


def upload_to_staff_photos(instance, filename):
    return _unguessable_path('staff_photos', filename)


def upload_to_finished_garments(instance, filename):
    return _unguessable_path('finished_garments', filename)


def upload_to_fabrics(instance, filename):
    return _unguessable_path('fabrics', filename)


def national_mobile(raw):
    """The bare ten-digit mobile in `raw`, or '' if there is not one.

    Strips everything that is not a digit, an international 00 prefix, the
    country code when what is left is longer than a national number, and
    leading zeros. Returns exactly NATIONAL_NUMBER_LENGTH digits or nothing.
    This is what the staff and designer serializers store and what
    whatsapp_number prefixes with the country code -- one set of rules with
    two callers, so the number the boutique saves and the number it messages
    can never disagree about who is on the other end.
    """
    digits = re.sub(r'\D', '', raw or '')
    country_code = getattr(settings, 'WHATSAPP_COUNTRY_CODE', '91')
    if digits.startswith('00'):
        digits = digits[2:]
    if len(digits) > NATIONAL_NUMBER_LENGTH and digits.startswith(country_code):
        digits = digits[len(country_code):]
    digits = digits.lstrip('0')
    return digits if len(digits) == NATIONAL_NUMBER_LENGTH else ''


def whatsapp_number(raw):
    digits = re.sub(r'\D', '', raw or '')
    country_code = getattr(settings, 'WHATSAPP_COUNTRY_CODE', '91')
    if digits.startswith('00'):
        digits = digits[2:]

    national = national_mobile(raw)
    if national:
        return country_code + national
    return digits if 11 <= len(digits) <= 15 else ''

class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    mobile_number = models.CharField(max_length=20, unique=True, db_index=True)
    email_address = models.EmailField(max_length=254, blank=True, null=True, db_index=True)
    address = models.TextField(blank=True, null=True)
    city_region = models.CharField(max_length=100, blank=True, null=True)
    source = models.CharField(max_length=50, default="Walk In") # Walk In, Instagram, Referral, etc.
    customer_type = models.CharField(max_length=50, default="Silver", db_index=True) # Silver, Gold, Platinum
    gender = models.CharField(max_length=20, blank=True, default='')
    garment_type = models.CharField(max_length=100, default="Lehenga")
    neckline_style = models.CharField(max_length=100, blank=True, null=True)
    sleeve_style = models.CharField(max_length=100, blank=True, null=True)
    back_style = models.CharField(max_length=100, blank=True, null=True)
    length_preference = models.CharField(max_length=100, blank=True, null=True)
    silhouette = models.CharField(max_length=100, blank=True, null=True)
    embellishments = models.CharField(max_length=100, blank=True, null=True)
    pattern_style = models.CharField(max_length=100, blank=True, null=True)
    occasion = models.CharField(max_length=100, blank=True, null=True)
    custom_requirements = models.TextField(blank=True, null=True)
    
    date_of_birth = models.DateField(blank=True, null=True)
    occupation = models.CharField(max_length=100, blank=True, null=True)
    preferred_communication = models.CharField(max_length=50, default="WhatsApp") # WhatsApp, Call, Email
    notes = models.TextField(blank=True, null=True)
    
    profile_photo = models.ImageField(upload_to=upload_to_customer_profiles, blank=True, null=True,
                                      max_length=IMAGE_PATH_MAX_LENGTH)
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.mobile_number})"

    def save(self, *args, **kwargs):
        if self.mobile_number:
            self.mobile_number = whatsapp_number(self.mobile_number) or self.mobile_number
        super().save(*args, **kwargs)

class Measurement(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name='measurements')
    bust = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    waist = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    hips = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    shoulder = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    arm_length = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    neck = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    length = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    additional_measurements = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Measurements for {self.customer.first_name} {self.customer.last_name}"

    def save(self, *args, **kwargs):
        last_history = MeasurementHistory.objects.filter(customer=self.customer).order_by('-changed_at').first()
        changed = False
        if not last_history:
            changed = True
        else:
            if (last_history.bust != self.bust or
                last_history.waist != self.waist or
                last_history.hips != self.hips or
                last_history.shoulder != self.shoulder or
                last_history.arm_length != self.arm_length or
                last_history.neck != self.neck or
                last_history.length != self.length or
                last_history.additional_measurements != self.additional_measurements):
                changed = True
        
        super().save(*args, **kwargs)
        if changed:
            MeasurementHistory.objects.create(
                customer=self.customer,
                bust=self.bust,
                waist=self.waist,
                hips=self.hips,
                shoulder=self.shoulder,
                arm_length=self.arm_length,
                neck=self.neck,
                length=self.length,
                additional_measurements=self.additional_measurements
            )

class MeasurementHistory(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='measurement_history')
    bust = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    waist = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    hips = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    shoulder = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    arm_length = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    neck = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    length = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    additional_measurements = models.JSONField(default=dict, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Measurement history for {self.customer.first_name} {self.customer.last_name} at {self.changed_at}"

class DesignPreference(models.Model):
    SOURCE_CHOICES = [
        ('BOUTIQUE_CATALOG', 'Boutique Catalog'),
        ('CUSTOM_DESIGN', 'Custom Design'),
        ('PREVIOUS_DESIGN', 'Previous Design'),
        ('PINTEREST', 'Pinterest Inspiration'),
        ('GOOGLE', 'Google Images'),
        ('CUSTOMER_SKETCH', 'Customer Sketch'),
        ('DESIGNER_SKETCH', 'Designer Sketch'),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='design_preferences')
    notes = models.TextField(blank=True, null=True)
    reference_images = models.JSONField(default=list, blank=True)
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES, default='BOUTIQUE_CATALOG', db_index=True)
    reference_links = models.JSONField(default=list, blank=True)
    approved_image = models.CharField(max_length=500, blank=True, null=True)
    is_approved = models.BooleanField(default=False, db_index=True)
    approved_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"Design Prefs for {self.customer.first_name}"

class FabricSelection(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='fabric_selections')
    is_boutique_fabric = models.BooleanField(default=True)
    fabric_name = models.CharField(max_length=150)
    fabric_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    uploaded_fabric_images = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"Fabric ({self.fabric_name}) for {self.customer.first_name}"

class BoutiqueDesign(models.Model):

    name = models.CharField(max_length=150)
    garment_type = models.CharField(max_length=100) # e.g. Lehenga, Gown, Saree, Kurti, Sherwani
    neckline_style = models.CharField(max_length=100, blank=True, null=True) # V-Neck, Sweetheart, etc.
    sleeve_style = models.CharField(max_length=100, blank=True, null=True) # Sleeveless, Full Sleeve, etc.
    image_url = models.CharField(max_length=255)
    is_boutique = models.BooleanField(default=True) # True = Boutique Catalog, False = AI Suggestion Template
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.name} ({self.garment_type}) - {'Boutique' if self.is_boutique else 'AI suggestion'}"

class Tailor(models.Model):
    ROLE_CHOICES = [
        ('Master', 'Master (generalist)'),
        ('Tailor', 'Tailor'),
        ('Maggam Master', 'Maggam Master'),
        ('Karigar', 'Karigar'),
        ('Packaging Staff', 'Packaging Staff'),
        ('QC Staff', 'QC Staff'),
    ]

    name = models.CharField(max_length=100)
    specialty = models.CharField(max_length=100)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=5.00)
    status = models.CharField(max_length=50, default="Available") # Available, Busy
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default="Tailor")
    email = models.EmailField(blank=True, null=True)
    #: The staff member's own avatar, set when they are added and editable by
    #: them from My Account. Surfaced on their login (see auth_views.user_payload)
    #: so the workspace shows their face rather than a placeholder.
    profile_photo = models.ImageField(upload_to=upload_to_staff_photos, blank=True,
                                      null=True, max_length=IMAGE_PATH_MAX_LENGTH)
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tailor_profile')

    def __str__(self):
        return f"{self.name} - {self.role} ({self.status})"

class UserAvatar(models.Model):
    """One avatar per login, for anyone -- owner, staff or designer.

    Avatar is fundamentally a fact about a User (a login has a face), but staff
    photos were first stored on Tailor.profile_photo because that is where the
    owner sets them when adding someone, before that person's User even exists.
    This model is the per-user store the self-edit writes to, so the OWNER --
    who has no Tailor row at all -- can set their own photo too. user_payload
    reads this first and falls back to the Tailor/Designer photo, so a staff
    member's owner-assigned photo still shows until they choose their own.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='avatar')
    image = models.ImageField(upload_to=upload_to_staff_photos,
                              max_length=IMAGE_PATH_MAX_LENGTH)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"avatar for {self.user_id}"


class Order(models.Model):
    order_id = models.CharField(max_length=50, unique=True, db_index=True) # e.g. T2B-240529-7856
    # The number the customer sees: #1, #2, #3 per boutique, minted in
    # OrderService.create_order_for_customer. order_id stays the internal key
    # every lookup, token and cross-app reference uses; this column is display
    # only. Nullable so a row written outside the service still saves.
    order_number = models.PositiveIntegerField(unique=True, null=True, blank=True, db_index=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='orders')
    tailor = models.ForeignKey(Tailor, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    master = models.ForeignKey(Tailor, on_delete=models.SET_NULL, null=True, blank=True, related_name='supervised_orders')
    payment_status = models.CharField(max_length=50, default="Pending", db_index=True) # Pending, Paid
    order_status = models.CharField(max_length=50, default="Received", db_index=True) # Received, Confirmed, Stylist Review, Design & Creation, Quality Check, Ready for Dispatch, Shipped, Delivered
    delivery_method = models.CharField(max_length=50, default="Direct Pickup") # Direct Pickup, Courier
    courier_service = models.CharField(max_length=100, blank=True, null=True)
    tracking_number = models.CharField(max_length=100, blank=True, null=True)
    delivery_address = models.TextField(blank=True, null=True)
    
    base_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    fabric_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    embroidery_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    customization_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    tailoring_charges = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    packaging_handling = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    taxes = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    advance_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    order_date = models.DateTimeField(auto_now_add=True, db_index=True)
    estimated_delivery = models.DateField(blank=True, null=True)
    tailor_comments = models.TextField(blank=True, null=True)
    completed_garment_image = models.ImageField(upload_to=upload_to_completed_garments, blank=True, null=True,
                                                max_length=IMAGE_PATH_MAX_LENGTH)
    master_verification = models.JSONField(default=dict, blank=True)
    
    garment_images_published = models.BooleanField(default=False)
    # Which path through the workroom this order takes. Decided when the order
    # is placed from whether any garment carries hand work; the owner may
    # change it until cutting starts. 'legacy' marks orders placed before the
    # paths split, which keep the single 15-stage line they were created with.
    FLOW_CHOICES = [('stitching', 'Stitching'), ('maggam', 'Maggam'), ('legacy', 'Legacy')]
    flow = models.CharField(max_length=20, choices=FLOW_CHOICES, default='stitching', db_index=True)

    special_instructions = models.TextField(blank=True, default='')
    # The spoken version of special_instructions, when it was dictated: a
    # URL into media storage (see VoiceNoteUploadView). Text stays the record
    # every report reads; this is for the tailor who would rather listen.
    instructions_voice_note = models.URLField(max_length=500, blank=True, default='')
    # Who recorded it and when -- a voice note without a voice behind it is
    # just a file. Stamped by the server from the signed-in user.
    instructions_voice_note_by = models.CharField(max_length=150, blank=True, default='')
    instructions_voice_note_at = models.DateTimeField(null=True, blank=True)
    current_stage_key = models.CharField(max_length=100, default="created", db_index=True)
    production_status = models.CharField(max_length=50, default="NOT_STARTED", db_index=True) # NOT_STARTED, IN_PROGRESS, COMPLETED, PAUSED, SKIPPED
    invoice_template = models.CharField(max_length=50, default="classic", blank=True, null=True)

    def save(self, *args, **kwargs):
        if self._state.adding and (not self.invoice_template or self.invoice_template == 'classic'):
            try:
                settings_obj = BoutiqueSettings.objects.first()
                if settings_obj and settings_obj.invoice_template:
                    self.invoice_template = settings_obj.invoice_template
            except Exception:
                pass
        super().save(*args, **kwargs)

    @property
    def reference(self):
        """What to print for this order wherever a customer might read it."""
        return f"#{self.order_number}" if self.order_number else self.order_id

    def __str__(self):
        return f"Order {self.reference} - {self.customer.first_name} {self.customer.last_name}"

class OrderStage(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='stages')
    stage_key = models.CharField(max_length=100)
    stage_name = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default="NOT_STARTED") # NOT_STARTED, IN_PROGRESS, COMPLETED, SKIPPED
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0) # Total tracking duration in seconds
    assigned_to = models.ForeignKey(
        Tailor, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_stages'
    )
    performed_by = models.ForeignKey(Tailor, on_delete=models.SET_NULL, null=True, blank=True)
    comments = models.TextField(blank=True, null=True)
    # The recording behind `comments` when they were dictated -- same idea as
    # Order.instructions_voice_note. Empty when the note was typed.
    voice_note = models.URLField(max_length=500, blank=True, default='')
    # Who recorded that note and when, stamped by the server. Cleared with it.
    voice_note_by = models.CharField(max_length=150, blank=True, default='')
    voice_note_at = models.DateTimeField(null=True, blank=True)
    # The "seen" tick on a submission: who first opened this stage while it
    # was waiting for verification, and when. Cleared on every new submission,
    # so a resubmitted piece of work gets its own tick. Read by the worker who
    # sent it, the way a message shows it has been read.
    verification_seen_by = models.CharField(max_length=150, blank=True, default='')
    verification_seen_at = models.DateTimeField(null=True, blank=True)
    attachments = models.JSONField(default=list, blank=True) # list of image URLs
    # A supervisor's verdict on individual attachments, keyed by URL:
    # {url: {'status': 'REJECTED', 'remark': ..., 'by': ..., 'at': ...}}.
    # A photo with no entry is simply unreviewed. Cleared with the next
    # submission, like verification_note.
    attachment_reviews = models.JSONField(default=dict, blank=True)
    # Why a supervisor sent submitted work back. Set on rejection, cleared on
    # the next submission, so the worker reads it when they reopen the stage.
    verification_note = models.TextField(blank=True, default='')
    sequence = models.IntegerField(default=0)
    sla_hours = models.IntegerField(default=24)

    class Meta:
        ordering = ['sequence']

    def __str__(self):
        return f"{self.order.order_id} - {self.stage_name} ({self.status})"

class OrderActivity(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='activities')
    event_type = models.CharField(max_length=100) # e.g. STAGE_TRANSITION, ASSIGNMENT, ALTERATION
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True) # e.g., {"old_stage": "...", "new_stage": "...", "comments": "..."}

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.order.order_id} - {self.event_type} at {self.timestamp}"

class OrderStageHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='stage_histories')
    stage = models.CharField(max_length=100)
    comments = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to=upload_to_stage_images, blank=True, null=True,
                              max_length=IMAGE_PATH_MAX_LENGTH)
    completed_by_name = models.CharField(max_length=255, blank=True, null=True)
    completed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.order.order_id} - {self.stage}"

class Notification(models.Model):
    title = models.CharField(max_length=255)
    message = models.TextField()
    recipient_role = models.CharField(max_length=50) # Owner, Master, Tailor, Customer
    recipient_email = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.recipient_role} - {self.title}"

class GarmentImage(models.Model):

    VIEW_CHOICES = [
        ('FRONT', 'Front view'),
        ('BACK', 'Back view'),
        ('LEFT', 'Left side'),
        ('RIGHT', 'Right side'),
        ('DETAIL', 'Close-up detail'),
        ('FABRIC', 'Fabric texture'),
        ('SLEEVE', 'Sleeve detail'),
        ('BLOUSE', 'Blouse detail'),
        ('DUPATTA', 'Dupatta styling'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='garment_images')
    view = models.CharField(max_length=20, choices=VIEW_CHOICES, default='FRONT')
    image = models.ImageField(upload_to=upload_to_finished_garments,
                              max_length=IMAGE_PATH_MAX_LENGTH)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['view', 'uploaded_at']

    def __str__(self):
        return f"{self.order.order_id} - {self.get_view_display()}"


class CustomerMessage(models.Model):

    STATUS_CHOICES = [
        ('QUEUED', 'Queued'),
        ('SENT', 'Sent'),
        ('DELIVERED', 'Delivered'),
        ('READ', 'Read'),
        ('FAILED', 'Failed'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='customer_messages')
    channel = models.CharField(max_length=30, default='whatsapp')
    template_key = models.CharField(max_length=100, db_index=True)
    to_number = models.CharField(max_length=20)
    body = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='QUEUED', db_index=True)
    provider_message_id = models.CharField(max_length=255, blank=True, null=True)
    error = models.TextField(blank=True, null=True)
    sent_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def whatsapp_url(self):
        number = whatsapp_number(self.to_number)
        if not number:
            return ''
        return f"https://wa.me/{number}?text={quote(self.body)}"

    def __str__(self):
        return f"{self.order.order_id} - {self.template_key} ({self.status})"

def get_default_workflow():
    """The workroom's steps, named for the task done at each one.

    A step is a task, and its status says how far along it is (not started, in
    progress, completed). Names that were statuses themselves -- "Stitching
    Completed", "Trial Scheduled" -- read absurdly next to a status, so each is
    the thing being done. Keys are the workflow's identity and never change.
    """
    return [
        {"key": "created", "name": "Order taken", "sla_hours": 12, "roles": ["Owner", "Master"]},
        {"key": "measurements_completed", "name": "Measurements", "sla_hours": 24, "roles": ["Owner", "Master"]},
        {"key": "fabric_confirmed", "name": "Fabric", "sla_hours": 24, "roles": ["Owner", "Master"]},
        # The two paths through the workroom part here. A stage with `flows`
        # is only on the orders of those flows; one without is on every order.
        # Plain stitching: cut, then stitch.
        {"key": "pattern_cutting", "name": "Cutting", "sla_hours": 24, "roles": ["Owner", "Master", "Pattern Master", "Cutting Master"], "flows": ["stitching"]},
        # Maggam: paper pattern for the embroiderer, the work (handed to the
        # maggam master from its own stage panel), the Master's sign-off on
        # it, and only then the fabric is cut.
        {"key": "paper_cutting", "name": "Paper cutting", "sla_hours": 24, "roles": ["Owner", "Master", "Pattern Master", "Cutting Master"], "flows": ["maggam"]},
        {"key": "maggam_work", "name": "Maggam design", "sla_hours": 96, "roles": ["Owner", "Master", "Maggam Master", "Karigar"], "flows": ["maggam"]},
        {"key": "maggam_verification", "name": "Maggam verification", "sla_hours": 12, "roles": ["Owner", "Master"], "flows": ["maggam"]},
        {"key": "fabric_cutting", "name": "Fabric cutting", "sla_hours": 24, "roles": ["Owner", "Master", "Pattern Master", "Cutting Master"], "flows": ["maggam"]},
        {"key": "assigned_to_tailor", "name": "Handover to tailor", "sla_hours": 12, "roles": ["Owner", "Master", "Tailor"]},
        {"key": "stitching_in_progress", "name": "Stitching", "sla_hours": 72, "roles": ["Owner", "Tailor"]},
        {"key": "stitching_completed", "name": "Stitching check", "sla_hours": 12, "roles": ["Owner", "Tailor"]},
        {"key": "finishing", "name": "Hemming & finishing", "sla_hours": 24, "roles": ["Owner", "Master"]},
        {"key": "pressing", "name": "Pressing & packaging", "sla_hours": 12, "roles": ["Owner", "Master", "Packaging Staff"]},
        {"key": "master_quality_check", "name": "Master quality check", "sla_hours": 12, "roles": ["Owner", "Master", "QC Staff"]},
        {"key": "trial_scheduled", "name": "Trial booking", "sla_hours": 48, "roles": ["Owner", "Master"]},
        {"key": "trial_completed", "name": "Trial", "sla_hours": 24, "roles": ["Owner", "Master"]},
        {"key": "ready_for_delivery", "name": "Delivery prep", "sla_hours": 24, "roles": ["Owner", "Master"]},
        {"key": "delivered", "name": "Delivery", "sla_hours": 12, "roles": ["Owner", "Master"]}
    ]

class BoutiqueSettings(models.Model):
    name = models.CharField(max_length=255, blank=True, default="")
    address = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    logo = models.ImageField(upload_to=upload_to_fabrics, blank=True, null=True,
                             max_length=IMAGE_PATH_MAX_LENGTH)
    workflow_config = models.JSONField(default=get_default_workflow, blank=True)
    design_approval_required = models.BooleanField(default=False)
    customer_messaging_enabled = models.BooleanField(default=True)
    invoice_template = models.CharField(max_length=50, default="classic", blank=True)

    #: How the OWNER distributes the modules this boutique is entitled to among
    #: its own roles, as {role: {module_key: true/false}}. The platform console
    #: decides entitlement on BoutiqueTenant.enabled_modules; this decides
    #: distribution, and entitlement wins.
    #:
    #: Sparse, for the same reason enabled_modules is: it stores only the
    #: decisions an owner actually made. An absent key means "whatever
    #: core.modules.ROLE_DEFAULTS says", NOT off -- if absence meant off, the
    #: deploy that adds a module to the registry would switch that module off
    #: for every role in every boutique at once, and nobody would have made
    #: that decision.
    #:
    #: 'Owner' is never stored here. An owner who could switch off their own
    #: Inventory would have no screen left to switch it back on, so the write
    #: path refuses Owner entries and core.modules.role_allows short-circuits
    #: to True for Owner regardless of what is stored.
    role_modules = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class OrderDraft(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='order_drafts')
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='order_drafts')
    payload = models.JSONField(default=dict, blank=True)
    current_step = models.PositiveSmallIntegerField(default=1)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        who = self.customer or self.payload.get('first_name') or 'unnamed'
        return f"Draft for {who} (step {self.current_step})"
