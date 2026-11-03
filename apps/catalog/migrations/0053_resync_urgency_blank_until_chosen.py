"""Urgency opens blank, not on Normal: it is asked at the end of the order,
with the price, and nothing says Normal before it has been chosen. A blank
Urgency is a normal order, as Normal was."""
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

    dependencies = [('catalog', '0052_resync_padding_blank_until_chosen')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
