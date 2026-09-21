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

    dependencies = [('catalog', '0033_merge_0028_order_purchase_0032_resync_pattern_details')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
