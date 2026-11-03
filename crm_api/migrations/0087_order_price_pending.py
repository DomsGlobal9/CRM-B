from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0086_order_gst'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='price_pending',
            field=models.BooleanField(default=False),
        ),
    ]
