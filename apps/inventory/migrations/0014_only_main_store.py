from django.db import migrations

# The seven units 0005 seeded beside Main Store. A boutique names its own
# places now (an "Add location" on the shelves tab); the presets only cluttered
# the transfer form. One that already holds stock is kept -- removing it would
# lose where that material sits.
SEEDED = ['Warehouse', 'Workshop', 'Cutting Unit', 'Embroidery Unit',
          'Tailor / Master', 'Finishing Unit', 'Showroom']


def remove_seeded(apps, schema_editor):
    StockLocation = apps.get_model('inventory', 'StockLocation')
    for location in StockLocation.objects.filter(name__in=SEEDED):
        if location.stocks.filter(quantity__gt=0).exists():
            continue
        # A unit named in a past transfer is history (PROTECT on movements):
        # it leaves the pickers but keeps its row.
        if location.movements_in.exists() or location.movements_out.exists():
            location.is_active = False
            location.save(update_fields=['is_active'])
            continue
        location.stocks.all().delete()
        location.delete()


class Migration(migrations.Migration):

    dependencies = [('inventory', '0013_inventoryitem_design_asset')]

    operations = [migrations.RunPython(remove_seeded, migrations.RunPython.noop)]
