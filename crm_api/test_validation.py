"""Junk stops at the door, with a sentence; good values land canonical.

One test per rule crm_api applies through core.validators: the customer
book, the order wizard's confirm, order PATCH, the stage endpoints, the
boutique profile and sign-up.
"""

import io
from datetime import date, timedelta

from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import BoutiqueSettings, Customer, Order, OrderStage


def jpeg(name='work.jpg', size=0):
    # Real bytes: the validator opens the file with Pillow, not just the header.
    buffer = io.BytesIO()
    Image.new('RGB', (2, 2)).save(buffer, 'JPEG')
    content = buffer.getvalue()
    return SimpleUploadedFile(name, content.ljust(size, b'\0'), content_type='image/jpeg')


def svg_as_jpeg(name='evil.jpg'):
    return SimpleUploadedFile(name, b'<svg xmlns="http://www.w3.org/2000/svg"/>', content_type='image/jpeg')


class ValidationTestBase(TenantTestCase):
    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@validation.test'
        tenant.name = 'Validation Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        from django.db import connection
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@validation.test', email='owner@validation.test',
            password='ownerpass123')
        token = Token.objects.create(user=self.owner)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}',
                             HTTP_X_TENANT_ID=self.tenant.schema_name)
        BoutiqueSettings.objects.get_or_create(id=1)

    def error_of(self, response):
        self.assertEqual(response.status_code, 400, response.data)
        data = response.json()
        if 'error' in data:
            return data['error']
        # A serializer refusal: {field: [sentence]}.
        return ' '.join(v[0] if isinstance(v, list) else str(v) for v in data.values())


