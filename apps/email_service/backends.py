"""EMAIL_BACKEND: delivers through EMAIL_DELIVERY_BACKEND and logs each recipient.

A backend rather than a call in EmailService because not every email goes through
EmailService (domains/orders/emails.py sends its own). Every Django email ends up
here, so a new sender cannot forget to be logged.
"""
from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend


class LoggingEmailBackend(BaseEmailBackend):

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.delivery = get_connection(settings.EMAIL_DELIVERY_BACKEND,
                                       fail_silently=fail_silently, **kwargs)

    def open(self):
        return self.delivery.open()

    def close(self):
        return self.delivery.close()

    def send_messages(self, email_messages):
        # One at a time: a backend answers only how many went, and the log needs
        # to know which.
        sent = 0
        for message in email_messages or []:
            try:
                accepted = self.delivery.send_messages([message]) or 0
            except Exception as exc:
                _record(message, 'failed', str(exc))
                raise
            _record(message, 'sent' if accepted else 'failed',
                    '' if accepted else 'The mail server did not accept it.')
            sent += accepted
        return sent


def _record(message, status, error):
    from superadmin import outbound
    outbound.record('email', message.recipients(), status, subject=message.subject, error=error)
