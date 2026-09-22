import io

from django.contrib.auth.models import User
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from crm_api.models import BoutiqueSettings, Customer, Measurement
from domains.customers.services import MAX_ROWS


def sheet(headers, rows, name='customers.xlsx'):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = name
    return buf


class CustomerImportTests(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@import.test'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        BoutiqueSettings.objects.get_or_create(id=1, defaults={'name': 'Import Atelier', 'phone': '9876500011'})
        self.owner = User.objects.create_user(username='owner@import.test', email='owner@import.test', password='x')
        self.client = APIClient(HTTP_X_TENANT_ID=self.tenant.schema_name)
        self.client.force_authenticate(self.owner)

    def post(self, upload, commit=False):
        data = {'file': upload}
        if commit:
            data['commit'] = '1'
        response = self.client.post('/api/customers/import/', data, format='multipart')
        connection.set_tenant(self.tenant)  # the middleware resets the schema after each request
        return response

    def test_preview_validates_without_saving_then_commit_saves_valid_rows_only(self):
        headers = ['first_name', 'last_name', 'phone number', 'gender', 'address', 'bust', 'blouse_length']
        rows = [
            ['Apurva', 'deshpande', 7498838862, 'female', 'himayatnagar', 36, 15],
            ['deepthi', 'reddy UK', 447982909334, 'female', 'united kingdom', None, None],  # no '+'
            ['', 'nobody', 9000000001, 'female', '', None, None],  # no first name
        ]
        preview = self.post(sheet(headers, rows)).json()
        self.assertEqual([v['name'] for v in preview['valid']], ['Apurva deshpande'])
        self.assertEqual([e['row'] for e in preview['errors']], [3, 4])
        self.assertIn('mobile_number', preview['errors'][0]['error'])
        self.assertEqual(Customer.objects.count(), 0)

        done = self.post(sheet(headers, rows), commit=True).json()
        self.assertEqual((done['created'], done['updated']), (1, 0))
        c = Customer.objects.get(mobile_number='917498838862')
        self.assertEqual((c.first_name, c.gender, c.address), ('Apurva', 'Female', 'himayatnagar'))
        self.assertEqual(float(c.measurements.bust), 36)
        self.assertEqual(c.measurements.additional_measurements, {'blouse_length': 15})

    def test_existing_customer_is_filled_in_never_overwritten(self):
        c = Customer.objects.create(first_name='Priya', last_name='Sharma', mobile_number='919876543210',
                                    city_region='Bengaluru')
        Measurement.objects.create(customer=c, waist=30)
        headers = ['mobile', 'first_name', 'last_name', 'city', 'address', 'waist', 'hips']
        rows = [
            ['+91 98765 43210', 'Priyanka', 'Sharma', 'Mumbai', 'MG Road', 31, 39],
            ['9876543210', 'Priya', 'Sharma', '', '', None, 40],  # duplicate mobile, merges
        ]
        done = self.post(sheet(headers, rows), commit=True).json()
        self.assertEqual((done['created'], done['updated']), (0, 1))
        self.assertEqual(done['valid'][0]['rows'], [2, 3])
        c.refresh_from_db()
        self.assertEqual((c.first_name, c.city_region, c.address), ('Priya', 'Bengaluru', 'MG Road'))
        self.assertIn('Also known as: Priyanka Sharma', c.notes)
        m = Measurement.objects.get(customer=c)
        self.assertEqual((float(m.waist), float(m.hips)), (30, 39))

    def test_row_cap_and_missing_columns(self):
        too_many = sheet(['mobile', 'first_name'], [[9000000000 + i, 'A'] for i in range(MAX_ROWS + 1)])
        self.assertIn(str(MAX_ROWS), self.post(too_many).json()['error'])
        self.assertIn('first_name', self.post(sheet(['mobile', 'name'], [[9000000000, 'A']])).json()['error'])
        self.assertIn('mobile', self.post(sheet(['first_name'], [['A']])).json()['error'])

    def test_master_may_import_but_a_tailor_may_not(self):
        from crm_api.models import Tailor
        for role, expected in (('Tailor', 403), ('Master', 200)):
            user = User.objects.create_user(username=f'{role}@import.test', email=f'{role}@import.test', password='x')
            Tailor.objects.create(name=role, specialty='Lehenga', role=role, user=user)
            self.client.force_authenticate(user)
            response = self.post(sheet(['mobile', 'first_name'], [[9000000000, 'A']]))
            self.assertEqual(response.status_code, expected, role)
