"""The Blouse's order form asks Front and Back Shoulder, Bicep, Elbow Length
and Round, Short and Full Sleeve Length and Round, and Collar Round itself,
rather than folding them under a "+" group."""
from django.db import migrations

from apps.catalog.services import sync_global_templates


def resync(apps, schema_editor):
    sync_global_templates({
        'GarmentTemplate': apps.get_model('catalog', 'GarmentTemplate'),
        'TemplateSection': apps.get_model('catalog', 'TemplateSection'),
        'TemplateField': apps.get_model('catalog', 'TemplateField'),
        'TemplateFieldOption': apps.get_model('catalog', 'TemplateFieldOption'),
    })


class Migration(migrations.Migration):

    dependencies = [('catalog', '0046_resync_trial_required')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
