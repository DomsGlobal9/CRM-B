from django.utils import timezone
from rest_framework import serializers

from core.validators import MAX_NOTE, validate_not_past, validate_text
from crm_api.serializers import CustomerSerializer, TailorSerializer

from .models import Appointment


class NewCustomerSerializer(serializers.Serializer):
    """The three things the counter needs to book for somebody not on file.

    Validated by CustomerSerializer rather than here: the mobile is the
    boutique's unique key for a person and its spelling rules (10 national
    digits, or a full international number) live in one place. This only names
    the subset the booking form asks for.
    """
    first_name = serializers.CharField()
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    mobile_number = serializers.CharField()
    gender = serializers.CharField(required=False, allow_blank=True, default='')


class AppointmentSerializer(serializers.ModelSerializer):
    customer_detail = CustomerSerializer(source='customer', read_only=True)
    assigned_staff_detail = TailorSerializer(source='assigned_staff', read_only=True)
    #: Booking for somebody not in the book yet. Either this or `customer`.
    new_customer = NewCustomerSerializer(write_only=True, required=False)

    class Meta:
        model = Appointment
        fields = '__all__'
        extra_kwargs = {'customer': {'required': False}}

    def validate(self, attrs):
        """Exactly one of `customer` and `new_customer`, on a new booking.

        An edit is left alone: whose appointment this is cannot be changed (the
        form disables the field), so neither key is expected there.
        """
        if self.instance is not None:
            return attrs
        has_existing = attrs.get('customer') is not None
        has_new = attrs.get('new_customer') is not None
        if has_existing and has_new:
            raise serializers.ValidationError(
                'Choose a client or enter a new one, not both.')
        if not has_existing and not has_new:
            raise serializers.ValidationError({'customer': 'Choose a client for this appointment.'})
        return attrs

    def create(self, validated_data):
        """Write the customer first when one was typed, then the appointment.

        A number already on file is that person, not an error: the counter
        typing a returning customer's number must book for them rather than
        meet a uniqueness refusal about a record they cannot see from here.
        """
        new_customer = validated_data.pop('new_customer', None)
        if new_customer is not None:
            validated_data['customer'] = self._customer_from(new_customer)
        return super().create(validated_data)

    @staticmethod
    def _customer_from(data):
        from crm_api.models import Customer, whatsapp_number

        canonical = whatsapp_number(data.get('mobile_number') or '')
        if canonical:
            existing = Customer.objects.filter(mobile_number=canonical).first()
            if existing is not None:
                return existing
        # Through CustomerSerializer so the booking form obeys exactly the
        # rules the Add Customer form does, refusal sentences included.
        serializer = CustomerSerializer(data={
            'first_name': data.get('first_name', ''),
            'last_name': data.get('last_name', ''),
            'mobile_number': data.get('mobile_number', ''),
            'gender': data.get('gender', ''),
        })
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def validate_scheduled_time(self, value):
        # A booking is a promise about the future; a slot that has already
        # gone by is a typo in the date, not an appointment. Compared as the
        # boutique's local day, so an evening slot is not refused because it
        # is already tomorrow in UTC. An existing booking keeps its slot:
        # marking yesterday's appointment completed is not a re-booking.
        if self.instance is not None and value == self.instance.scheduled_time:
            return value
        validate_not_past(timezone.localtime(value).date(), label='Appointment time')
        return value

    def validate_notes(self, value):
        return validate_text(value, label='Notes', max_length=MAX_NOTE)
