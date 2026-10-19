from django.db import connection
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import OwnerOnly
from core.roles import OWNER
from crm_api.models import whatsapp_number

from .models import SummaryPreference
from .send import recipients
from .text import DEFAULT, LANGUAGES


class PreferenceSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)
    language = serializers.ChoiceField(choices=LANGUAGES, required=False)


def _row(user, role, name, mobile, email, preferences):
    preference = preferences.get(user.id)
    # Which channel the sender will try first, by the same rules it uses:
    # the owner by email; staff on WhatsApp when they have a mobile, else email.
    if role != OWNER and whatsapp_number(mobile):
        channel = 'whatsapp'
    else:
        channel = 'email' if email else 'none'
    return {
        'user_id': user.id, 'name': name, 'role': role, 'channel': channel,
        'enabled': preference.enabled if preference else True,
        'language': preference.language if preference else DEFAULT,
    }


class SummaryPreferenceView(APIView):
    """The owner's Daily Summary Notifications settings for their own boutique.

    Everyone is listed from the boutique's own owner address and roster (the
    same list the sender uses), so a user id from anywhere else is a 404.
    """
    permission_classes = [IsAuthenticated, OwnerOnly]

    def get(self, request):
        preferences = {p.user_id: p for p in SummaryPreference.objects.all()}
        return Response([_row(*person[:5], preferences) for person in recipients(connection.tenant)])

    def patch(self, request, user_id):
        person = next((p for p in recipients(connection.tenant) if p[0].id == user_id), None)
        if person is None:
            return Response({'detail': 'Not a member of this boutique.'},
                            status=status.HTTP_404_NOT_FOUND)
        data = PreferenceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        preference, _ = SummaryPreference.objects.update_or_create(
            user=person[0], defaults=data.validated_data)
        return Response(_row(*person[:5], {preference.user_id: preference}))