class CustomerBookTests(ValidationTestBase):
    def post_customer(self, **overrides):
        body = {'first_name': 'Meera', 'last_name': 'Nair', 'mobile_number': '9876543210'}
        body.update(overrides)
        return self.api.post(reverse('customer-list'), body, format='json')

    def test_eleven_digits_is_refused_with_the_sentence(self):
        self.assertIn('10-digit', self.error_of(self.post_customer(mobile_number='98765432101')))

    def test_a_spaced_number_is_stored_canonical(self):
        response = self.post_customer(mobile_number='+91 98765 43210')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.get().mobile_number, '919876543210')

    def test_a_digits_only_name_is_refused(self):
        self.assertIn('letters', self.error_of(self.post_customer(first_name='12345')))

    def test_an_indic_name_and_a_bracketed_one_are_accepted(self):
        # Vowel signs and virama are Mn/Mc, not letters: a regex on \w refused these.
        for first, last in (('प्रिया', 'शर्मा'), ('ಲಕ್ಷ್ಮಿ', 'ಅಮ್ಮ'), ('Lakshmi (Amma)', 'M/s Sharma & Sons')):
            response = self.post_customer(first_name=first, last_name=last, mobile_number='9876543219')
            self.assertEqual(response.status_code, 201, response.data)
            Customer.objects.all().delete()

    def test_a_number_where_a_string_was_expected_is_a_400_not_a_500(self):
        self.assertIn('10-digit', self.error_of(self.post_customer(mobile_number=98765)))
        self.assertEqual(self.post_customer(mobile_number=9876543210).status_code, 201)
        self.assertEqual(Customer.objects.get().mobile_number, '919876543210')

    def test_an_international_number_typed_with_plus_is_kept(self):
        response = self.post_customer(mobile_number='+44 7911 123456')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.get().mobile_number, '447911123456')
        self.assertIn('international', self.error_of(self.post_customer(mobile_number='+44 12')))

    def test_editing_a_row_without_touching_its_number_never_fails_on_the_number(self):
        legacy = Customer.objects.create(first_name='Old', last_name='Row', mobile_number='12345')
        response = self.api.patch(reverse('customer-detail', args=[legacy.id]),
                                  {'mobile_number': '12345', 'city_region': 'Mysore'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        legacy.refresh_from_db()
        self.assertEqual((legacy.mobile_number, legacy.city_region), ('12345', 'Mysore'))

    def test_a_one_letter_last_name_is_an_initial(self):
        response = self.post_customer(last_name='S')
        self.assertEqual(response.status_code, 201, response.data)

    def test_last_name_may_be_blank(self):
        self.assertEqual(self.post_customer(last_name='').status_code, 201)

    def test_email_is_normalised_or_refused(self):
        self.assertIn('valid email', self.error_of(self.post_customer(email_address='not-an-email')))
        response = self.post_customer(email_address='  Meera@Example.com ')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.get().email_address, 'meera@example.com')

    def test_choices_are_the_wizard_options(self):
        # A legacy tier ('Women') edits through as Silver rather than blocking the save.
        response = self.post_customer(customer_type='Women')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.get().customer_type, 'Silver')
        self.assertEqual(self.post_customer(customer_type='Gold', mobile_number='9876543211').data['customer_type'], 'Gold')
        self.assertIn('Female, Male or Other', self.error_of(self.post_customer(gender='Femail')))
        self.assertIn('Walk In', self.error_of(self.post_customer(source='TikTok')))

    def test_notes_have_an_end(self):
        self.assertIn('2000', self.error_of(self.post_customer(notes='n' * 2001)))
        self.assertIn('500', self.error_of(self.post_customer(address='a' * 501)))

    def test_measurements_are_inches_on_a_person(self):
        self.assertEqual(self.post_customer(measurements={'bust': '-4'}).status_code, 400)
        self.assertEqual(self.post_customer(measurements={'waist': '121'}).status_code, 400)
        self.assertEqual(self.post_customer(measurements={'waist': 'abc'}).status_code, 400)
        self.assertEqual(self.post_customer(measurements={'bust': '36.5'}).status_code, 201)

    def test_design_preferences_and_fabric_uploads_are_checked(self):
        customer = Customer.objects.create(first_name='Meera', last_name='Nair', mobile_number='919876543210')
        prefs = reverse('customer-save-design-preferences', args=[customer.id])
        self.assertIn('image', self.error_of(self.api.post(prefs, {'images': [svg_as_jpeg()]}, format='multipart')))
        self.assertIn('2000', self.error_of(self.api.post(prefs, {'notes': 'n' * 2001}, format='multipart')))
        self.assertEqual(self.api.post(prefs, {'images': [jpeg()]}, format='multipart').status_code, 201)
        fabrics = reverse('customer-save-fabric-selection', args=[customer.id])
        self.assertIn('image', self.error_of(self.api.post(fabrics, {'images': [svg_as_jpeg()]}, format='multipart')))
        self.assertIn('negative', self.error_of(self.api.post(fabrics, {'fabric_price': '-5'}, format='multipart')))
        self.assertIn('150', self.error_of(self.api.post(fabrics, {'fabric_name': 'f' * 151}, format='multipart')))
        response = self.api.post(fabrics, {'fabric_name': ' Kanchi silk ', 'fabric_price': '1200'}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(customer.fabric_selections.get().fabric_name, 'Kanchi silk')


class DraftConfirmTests(ValidationTestBase):
    def setUp(self):
        super().setUp()
        from apps.catalog.models import GarmentTemplate
        self.template = GarmentTemplate.objects.get(key='blouse')

    def confirm(self, **overrides):
        payload = {
            'first_name': 'Lakshmi', 'last_name': 'Iyer', 'mobile_number': '9845012345',
            'prices': {'base': 5000}, 'payment': {'option': 'partial', 'advance': 1000},
            'garments': [{'template': str(self.template.id), 'spec': {'blouse_type': 'princess'}}],
        }
        payload.update(overrides)
        created = self.api.post(reverse('order-draft-list'),
                                {'payload': payload, 'current_step': 6}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        return self.api.post(reverse('order-draft-confirm', args=[created.data['id']]))

    def test_a_junk_mobile_never_becomes_a_customer(self):
        self.assertIn('10-digit', self.error_of(self.confirm(mobile_number='12345678901234')))
        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(Order.objects.count(), 0)

    def test_a_junk_name_or_email_is_refused(self):
        self.assertIn('First name', self.error_of(self.confirm(first_name='L')))
        self.assertIn('valid email', self.error_of(self.confirm(email_address='nope')))

    def test_a_good_draft_lands_canonical(self):
        response = self.confirm(mobile_number='098450 12345', email_address='Lakshmi@X.com ')
        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get()
        self.assertEqual(customer.mobile_number, '919845012345')
        self.assertEqual(customer.email_address, 'lakshmi@x.com')

    def test_a_known_client_typed_afresh_is_not_re_validated_into_a_duplicate(self):
        Customer.objects.create(first_name='Lakshmi', last_name='Iyer', mobile_number='919845012345')
        self.assertEqual(self.confirm(mobile_number='9845012345').status_code, 201)
        self.assertEqual(Customer.objects.count(), 1)

    def test_measurements_on_the_draft_are_bounded(self):
        self.assertIn('120', self.error_of(self.confirm(measurements={'bust': '500'})))

    def test_ready_by_cannot_be_in_the_past(self):
        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
        self.assertIn('past', self.error_of(self.confirm(ready_by=yesterday)))
        self.assertIn('date', self.error_of(self.confirm(ready_by='next tuesday')))

    def test_advance_is_a_non_negative_amount(self):
        self.assertIn('negative', self.error_of(self.confirm(payment={'option': 'partial', 'advance': -5})))
        self.assertIn('number', self.error_of(self.confirm(payment={'option': 'partial', 'advance': 'abc'})))

    def test_tailor_notes_have_an_end(self):
        self.assertIn('2000', self.error_of(self.confirm(special_instructions='n' * 2001)))


class OrderPatchTests(ValidationTestBase):
    def setUp(self):
        super().setUp()
        customer = Customer.objects.create(first_name='Jane', last_name='Doe', mobile_number='9876543210')
        self.order = Order.objects.create(order_id='T2B-V1', customer=customer,
                                          base_price=5000, total_amount=5000)

    def patch(self, **body):
        return self.api.patch(reverse('order-detail', args=[self.order.id]), body, format='json')

    def test_money_is_never_negative_or_absurd(self):
        self.assertIn('negative', self.error_of(self.patch(base_price='-1')))
        self.assertIn('more than', self.error_of(self.patch(discount='99999999')))
        self.assertEqual(self.patch(tailoring_charges='250.50').status_code, 200)

    def test_free_text_has_an_end(self):
        self.assertEqual(self.patch(delivery_address='a' * 501).status_code, 400)
        self.assertEqual(self.patch(tracking_number='t' * 101).status_code, 400)
        self.assertEqual(self.patch(tailor_comments='c' * 2001).status_code, 400)


class StageEndpointTests(ValidationTestBase):
    def setUp(self):
        super().setUp()
        customer = Customer.objects.create(first_name='Jane', last_name='Doe', mobile_number='9876543210')
        self.order = Order.objects.create(order_id='T2B-V2', customer=customer, total_amount=5000)
        self.stage = OrderStage.objects.create(
            order=self.order, stage_key='stitching_in_progress', stage_name='Stitching',
            status='NOT_STARTED', sequence=3)

    def test_transition_refuses_a_non_image_and_too_many_photos(self):
        url = reverse('order-transition-stage', args=[self.order.id])
        response = self.api.post(url, {
            'stage_key': 'stitching_in_progress', 'status': 'IN_PROGRESS',
            'images': [SimpleUploadedFile('x.exe', b'MZ', content_type='application/octet-stream')],
        }, format='multipart')
        self.assertIn('image', self.error_of(response))
        response = self.api.post(url, {
            'stage_key': 'stitching_in_progress', 'status': 'IN_PROGRESS',
            'images': [jpeg(f'{i}.jpg') for i in range(6)],
        }, format='multipart')
        self.assertIn('at most 5', self.error_of(response))
        self.stage.refresh_from_db()
        self.assertEqual(self.stage.status, 'NOT_STARTED', 'nothing moved on a refusal')

    def test_stage_comments_have_an_end(self):
        response = self.api.post(reverse('order-transition-stage', args=[self.order.id]), {
            'stage_key': 'stitching_in_progress', 'status': 'IN_PROGRESS', 'comments': 'c' * 2001,
        }, format='json')
        self.assertIn('2000', self.error_of(response))

    def test_reasons_and_remarks_have_an_end(self):
        response = self.api.post(reverse('order-reopen-stage', args=[self.order.id]),
                                 {'stage_key': 'stitching_in_progress', 'reason': 'r' * 501},
                                 format='json')
        self.assertIn('500', self.error_of(response))
        response = self.api.post(reverse('order-fail-qc', args=[self.order.id]),
                                 {'reason': 'r' * 501}, format='json')
        self.assertIn('500', self.error_of(response))
        self.stage.attachments = ['http://x/a.jpg']
        self.stage.save()
        response = self.api.post(reverse('order-review-photo', args=[self.order.id]), {
            'stage_key': 'stitching_in_progress', 'url': 'http://x/a.jpg', 'remark': 'r' * 501,
        }, format='json')
        self.assertIn('500', self.error_of(response))

    def test_completion_photos_are_images_of_a_sane_size(self):
        response = self.api.patch(reverse('order-submit-completion', args=[self.order.id]), {
            'completed_garment_images': [jpeg(size=9 * 1024 * 1024)],
        }, format='multipart')
        self.assertIn('8 MB', self.error_of(response))

    def test_a_garment_photo_is_an_image(self):
        response = self.api.post(reverse('order-upload-garment-image', args=[self.order.id]), {
            'view': 'FRONT', 'image': SimpleUploadedFile('a.txt', b'hi', content_type='text/plain'),
        }, format='multipart')
        self.assertIn('image', self.error_of(response))
        # The content type is the client's word; the bytes are checked.
        response = self.api.post(reverse('order-upload-garment-image', args=[self.order.id]), {
            'view': 'FRONT', 'image': svg_as_jpeg(),
        }, format='multipart')
        self.assertIn('image', self.error_of(response))


class BoutiqueProfileTests(ValidationTestBase):
    def post_settings(self, **body):
        return self.api.post(reverse('boutique-settings-list'), body, format='multipart')

    def test_the_phone_is_a_store_line_kept_as_typed(self):
        # A landline with an STD code, as printed on the invoice; not the mobile rule.
        self.assertIn('phone number', self.error_of(self.post_settings(phone='98765 43210 ext 4')))
        self.assertIn('phone number', self.error_of(self.post_settings(phone='12345')))
        response = self.post_settings(phone=' 080-2345 6789 ')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(BoutiqueSettings.objects.get(id=1).phone, '080-2345 6789')

    def test_email_name_and_address_are_checked(self):
        self.assertIn('valid email', self.error_of(self.post_settings(email='owner@')))
        self.assertIn('255', self.error_of(self.post_settings(name='n' * 256)))
        self.assertIn('500', self.error_of(self.post_settings(address='a' * 501)))

    def test_the_logo_is_an_image(self):
        response = self.post_settings(
            logo=SimpleUploadedFile('logo.pdf', b'%PDF', content_type='application/pdf'))
        self.assertIn('image', self.error_of(response))


class DesignLibraryTests(ValidationTestBase):
    def test_a_design_needs_a_web_address_and_a_non_negative_price(self):
        url = reverse('boutique-design-list')
        body = {'name': 'Peplum', 'garment_type': 'Blouse'}
        self.assertIn('http', self.error_of(self.api.post(
            url, {**body, 'image_url': 'javascript:alert(1)'}, format='json')))
        self.assertIn('http', self.error_of(self.api.post(
            url, {**body, 'image_url': 'http://x/a b.jpg'}, format='json')))
        # A legacy catalogue row holds a bare filename; that is not a scheme.
        response = self.api.post(url, {**body, 'image_url': 'fabric_02.jpg'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn('negative', self.error_of(self.api.post(
            url, {**body, 'price': '-10'}, format='json')))

    def test_the_upload_is_an_image(self):
        response = self.api.post(reverse('boutique-design-upload-image'), {
            'image': SimpleUploadedFile('a.txt', b'hi', content_type='text/plain'),
        }, format='multipart')
        self.assertIn('image', self.error_of(response))


class SignupTests(ValidationTestBase):
    def signup(self, **overrides):
        body = {'first_name': 'Rohan', 'last_name': 'Verma', 'email_address': 'rohan@signup.test',
                'mobile_number': '9876500000', 'password': 'rohanpassword123'}
        body.update(overrides)
        client = APIClient()  # public schema: no tenant header
        return client.post(reverse('auth-signup'), body, format='json')

    def test_junk_is_refused_before_anything_is_provisioned(self):
        self.assertIn('10-digit', self.error_of(self.signup(mobile_number='98765000001')))
        self.assertIn('letters', self.error_of(self.signup(first_name='R0han')))
        self.assertIn('valid email', self.error_of(self.signup(email_address='rohan@')))
        self.assertIn('100', self.error_of(self.signup(business_name='b' * 101)))
        self.assertIn('8 characters', self.error_of(self.signup(password='short1')))
        self.assertFalse(User.objects.filter(username='rohan@signup.test').exists())
