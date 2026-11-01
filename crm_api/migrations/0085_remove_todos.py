"""The To-do feature is removed (it was switched off for every role on
2026-10-24 and is now taken out of the product).

In every boutique: the to-do tables go -- with every saved to-do, its notes
and photos, and the older daily-update tables from before it -- the
notifications it sent go, and any switch an owner had stored for it (the To-do
module per role, the "Assign tasks to the team" task) is taken off, so those
settings still save. The to-do app's own migration records go with its tables.
Not reversible: the data is deleted.
"""
from django.db import migrations

TODO_TABLES = ('todos_dailyupdatephoto', 'todos_dailyupdate',
               'todos_todophoto', 'todos_todoupdate', 'todos_todo')


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Notification = apps.get_model('crm_api', 'Notification')

    for settings in BoutiqueSettings.objects.all():
        fields = []
        role_modules = settings.role_modules if isinstance(settings.role_modules, dict) else None
        if role_modules and any(isinstance(m, dict) and 'todos' in m for m in role_modules.values()):
            settings.role_modules = {
                role: ({k: v for k, v in modules.items() if k != 'todos'}
                       if isinstance(modules, dict) else modules)
                for role, modules in role_modules.items()}
            fields.append('role_modules')
        access = settings.admin_access if isinstance(settings.admin_access, dict) else None
        roles = access.get('roles') if access else None
        if isinstance(roles, dict) and any(isinstance(t, list) and 'team.todos' in t for t in roles.values()):
            settings.admin_access = {**access, 'roles': {
                role: ([t for t in tasks if t != 'team.todos'] if isinstance(tasks, list) else tasks)
                for role, tasks in roles.items()}}
            fields.append('admin_access')
        if fields:
            settings.save(update_fields=fields)

    Notification.objects.filter(title__startswith='New to-do:').delete()
    Notification.objects.filter(title__startswith='To-do closed:').delete()

    with schema_editor.connection.cursor() as cursor:
        for table in TODO_TABLES:
            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
        cursor.execute("DELETE FROM django_migrations WHERE app = 'todos'")


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0084_stagepart'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
