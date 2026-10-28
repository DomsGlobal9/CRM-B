"""Two new roles: Hemming & Pressing Staff, and Logistics Staff.

Hemming & Pressing Staff do the two short finishing stages after stitching.
Every boutique's saved workflow gains the role on 'finishing' (Hemming &
finishing) and 'pressing' (Pressing & packaging), so someone in it sees those
stages in their queue and may be assigned to them. A boutique that removed one
of those stages keeps it removed; the role is added only where the stage is.

Logistics Staff bring stock and finished products from the warehouse to the
shop. They hold no workflow stage, so nothing in workflow_config changes for
them; core.modules gives them their default access.
"""

from django.db import migrations, models

HEMMING = 'Hemming & Pressing Staff'
LOGISTICS = 'Logistics Staff'
STAGES = ('finishing', 'pressing')


def forwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            if stage.get('key') in STAGES:
                roles = list(stage.get('roles') or [])
                if HEMMING not in roles:
                    stage['roles'] = roles + [HEMMING]
                    changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


def backwards(apps, schema_editor):
    BoutiqueSettings = apps.get_model('crm_api', 'BoutiqueSettings')
    Tailor = apps.get_model('crm_api', 'Tailor')
    # Nobody may hold a role the model no longer offers. Pressing & packaging
    # is the nearest stage-holding job for both.
    Tailor.objects.filter(role__in=[HEMMING, LOGISTICS]).update(role='Packaging Staff')
    for settings in BoutiqueSettings.objects.all():
        config = [dict(s) for s in (settings.workflow_config or []) if isinstance(s, dict)]
        changed = False
        for stage in config:
            roles = stage.get('roles') or []
            if HEMMING in roles:
                stage['roles'] = [r for r in roles if r != HEMMING]
                changed = True
        if changed:
            settings.workflow_config = config
            settings.save(update_fields=['workflow_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0079_order_instructions_voice_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tailor',
            name='role',
            field=models.CharField(
                choices=[('Master', 'Master (generalist)'), ('Tailor', 'Tailor'),
                         ('Maggam Master', 'Maggam Master'), ('Karigar', 'Karigar'),
                         ('Maggam Karigar', 'Maggam Karigar'),
                         ('Hemming & Pressing Staff', 'Hemming & Pressing Staff'),
                         ('Packaging Staff', 'Packaging Staff'), ('QC Staff', 'QC Staff'),
                         ('Logistics Staff', 'Logistics Staff')],
                default='Tailor', max_length=50),
        ),
        migrations.RunPython(forwards, backwards),
    ]
