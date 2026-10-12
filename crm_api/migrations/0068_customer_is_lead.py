from django.db import migrations, models


def mark_portal_leads(apps, schema_editor):
    # Portal sign-ups nobody has taken an order for yet are the existing leads.
    Customer = apps.get_model('crm_api', 'Customer')
    Customer.objects.filter(source='Website', orders__isnull=True).update(is_lead=True)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0067_designpreference_reference_parts'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='is_lead',
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.RunPython(mark_portal_leads, migrations.RunPython.noop),
    ]
