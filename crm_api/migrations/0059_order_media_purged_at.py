from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0058_split_stages_per_garment'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='media_purged_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
