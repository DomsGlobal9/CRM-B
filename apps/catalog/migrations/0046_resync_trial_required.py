"""Trial Required is now a question every garment must answer, Yes or No: a
garment answered No gets no trial steps in its workflow
(domains.orders.services.ensure_garment_stages)."""
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

    dependencies = [('catalog', '0045_resync_work_on_without_hand')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
