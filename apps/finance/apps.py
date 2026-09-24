from django.apps import AppConfig


class FinanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.finance'
    label = 'finance'
    verbose_name = 'Cost & P&L'

    def ready(self):
        from . import signals  # noqa: F401 - connects the payment-ledger bridge
