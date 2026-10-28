"""Production tasks for the plain-stitching cutting step read "Pattern
cutting", the step's name again (crm_api 0081). Only titles still equal to
the old default "Cutting" change."""

from django.db import migrations


def forwards(apps, schema_editor):
    ProductionTask = apps.get_model('production', 'ProductionTask')
    ProductionTask.objects.filter(stage_key='pattern_cutting', title='Cutting').update(title='Pattern cutting')


def backwards(apps, schema_editor):
    ProductionTask = apps.get_model('production', 'ProductionTask')
    ProductionTask.objects.filter(stage_key='pattern_cutting', title='Pattern cutting').update(title='Cutting')


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0002_garment_stages'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
