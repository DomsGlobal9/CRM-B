"""An order's invoice as a PDF, for sending on WhatsApp.

The same figures and the same terms as the invoice the app prints
(frontend/src/components/invoice/InvoiceTemplates.jsx, normalizeInvoiceData):
the priced garments, subtotal = total - taxes + discount, the balance is total
minus what is paid. Built with fpdf2 (free, LGPL) and its core Helvetica font,
which is Latin-1 only -- so money reads "Rs." and a character outside Latin-1
(a name written in Devanagari, say) prints as "?".
shortcut: core font only; embed a Unicode TTF if customers' names in other scripts must print.
"""

from decimal import Decimal

from django.utils import timezone
from fpdf import FPDF

TERMS = ('Terms: the advance is adjusted against the final bill and the balance is due at delivery. '
         'Please check the garment at pickup; alterations after 7 days may be charged. '
         'Garments not collected within 30 days of the ready date may attract a storage charge.')

PRICE_FIELDS = ('base_price', 'fabric_price', 'embroidery_price', 'customization_price', 'tailoring_charges')


def _text(value):
    return str(value or '').encode('latin-1', 'replace').decode('latin-1')


def _money(value):
    return f"Rs. {Decimal(value or 0):,.2f}"


def _date(value):
    if not value:
        return ''
    if hasattr(value, 'hour'):
        value = timezone.localtime(value) if timezone.is_aware(value) else value
    return value.strftime('%d %b %Y')


def invoice_filename(order):
    return f"Invoice-{order.reference.lstrip('#')}.pdf"


def build_invoice_pdf(order, boutique):
    """The PDF's bytes. `boutique` is the BoutiqueSettings row."""
    customer = order.customer
    jobs = [job for job in order.garment_jobs.select_related('template').order_by('sequence', 'created_at')
            if sum(Decimal(getattr(job, f) or 0) for f in PRICE_FIELDS) > 0]
    total = Decimal(order.total_amount or 0)
    taxes = Decimal(order.taxes or 0)
    discount = Decimal(order.discount or 0)
    paid = Decimal(order.amount_paid or order.advance_paid or 0)
    subtotal = max(Decimal(0), total - taxes + discount)
    balance = max(Decimal(0), total - paid)

    pdf = FPDF(format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_margins(15, 15, 15)

    # The boutique, and the invoice's own details on the right.
    pdf.set_font('Helvetica', 'B', 18)
    pdf.cell(110, 9, _text(boutique.name or 'Boutique'))
    pdf.set_font('Helvetica', 'B', 20)
    pdf.cell(0, 9, 'INVOICE', align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 9)
    top = pdf.get_y()
    pdf.multi_cell(110, 4.5, _text('\n'.join(filter(None, [
        boutique.address, ' | '.join(filter(None, [boutique.phone, boutique.email]))]))))
    left_end = pdf.get_y()
    pdf.set_xy(125, top)
    pdf.multi_cell(0, 4.5, _text('\n'.join(filter(None, [
        f"Invoice no: {order.reference}",
        f"Date: {_date(order.order_date)}",
        f"Delivery: {_date(order.estimated_delivery)}" if order.estimated_delivery else '',
    ]))), align='R')
    pdf.set_y(max(left_end, pdf.get_y()) + 6)

    # Bill to.
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(0, 6, 'BILL TO', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 10)
    name = f"{customer.first_name} {customer.last_name}".strip() if customer else ''
    pdf.multi_cell(0, 5, _text('\n'.join(filter(None, [
        name, customer.mobile_number if customer else '', customer.email_address if customer else '',
        order.delivery_address or (customer.address if customer else ''),
    ]))))
    pdf.ln(4)

    # The garments.
    widths = (12, 118, 20, 30)
    pdf.set_fill_color(240, 240, 235)
    pdf.set_font('Helvetica', 'B', 10)
    for width, head, align in zip(widths, ('#', 'Item', 'Qty', 'Amount'), ('L', 'L', 'C', 'R')):
        pdf.cell(width, 8, head, border='B', align=align, fill=True)
    pdf.ln()
    pdf.set_font('Helvetica', '', 10)
    rows = [(job.display_name, sum(Decimal(getattr(job, f) or 0) for f in PRICE_FIELDS)) for job in jobs]
    for i, (item, amount) in enumerate(rows or [('Garment work', subtotal)], start=1):
        pdf.cell(widths[0], 8, str(i))
        pdf.cell(widths[1], 8, _text(item)[:70])
        pdf.cell(widths[2], 8, '1', align='C')
        pdf.cell(widths[3], 8, _money(amount), align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(3)

    # Totals, right-aligned.
    def line(label, value, bold=False):
        pdf.set_font('Helvetica', 'B' if bold else '', 10)
        pdf.cell(130, 6.5, label, align='R')
        pdf.cell(50, 6.5, value, align='R', new_x='LMARGIN', new_y='NEXT')

    line('Subtotal', _money(subtotal))  # packaging is inside it, as on the printed invoice
    if discount > 0:
        line('Discount', f"- {_money(discount)}")
    if taxes > 0:
        line('GST', _money(taxes))
    line('Total', _money(total), bold=True)
    line('Paid', _money(paid))
    line('Balance due', _money(balance), bold=True)
    line('Payment status', _text(order.payment_status or ('Paid' if balance == 0 else 'Pending')))

    pdf.ln(6)
    pdf.set_font('Helvetica', '', 8)
    pdf.multi_cell(0, 4, TERMS)
    pdf.ln(2)
    pdf.set_font('Helvetica', 'I', 8)
    pdf.cell(0, 4, 'Thank you for choosing us. (Scaleezy)', align='C')
    return bytes(pdf.output())
