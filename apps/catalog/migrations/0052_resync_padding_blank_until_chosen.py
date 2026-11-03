"""The Blouse's Padding opens blank, not on Padded: it is asked at the end of
the order, with the price, and nothing says Padded before it has been chosen."""
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

    dependencies = [('catalog', '0051_resync_lehenga_length_and_hip')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
