from django.apps import AppConfig


class DailySummaryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.daily_summary'
    label = 'daily_summary'
    verbose_name = 'Daily summary'
