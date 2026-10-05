from django.db import migrations, models
from django_tenants.utils import get_public_schema_name

from tenants.slugs import make_shop_slug


def backfill_shop_slugs(apps, schema_editor):
    """Give every boutique that predates this column its portal path.

    BoutiqueTenant is a SHARED_APPS model, so this runs once against the public
    schema. The guard is there for the case where a tenant migration reaches
    this file anyway -- the registry table does not exist inside a tenant
    schema, and backfilling from there would write nothing or raise.

    Ordered by pk so a re-run assigns the same slugs in the same order, and
    skipping rows that already have one so a slug corrected by hand is never
    overwritten.
    """
    if schema_editor.connection.schema_name != get_public_schema_name():
        return

    BoutiqueTenant = apps.get_model('tenants', 'BoutiqueTenant')
    taken = set(
        BoutiqueTenant.objects
        .exclude(shop_slug=None)
        .values_list('shop_slug', flat=True)
    )

    for tenant in (BoutiqueTenant.objects
                   .exclude(schema_name=get_public_schema_name())
                   .filter(shop_slug=None)
                   .order_by('pk')):
        slug = make_shop_slug(tenant.name, taken, fallback=tenant.schema_name)
        tenant.shop_slug = slug
        tenant.save(update_fields=['shop_slug'])
        taken.add(slug)


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0008_boutiquetenant_plan'),
    ]

    operations = [
        migrations.AddField(
            model_name='boutiquetenant',
            name='shop_slug',
            # Nullable so the column can be added to a populated table before
            # the backfill runs, and so a boutique may legitimately have no
            # portal path of its own. Postgres allows many NULLs under a unique
            # index, which is what makes that state possible at all.
            field=models.SlugField(
                blank=True, max_length=63, null=True, unique=True,
                help_text="The boutique's portal path, e.g. 'saralaboutique' for "
                          "boutique.scaleezy.com/saralaboutique. An alias only -- the "
                          "tenant a request acts on is still decided by its token."),
        ),
        migrations.RunPython(backfill_shop_slugs, migrations.RunPython.noop),
    ]
