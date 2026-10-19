"""Payment goes per garment too.

Each garment is handed over after its own Payment step, so a finished saree
can be paid for and taken home while the blouse is still being made. The
money itself -- the bill, amount paid, Paid/Partial -- stays on the order, so
there is still one invoice; the step only says "collected for this one".
Same split as 0072, for the Payment rows.
"""

from django.db import migrations

from crm_api.migrations import _split_stage_rows

KEYS = ('payment',)


def forwards(apps, schema_editor):
    _split_stage_rows.split(apps, KEYS)


def backwards(apps, schema_editor):
    _split_stage_rows.fold(apps, KEYS)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0072_finishing_stages_per_garment'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
