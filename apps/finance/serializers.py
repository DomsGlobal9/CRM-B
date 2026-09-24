from rest_framework import serializers

from core.validators import MAX_NOTE, validate_amount, validate_text

from .models import Expense, Payment


class ExpenseSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display',
                                             read_only=True)
    receipt_url = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            'id', 'category', 'category_display', 'amount', 'incurred_on',
            'paid_to', 'note', 'receipt', 'receipt_url', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'receipt': {'write_only': True, 'required': False}}

    def get_receipt_url(self, instance):
        if not instance.receipt:
            return ''
        request = self.context.get('request')
        url = instance.receipt.url
        return request.build_absolute_uri(url) if request is not None else url

    def validate_amount(self, value):
        # A zero-rupee cost is a typo, not an expense; the model's check
        # constraint stops negatives, this stops the meaningless zero. The
        # shared rule adds the ceiling: no boutique pays a crore in rent.
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return validate_amount(value, label='Amount', allow_zero=False)

    def validate_paid_to(self, value):
        return validate_text(value, label='Paid to', max_length=150)

    def validate_note(self, value):
        return validate_text(value, label='Note', max_length=MAX_NOTE)


class PaymentSerializer(serializers.ModelSerializer):
    order_reference = serializers.CharField(source='order.reference', read_only=True)
    customer_name = serializers.SerializerMethodField()
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'order', 'order_reference', 'customer_name', 'amount',
            'received_on', 'method', 'method_display', 'source', 'reference',
            'note', 'created_at',
        ]
        read_only_fields = ['id', 'source', 'created_at']

    def get_customer_name(self, instance):
        customer = instance.order.customer if instance.order_id else None
        return f"{customer.first_name} {customer.last_name}".strip() if customer else ''

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return validate_amount(value, label='Amount', allow_zero=False)

    def validate_received_on(self, value):
        from django.utils import timezone
        if value and value > timezone.localdate():
            raise serializers.ValidationError('A payment cannot be dated in the future.')
        return value

    def validate(self, attrs):
        """Never take more than the order is owed.

        The order's own screens clamp the snapshot to the total; the ledger
        has to clamp itself, or a typo here would make the two disagree in a
        way nothing could reconcile.
        """
        from decimal import Decimal
        from . import payments

        order = attrs.get('order')
        amount = attrs.get('amount') or Decimal('0')
        if order is not None:
            owed = Decimal(order.total_amount or 0) - payments.ledger_total(order)
            if amount > owed:
                raise serializers.ValidationError(
                    {'amount': f'That is more than the {owed} still owed on this order.'})
        return attrs

    def validate_note(self, value):
        return validate_text(value, label='Note', max_length=MAX_NOTE)
