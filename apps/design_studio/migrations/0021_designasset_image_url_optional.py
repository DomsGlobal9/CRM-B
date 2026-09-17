from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('design_studio', '0020_customerdesign'),
    ]

    operations = [
        migrations.AlterField(
            model_name='designasset',
            name='image_url',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
    ]
