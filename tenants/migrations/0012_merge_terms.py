from django.db import migrations


class Migration(migrations.Migration):
    """Joins the two branches that each recorded terms acceptance at sign-up."""

    dependencies = [
        ('tenants', '0011_boutiquetenant_terms_acceptance'),
        ('tenants', '0011_boutiquetenant_terms_accepted_at'),
    ]

    operations = []
