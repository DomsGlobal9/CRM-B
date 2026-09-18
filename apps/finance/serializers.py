from rest_framework import serializers

from core.validators import MAX_NOTE, validate_amount, validate_text

from .models import Expense


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
