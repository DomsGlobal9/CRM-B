"""The emails of the access-request flow.

1. send_request_received: to whoever asked (the app's Request access or the
   website's demo form), straight away: "your request is under review".
2. send_team_alert: to the platform team (settings.PLATFORM_ALERT_EMAIL), with
   everything the requester typed, so nobody has to open the console to know.
3. send_boutique_ready: to the new owner when the console approves the
   request, with their sign-in email and temporary password.

Sent synchronously through EmailService, not the Redis job queue: these are
one message each, the caller needs to know whether it went, and the queue can
lose a job silently when Redis is unreachable.

Every value a person typed is HTML-escaped before it is placed in markup.
Styles are inline and there are no external images, because mail clients
strip <style> blocks and block remote images by default.
"""

import logging
from html import escape

from django.conf import settings

from apps.email_service.services import EmailService

logger = logging.getLogger(__name__)

PLATFORM_NAME = 'Scaleezy'

_INK = '#1b1b1f'
_MUTED = '#5b5b66'
_RULE = '#e4e2dc'
_ACCENT = '#0f291e'


def _layout(heading, paragraphs, *, details=None, button=None, after=(), footer=True):
    """One email body: heading, paragraphs, an optional details card and button,
    then any closing paragraphs.

    `paragraphs`, `after` and the values in `details` must already be escaped.
    """
    parts = [
        f'<div style="font-family:Helvetica,Arial,sans-serif;color:{_INK};'
        f'max-width:520px;margin:0 auto;padding:24px 16px;line-height:1.55;font-size:15px">',
        f'<div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;'
        f'color:{_MUTED};margin-bottom:18px">{PLATFORM_NAME}</div>',
        f'<h1 style="font-size:22px;margin:0 0 16px 0;font-weight:600">{heading}</h1>',
    ]
    parts += [f'<p style="margin:0 0 14px 0">{p}</p>' for p in paragraphs]
    if details:
        rows = ''.join(
            f'<div style="margin:0 0 8px 0"><div style="font-size:12px;color:{_MUTED};'
            f'text-transform:uppercase;letter-spacing:.06em">{label}</div>'
            f'<div style="font-size:15px;white-space:pre-wrap">{value}</div></div>'
            for label, value in details)
        parts.append(f'<div style="border:1px solid {_RULE};border-radius:8px;'
                     f'padding:16px 16px 8px 16px;margin:18px 0">{rows}</div>')
    if button:
        label, url = button
        parts.append(
            f'<p style="margin:22px 0"><a href="{escape(url, quote=True)}" '
            f'style="background:{_ACCENT};color:#ffffff;text-decoration:none;'
            f'padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">'
            f'{label}</a></p>')
    parts += [f'<p style="margin:0 0 14px 0">{p}</p>' for p in after]
    if footer:
        parts.append(f'<p style="margin:24px 0 0 0;font-size:13px;color:{_MUTED}">'
                     f'Questions? Reply to this email and our team will get back to you.</p>')
    parts.append('</div>')
    return ''.join(parts)


def _first_name(full_name):
    name = (full_name or '').strip()
    return name.split()[0] if name else 'there'


def send_request_received(lead):
    """"Your request is under review" to the requester. Returns True if it was sent."""
    first = _first_name(lead.name)
    boutique = lead.boutique or 'your boutique'

    if lead.source == 'app':
        subject = f"Welcome to {PLATFORM_NAME} - your request is under review"
        lines = [
            f"Thank you for requesting access to {PLATFORM_NAME} for {boutique}.",
            "Your request is under review. Our team will set up your boutique and "
            "share your login credentials with you at this email address very soon.",
        ]
        html_lines = [
            f"Thank you for requesting access to {PLATFORM_NAME} for "
            f"<strong>{escape(boutique)}</strong>.",
            "Your request is <strong>under review</strong>. Our team will set up your "
            "boutique and share your login credentials with you at this email address "
            "very soon.",
        ]
        heading = f"Welcome to {PLATFORM_NAME}"
    else:
        subject = f"We've received your demo request, {first}"
        lines = [
            f"Thank you for your interest in {PLATFORM_NAME}. We've received your demo "
            f"request for {boutique}.",
            "Our team will review it and get in touch with you shortly to set up a time.",
        ]
        html_lines = [
            f"Thank you for your interest in {PLATFORM_NAME}. We've received your demo "
            f"request for <strong>{escape(boutique)}</strong>.",
            "Our team will review it and get in touch with you shortly to set up a time.",
        ]
        heading = "We've received your request"

    text = (f"Hi {first},\n\n" + "\n\n".join(lines)
            + f"\n\nQuestions? Reply to this email and our team will get back to you."
            f"\n\n- The {PLATFORM_NAME} team")
    html = _layout(heading, [f"Hi {escape(first)},", *html_lines])
    return EmailService.send_email(subject=subject, recipient_list=[lead.email],
                                   body=text, html_message=html)


