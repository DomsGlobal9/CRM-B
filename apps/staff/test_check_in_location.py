"""Check-in location: recorded and flagged, never a reason to refuse a check-in."""
from decimal import Decimal

from django.urls import reverse

from apps.staff.attendance import distance_m
from apps.staff.models import AttendanceSession
from apps.staff.tests import AttendanceTestCase
from crm_api.models import BoutiqueSettings

SHOP = (Decimal('13.082700'), Decimal('80.270700'))


class CheckInLocationTests(AttendanceTestCase):

    def check_in(self, body):
        response = self.client_for(self.anita_user).post(
            reverse('staff-attendance-check-in'), body, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response, AttendanceSession.objects.get()

    def pin_shop(self, radius=150):
        BoutiqueSettings.objects.update_or_create(id=1, defaults={
            'shop_latitude': SHOP[0], 'shop_longitude': SHOP[1], 'shop_radius_m': radius})

    def test_distance_is_metres(self):
        # 0.01 degrees of latitude is ~1112 m anywhere on Earth.
        self.assertAlmostEqual(distance_m(13.0827, 80.2707, 13.0927, 80.2707), 1112, delta=2)
        self.assertEqual(distance_m(*SHOP, *SHOP), 0)

    def test_inside_the_radius_is_not_flagged(self):
        self.pin_shop()
        response, session = self.check_in(
            {'location': {'latitude': 13.0830, 'longitude': 80.2707, 'accuracy': 25}})
        self.assertFalse(session.check_in_outside_shop)
        self.assertAlmostEqual(session.check_in_distance_m, 33, delta=2)
        self.assertEqual(session.check_in_accuracy_m, 25)
        self.assertEqual(response.data['check_in_outside_shop'], False)

    def test_outside_the_radius_is_flagged_but_still_checked_in(self):
        self.pin_shop()
        _, session = self.check_in({'location': {'latitude': 13.0927, 'longitude': 80.2707}})
        self.assertTrue(session.check_in_outside_shop)
        self.assertGreater(session.check_in_distance_m, 1000)
        self.assertTrue(session.is_open)

    def test_no_location_still_checks_in_and_is_not_flagged(self):
        self.pin_shop()
        _, session = self.check_in({})
        self.assertIsNone(session.check_in_latitude)
        self.assertIsNone(session.check_in_outside_shop)

    def test_a_malformed_location_is_dropped_not_refused(self):
        self.pin_shop()
        for bad in ({'latitude': 999, 'longitude': 80}, {'latitude': 'x', 'longitude': 1},
                    {'latitude': 'NaN', 'longitude': 1}, {'longitude': 80}, 'here'):
            AttendanceSession.objects.all().delete()
            _, session = self.check_in({'location': bad})
            self.assertIsNone(session.check_in_latitude, bad)
            self.assertIsNone(session.check_in_outside_shop, bad)

    def test_without_a_shop_pin_the_position_is_kept_but_nothing_is_flagged(self):
        _, session = self.check_in({'location': {'latitude': 13.0927, 'longitude': 80.2707}})
        self.assertEqual(session.check_in_latitude, Decimal('13.092700'))
        self.assertIsNone(session.check_in_distance_m)
        self.assertIsNone(session.check_in_outside_shop)

    def test_raw_coordinates_are_not_in_the_api(self):
        self.pin_shop()
        response, _ = self.check_in({'location': {'latitude': 13.0830, 'longitude': 80.2707}})
        self.assertNotIn('check_in_latitude', response.data)
        self.assertNotIn('check_in_longitude', response.data)


class ShopLocationSettingTests(AttendanceTestCase):
    url = reverse('boutique-settings-list')

    def test_the_owner_pins_and_clears_the_shop(self):
        client = self.client_for(self.owner)
        response = client.post(self.url, {'shop_latitude': '13.0827', 'shop_longitude': '80.2707',
                                          'shop_radius_m': '200'})
        self.assertEqual(response.status_code, 200, response.data)
        config = BoutiqueSettings.objects.get(id=1)
        self.assertEqual((config.shop_latitude, config.shop_radius_m), (SHOP[0], 200))

        client.post(self.url, {'shop_latitude': '', 'shop_longitude': ''})
        self.assertIsNone(BoutiqueSettings.objects.get(id=1).shop_latitude)

    def test_nonsense_is_refused(self):
        client = self.client_for(self.owner)
        for body in ({'shop_latitude': '91', 'shop_longitude': '0'},
                     {'shop_latitude': 'abc', 'shop_longitude': '0'},
                     {'shop_latitude': 'NaN', 'shop_longitude': '0'},
                     {'shop_radius_m': '5'}):
            self.assertEqual(client.post(self.url, body).status_code, 400, body)

    def test_staff_cannot_move_the_pin(self):
        response = self.client_for(self.anita_user).post(
            self.url, {'shop_latitude': '0', 'shop_longitude': '0'})
        self.assertEqual(response.status_code, 403)
