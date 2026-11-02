from django.apps import AppConfig


class DailyUpdatesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.daily_updates'
    label = 'daily_updates'
    verbose_name = 'Daily updates (To-do)'
