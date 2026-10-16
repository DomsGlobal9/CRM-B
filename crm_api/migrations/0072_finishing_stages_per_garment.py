"""Trial, Delivery prep and Delivery go per garment.

A finished saree goes to its trial and can be handed over while the blouse on
the same order is still being stitched, so Trial booking, Trial, Delivery prep
and Delivery get `scope: garment` like the workroom stages (0058). Every order
with garment jobs has its single rows of those stages split into one per
garment, each copy carrying what the single row said. Orders with no garment
jobs are left as they are.
"""

from django.db import migrations

from crm_api.migrations import _split_stage_rows

GARMENT_SCOPED = ('trial_scheduled', 'trial_completed', 'ready_for_delivery', 'delivered')


def forwards(apps, schema_editor):
    _split_stage_rows.split(apps, GARMENT_SCOPED)


def backwards(apps, schema_editor):
    """Fold each garment's rows of these stages back to one: the least-finished row wins."""
    _split_stage_rows.fold(apps, GARMENT_SCOPED)


class Migration(migrations.Migration):

    dependencies = [
        ('crm_api', '0071_boutiquesettings_admin_access'),
        ('production', '0002_garment_stages'),
        ('catalog', '0043_garmentjob_label'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
