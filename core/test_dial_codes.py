"""core/dial_codes.py must list exactly the codes the frontend offers.

The customer directory groups customers by their mobile's country code on the
server, and the browser names each code; if the two lists drift, a country
would be grouped under the wrong code or offered with no customers.
"""

import re
import unittest
from pathlib import Path

from django.test import SimpleTestCase

from core.dial_codes import DIAL_CODES

FRONTEND_CODES = Path(__file__).resolve().parent.parent / 'frontend' / 'src' / 'data' / 'countryCodes.js'


class DialCodesMatchTheFrontendTests(SimpleTestCase):

    @unittest.skipUnless(FRONTEND_CODES.exists(), 'frontend is not checked out alongside the API')
    def test_the_same_codes(self):
        frontend = set(re.findall(r'dial:\s*"(\d+)"', FRONTEND_CODES.read_text(encoding='utf-8')))
        self.assertTrue(frontend)
        self.assertEqual(DIAL_CODES, frontend)
