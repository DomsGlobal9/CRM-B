"""Work On (hand work) no longer lists Hand beside Sleeve: the same place.
Design photos keep their Hand area; an order that ticked Hand reads as Sleeve
(core.templates RETIRED_CHOICES / RETIRED_FIELDS)."""
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

    dependencies = [('catalog', '0044_resync_fabric_source_label')]

    operations = [migrations.RunPython(resync, migrations.RunPython.noop)]
