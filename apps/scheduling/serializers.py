from django.utils import timezone
from rest_framework import serializers

from core.validators import MAX_NOTE, validate_not_past, validate_text
from crm_api.serializers import CustomerSerializer, TailorSerializer

from .models import Appointment


class AppointmentSerializer(serializers.ModelSerializer):
    customer_detail = CustomerSerializer(source='customer', read_only=True)
    assigned_staff_detail = TailorSerializer(source='assigned_staff', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'

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
