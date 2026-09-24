"""Outgoing mail defaults the individual send paths do not have to repeat."""

from django.conf import settings
from django.core.mail.backends.console import EmailBackend as ConsoleEmailBackend
from django.core.mail.backends.smtp import EmailBackend


def apply_reply_to(messages, reply_to):
    """Give every message without its own Reply-To the platform's address."""
    if not reply_to:
        return messages
    for message in messages:
        if not message.reply_to:
            message.reply_to = [reply_to]
    return messages


class ReplyToSMTPBackend(EmailBackend):
    """Django's SMTP backend, adding settings.EMAIL_REPLY_TO.

    One place instead of every EmailService, order-email and password-reset
    call site: a send path added later gets the Reply-To without knowing
    about it.
    """

    def send_messages(self, email_messages):
        apply_reply_to(email_messages or [], getattr(settings, 'EMAIL_REPLY_TO', ''))
        return super().send_messages(email_messages)


class ReplyToConsoleBackend(ConsoleEmailBackend):
    """The console backend used when EMAIL_HOST is unset, with the same
    Reply-To, so what a developer sees printed is what production sends."""

    def send_messages(self, email_messages):
        apply_reply_to(email_messages or [], getattr(settings, 'EMAIL_REPLY_TO', ''))
        return super().send_messages(email_messages)
