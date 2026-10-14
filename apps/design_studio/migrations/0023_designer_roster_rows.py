"""Give every active designer their roster row now.

The row (role 'Designer', reached through Designer.staff) used to be made on
the designer's first visit to Attendance, so a designer who never opened it
could not be picked for the Design stage. Same rules as
apps.staff.views._designer_attendance_row: a Designer row already carrying
their email is taken back rather than duplicated, otherwise one is made.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    Designer = apps.get_model('design_studio', 'Designer')
    Tailor = apps.get_model('crm_api', 'Tailor')
    for designer in Designer.objects.filter(staff__isnull=True, is_active=True).select_related('user'):
        email = (designer.user.email if designer.user_id else '') or designer.email
        row = (Tailor.objects.filter(email__iexact=email, role='Designer').first()
               if email else None)
        if row is None:
            row = Tailor.objects.create(
                name=designer.name or 'Designer', role='Designer', specialty='Designer',
                email=email or f'designer_{designer.id}@boutique.local')
        designer.staff = row
        designer.save(update_fields=['staff'])


class Migration(migrations.Migration):

    dependencies = [
        ('design_studio', '0022_customerdesign_library_asset'),
        ('crm_api', '0070_designer_on_design_stage'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
