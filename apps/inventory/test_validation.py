"""What the store room refuses at the door, and what it tidies on the way in."""

from decimal import Decimal

from django.urls import reverse

from .models import Category, InventoryItem, PurchaseOrder, Supplier, Unit
from .tests import InventoryTestBase


def _error_text(response):
    data = response.data
    if isinstance(data, dict):
        return ' '.join(str(v) for values in data.values() for v in (
            values if isinstance(values, list) else [values]))
    return ' '.join(str(v) for v in data)


class SupplierValidationTests(InventoryTestBase):
    def _post(self, **overrides):
        payload = {'name': 'Mysore Silks'}
        payload.update(overrides)
        return self.client.post(reverse('supplier-list'), payload, format='json')

    def test_a_phone_with_letters_or_too_few_digits_is_refused(self):
        for phone in ('080 2345 ext 4', '12345'):
            response = self._post(phone=phone)
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('Enter a phone number', _error_text(response))
        self.assertEqual(self._post(phone='9' * 31).status_code, 400)

    def test_a_phone_is_a_store_line_kept_as_typed(self):
        # A supplier's office line is often a landline with an STD code.
        response = self._post(phone=' 080-2345 6789 ', email='  Sales@Mysore.TEST ')
        self.assertEqual(response.status_code, 201, response.data)
        supplier = Supplier.objects.get(name='Mysore Silks')
        self.assertEqual(supplier.phone, '080-2345 6789')
        self.assertEqual(supplier.email, 'sales@mysore.test')

    def test_gstin_is_shaped_and_upper_cased(self):
        refused = self._post(gst_number='GST123')
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn('Enter a 15-character GSTIN like 22AAAAA0000A1Z5.', _error_text(refused))
        accepted = self._post(gst_number='29abcde1234f1z5')
        self.assertEqual(accepted.status_code, 201, accepted.data)
        self.assertEqual(Supplier.objects.get(name='Mysore Silks').gst_number,
                         '29ABCDE1234F1Z5')


class InventoryItemValidationTests(InventoryTestBase):
    def _post(self, **overrides):
        payload = {'item_code': 'FAB-VAL', 'name': 'Raw Silk', 'category': Category.FABRIC,
                   'unit': Unit.METER, 'supplier': str(self.supplier.id)}
        payload.update(overrides)
        return self.client.post(reverse('inventory-item-list'), payload, format='json')

    def test_hsn_code_must_be_four_six_or_eight_digits(self):
        response = self._post(hsn_code='507')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Enter a 4, 6 or 8-digit HSN code.', _error_text(response))
        accepted = self._post(hsn_code='5007 10')
        self.assertEqual(accepted.status_code, 201, accepted.data)
        self.assertEqual(InventoryItem.objects.get(item_code='FAB-VAL').hsn_code, '500710')

    def test_prices_cannot_be_negative_or_absurd(self):
        negative = self._post(purchase_price='-5')
        self.assertEqual(negative.status_code, 400, negative.data)
        self.assertIn('Purchase price cannot be negative.', _error_text(negative))
        absurd = self._post(selling_price='99999999')
        self.assertEqual(absurd.status_code, 400, absurd.data)
        self.assertIn('Selling price cannot be more than 10,000,000.', _error_text(absurd))

    def test_reorder_level_cannot_be_negative(self):
        response = self._post(reorder_level='-1')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Reorder level cannot be negative.', _error_text(response))

    def test_an_item_with_no_code_is_given_one(self):
        # The quick stock sheet asks for a name and three numbers, nothing more.
        first = self._post(item_code='', name='Loose thread', category=Category.OTHER, unit=Unit.UNIT)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['item_code'], 'ITM-0001')
        second = self._post(item_code='', name='Another', category=Category.OTHER, unit=Unit.UNIT)
        self.assertEqual(second.data['item_code'], 'ITM-0002')

    def test_a_blank_name_is_refused(self):
        response = self._post(name='   ')
        self.assertEqual(response.status_code, 400, response.data)


class PurchaseOrderValidationTests(InventoryTestBase):
    def test_a_line_needs_a_positive_quantity(self):
        item = self.make_item()
        response = self.client.post(reverse('purchase-order-list'), {
            'po_number': 'PO-VAL-1', 'supplier': str(self.supplier.id),
            'lines': [{'item': str(item.id), 'quantity_ordered': '0', 'unit_cost': '100'}],
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Quantity ordered must be more than zero.', str(response.data))
        self.assertFalse(PurchaseOrder.objects.exists())

    def test_notes_have_an_end(self):
        response = self.client.post(reverse('purchase-order-list'), {
            'po_number': 'PO-VAL-2', 'supplier': str(self.supplier.id),
            'notes': 'n' * 2001,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Notes is limited to 2000 characters.', _error_text(response))


class StockMovementRemarkTests(InventoryTestBase):
    def test_a_remark_has_an_end(self):
        item = self.make_item()
        response = self.client.post(
            reverse('inventory-item-stock-in', args=[item.id]),
            {'quantity': '5', 'remarks': 'r' * 2001}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Remarks is limited to 2000 characters.', _error_text(response))
        item.refresh_from_db()
        self.assertEqual(item.current_stock, Decimal('0'))