def team_recipients():
    raw = getattr(settings, 'PLATFORM_ALERT_EMAIL', '') or ''
    return [address.strip() for address in raw.split(',') if address.strip()]


def send_team_alert(lead):
    """Tell the platform team a request arrived, with all of its details.

    Returns True if it was sent, False if it failed or there is nobody to tell.
    """
    recipients = team_recipients()
    if not recipients:
        return False

    kind = 'access request' if lead.source == 'app' else 'demo request'
    fields = [
        ('Name', lead.name),
        ('Boutique', lead.boutique),
        ('Email', lead.email),
        ('Mobile', lead.phone),
        ('Address', lead.address),
        ('What they make', lead.makes),
        ('Orders per month', lead.orders_per_month),
        ('People', lead.people),
        ('What they said', lead.problem),
        ('Terms & Conditions', 'Accepted' if lead.terms_accepted_at else ''),
        ('Received', f'{lead.created_at:%d %b %Y, %H:%M} UTC' if lead.created_at else ''),
    ]
    fields = [(label, value) for label, value in fields if value]
    console = f"{settings.PORTAL_BASE_URL.rstrip('/')}/superadmin"

    subject = f"New {kind}: {lead.boutique or lead.name}"
    text = (f"A new {kind} has arrived on {PLATFORM_NAME}.\n\n"
            + "\n".join(f"{label}: {value}" for label, value in fields)
            + f"\n\nReview it in the platform console: {console}\n")
    html = _layout(
        f"New {kind}",
        [f"A new {kind} has arrived on {PLATFORM_NAME}. "
         f"Review it and, for an access request, approve it to send the owner their login credentials."],
        details=[(escape(label), escape(str(value))) for label, value in fields],
        button=('Open the console', console),
        footer=False,
    )
    return EmailService.send_email(subject=subject, recipient_list=recipients,
                                   body=text, html_message=html)


def login_url(tenant=None):
    """Where a new owner signs in: their boutique's own address when it has one."""
    if tenant is not None and getattr(tenant, 'shop_slug', None):
        return f"{settings.PORTAL_BASE_URL.rstrip('/')}/{tenant.shop_slug}"
    return getattr(settings, 'APP_LOGIN_URL', '') or settings.PASSWORD_RESET_BASE_URL


def send_boutique_ready(*, email, first_name, boutique_name, temporary_password, url):
    """Credentials email for a newly approved boutique. Returns True if it was sent."""
    first = first_name or 'there'

    subject = f"Your {PLATFORM_NAME} login for {boutique_name} is ready"
    text = (
        f"Hi {first},\n\n"
        f"Good news: your request has been approved and {boutique_name} is set up on "
        f"{PLATFORM_NAME}. Sign in with:\n\n"
        f"  Email:              {email}\n"
        f"  Temporary password: {temporary_password}\n\n"
        f"Sign in here: {url}\n\n"
        f"When you first sign in you'll be asked to choose your own password. "
        f"The temporary password stops working once you've changed it.\n\n"
        f"Keep this email private: anyone with this password can sign in as you "
        f"until you change it.\n\n"
        f"Questions? Reply to this email and our team will get back to you.\n\n"
        f"- The {PLATFORM_NAME} team"
    )
    html = _layout(
        'Your boutique is ready',
        [
            f"Hi {escape(first)},",
            f"Good news: your request has been approved and "
            f"<strong>{escape(boutique_name)}</strong> is set up on {PLATFORM_NAME}. "
            f"Sign in with these details:",
        ],
        details=[('Email', escape(email)),
                 ('Temporary password', f'<span style="font-family:Menlo,Consolas,monospace;'
                                        f'font-size:16px">{escape(temporary_password)}</span>')],
        button=('Sign in', url),
        after=["When you first sign in you'll be asked to choose your own password. "
               "The temporary password stops working once you've changed it. "
               "Keep this email private until then."],
    )
    return EmailService.send_email(subject=subject, recipient_list=[email],
                                   body=text, html_message=html)
