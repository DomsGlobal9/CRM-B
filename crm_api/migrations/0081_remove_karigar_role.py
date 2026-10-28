"""Remove the plain 'Karigar' role. 'Maggam Karigar' stays.

The two roles did the same handwork on the maggam path, so the boutique keeps
one. Everything that named 'Karigar' moves to 'Maggam Karigar':

  * Staff holding the role keep their job under the remaining name, so their
    queue, notifications and KPIs carry on.
  * Saved workflows drop 'Karigar' from every stage. Both maggam stages
    already list 'Maggam Karigar', and it is added wherever a stage named
    'Karigar' without it, so no stage loses its handwork role.
  * Open to-dos assigned to the role move with it.
  * An owner's per-role module settings for 'Karigar' are dropped. They are
    not copied onto 'Maggam Karigar': that role's own settings, or its
    defaults, are what its people already had.

Historical snapshots (performance reviews, notifications already sent) keep
the role they were written against, on purpose.
"""

from django.db import migrations, models

OLD = 'Karigar'
NEW = 'Maggam Karigar'


def forwards(apps, schema_editor):
    Tailor = apps.get_model('crm_api', 'Tailor')
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Todo = apps.get_model('todos', 'Todo')

    Tailor.objects.filter(role=OLD).update(role=NEW)
    Todo.objects.filter(assigned_to_role=OLD).update(assigned_to_role=NEW)

    for settings in BoutiqueSettings.objects.all():
        fields = []
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            roles = list(stage.get('roles') or [])
            if OLD in roles:
                roles = [r for r in roles if r != OLD]
                if NEW not in roles:
                    roles.append(NEW)
                stage['roles'] = roles
                changed = True
        if changed:
            settings.workflow_config = config
            fields.append('workflow_config')
        role_modules = settings.role_modules
        if isinstance(role_modules, dict) and OLD in role_modules:
            settings.role_modules = {k: v for k, v in role_modules.items() if k != OLD}
            fields.append('role_modules')
        if fields:
            settings.save(update_fields=fields)


def backwards(apps, schema_editor):
    # Who used to be a plain Karigar is not recorded, so staff stay Maggam
    # Karigar. The role comes back on the two maggam stages it held.
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            if stage.get('key') in ('maggam_work', 'maggam_handwork'):
                roles = list(stage.get('roles') or [])
                if OLD not in roles:
                    stage['roles'] = roles + [OLD]
                    changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0080_hemming_pressing_and_logistics_roles'),
        ('todos', '0005_todo_location'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tailor',
            name='role',
            field=models.CharField(
                choices=[('Master', 'Master (generalist)'), ('Tailor', 'Tailor'),
                         ('Maggam Master', 'Maggam Master'),
                         ('Maggam Karigar', 'Maggam Karigar'),
                         ('Hemming & Pressing Staff', 'Hemming & Pressing Staff'),
                         ('Packaging Staff', 'Packaging Staff'), ('QC Staff', 'QC Staff'),
                         ('Logistics Staff', 'Logistics Staff')],
                default='Tailor', max_length=50),
        ),
        migrations.RunPython(forwards, backwards),
    ]
