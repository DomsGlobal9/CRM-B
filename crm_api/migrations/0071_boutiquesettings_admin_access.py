from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0070_designer_on_design_stage'),
    ]

    operations = [
        migrations.AddField(
            model_name='boutiquesettings',
            name='admin_access',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
