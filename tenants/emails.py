"""The two emails of the access-request flow.

1. send_request_received: to whoever asked for access (website demo form or
   the app's Request access screen), straight away.
2. send_boutique_ready: to the new owner when the console approves the
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


def _layout(heading, paragraphs, *, details=None, button=None, after=()):
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
            f'<div style="font-size:16px;font-family:Menlo,Consolas,monospace">{value}</div></div>'
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
    parts.append(f'<p style="margin:24px 0 0 0;font-size:13px;color:{_MUTED}">'
                 f'Questions? Reply to this email and our team will get back to you.</p>')
    parts.append('</div>')
    return ''.join(parts)


def _first_name(full_name):
    name = (full_name or '').strip()
    return name.split()[0] if name else 'there'


def send_request_received(lead):
    """Welcome email for a new access request. Returns True if it was sent."""
    first = _first_name(lead.name)
    boutique = lead.boutique or 'your boutique'

    subject = f"We've received your request, {first}"
    text = (
        f"Hi {first},\n\n"
        f"Thank you for your interest in {PLATFORM_NAME}. We've received your request "
        f"for {boutique}.\n\n"
        f"Our team will review it and get in touch with you shortly. Once your "
        f"boutique is set up, we'll send your sign-in details to this email address.\n\n"
        f"Questions? Reply to this email and our team will get back to you.\n\n"
        f"- The {PLATFORM_NAME} team"
    )
    html = _layout(
        f"We've received your request",
        [
            f"Hi {escape(first)},",
            f"Thank you for your interest in {PLATFORM_NAME}. We've received your request "
            f"for <strong>{escape(boutique)}</strong>.",
            "Our team will review it and get in touch with you shortly. Once your "
            "boutique is set up, we'll send your sign-in details to this email address.",
        ],
    )
    return EmailService.send_email(subject=subject, recipient_list=[lead.email],
                                   body=text, html_message=html)


def login_url():
    return getattr(settings, 'APP_LOGIN_URL', '') or settings.PASSWORD_RESET_BASE_URL


def send_boutique_ready(*, email, first_name, boutique_name, temporary_password):
    """Credentials email for a newly approved boutique. Returns True if it was sent."""
    first = first_name or 'there'
    url = login_url()

    subject = f"Your {PLATFORM_NAME} account for {boutique_name} is ready"
    text = (
        f"Hi {first},\n\n"
        f"Your boutique {boutique_name} is set up on {PLATFORM_NAME}. Sign in with:\n\n"
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
            f"<strong>{escape(boutique_name)}</strong> is set up on {PLATFORM_NAME}. "
            f"Sign in with these details:",
        ],
        details=[('Email', escape(email)),
                 ('Temporary password', escape(temporary_password))],
        button=('Sign in', url),
        after=["When you first sign in you'll be asked to choose your own password. "
               "The temporary password stops working once you've changed it. "
               "Keep this email private until then."],
    )
    return EmailService.send_email(subject=subject, recipient_list=[email],
                                   body=text, html_message=html)
