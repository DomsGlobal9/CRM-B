"""GST on an order is the boutique's to enter -- a percentage or an amount,
none by default. Orders placed before this were all charged 5%, so those with
GST on them say 5%: their invoices read as they always did."""
from django.db import migrations, models


def mark_old_orders(apps, schema_editor):
    Order = apps.get_model('crm_api', 'Order')
    Order.objects.filter(taxes__gt=0).update(gst_mode='percent', gst_value=5)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0085_remove_todos'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='gst_mode',
            field=models.CharField(default='percent', max_length=10),
        ),
        migrations.AddField(
            model_name='order',
            name='gst_value',
            field=models.DecimalField(decimal_places=2, default=0.0, max_digits=10),
        ),
        migrations.RunPython(mark_old_orders, migrations.RunPython.noop),
    ]
