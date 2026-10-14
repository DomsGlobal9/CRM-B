from django.apps import AppConfig


class TodosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.todos'
    label = 'todos'
    verbose_name = 'To-do'

    def ready(self):
        from . import signals  # noqa: F401 -- to-dos follow their order step
