"""One payment row per order that had already been paid something.

Dated the ORDER's own date, not today: it is the only date the old snapshot
carries any information about, and dating a year of historical takings to the
day of the deploy would put every rupee the boutique ever collected into one
month of the new reports. It is an approximation and says so -- source=BACKFILL
marks every row written here, so a report can tell derived history from money
that was actually dated when it arrived.

Reversible: the reverse drops exactly the rows this wrote and nothing else.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Order = apps.get_model('crm_api', 'Order')
    Payment = apps.get_model('finance', 'Payment')

    rows = []
    for order_id, paid, ordered_at in Order.objects.filter(
            amount_paid__gt=0).values_list('id', 'amount_paid', 'order_date'):
        rows.append(Payment(
            order_id=order_id,
            amount=paid,
            received_on=ordered_at.date(),
            source='BACKFILL',
            note='Recorded before payments carried their own date.',
        ))
    Payment.objects.bulk_create(rows, batch_size=500)


def unbackfill(apps, schema_editor):
    apps.get_model('finance', 'Payment').objects.filter(source='BACKFILL').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0002_payment'),
        ('crm_api', '0001_initial'),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
