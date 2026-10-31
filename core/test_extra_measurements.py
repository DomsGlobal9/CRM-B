"""Measurements added by hand at the counter ("Add other measurement"):
clean_extra_measurements in core/templates.py."""
from django.test import SimpleTestCase

from core.templates import EXTRA_MEASUREMENTS_MAX, clean_extra_measurements


class CleanExtraMeasurementsTests(SimpleTestCase):

    def test_named_values_are_kept_and_blank_rows_dropped(self):
        rows, error = clean_extra_measurements([
            {'label': ' Bicep round ', 'value': '11.5'},
            {'label': '', 'value': ''},
        ])
        self.assertIsNone(error)
        self.assertEqual(rows, [{'label': 'Bicep round', 'value': '11.5'}])

    def test_nothing_added_is_nothing(self):
        self.assertEqual(clean_extra_measurements(None), ([], None))
        self.assertEqual(clean_extra_measurements([]), ([], None))

    def test_a_value_needs_a_name_and_a_name_a_value(self):
        self.assertEqual(clean_extra_measurements([{'label': '', 'value': '9'}])[1],
                         'Give each extra measurement a name.')
        self.assertEqual(clean_extra_measurements([{'label': 'Knee', 'value': ''}])[1],
                         'Enter a value for Knee.')

    def test_the_value_is_a_sensible_number_of_inches(self):
        for bad in ('abc', '0', '-2', '1200', 'NaN'):
            rows, error = clean_extra_measurements([{'label': 'Knee', 'value': bad}])
            self.assertEqual(rows, [])
            self.assertTrue(error.startswith('Knee'), (bad, error))

    def test_not_a_list_is_refused(self):
        self.assertIsNotNone(clean_extra_measurements({'label': 'Knee'})[1])
        self.assertIsNotNone(clean_extra_measurements(['Knee 11'])[1])

    def test_there_is_a_limit(self):
        rows = [{'label': f'Extra {i}', 'value': '10'} for i in range(EXTRA_MEASUREMENTS_MAX + 1)]
        self.assertIsNotNone(clean_extra_measurements(rows)[1])
