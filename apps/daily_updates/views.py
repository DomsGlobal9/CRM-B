"""The To-do's one endpoint: list a month of daily updates, post one, delete one's own.

Who sees what is decided here, by role: the owner, Masters and Designers see
every staff member's updates; everyone else only their own. Everyone but the
owner posts. The prefix is in core.modules.ALWAYS_ON for that reason -- no
module switch, the role rule below is the whole gate.
"""
import calendar
import uuid
from datetime import date

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.staff.attendance import business_date
from core.permissions import SUPERVISOR_ROLES
from core.roles import OWNER, resolve_user_role
from core.validators import MAX_NOTE, validate_http_url, validate_image_uploads, validate_text

from .models import DailyUpdate

#: A phone clip of the day's work, not a film.
MAX_VIDEO_BYTES = 50 * 1024 * 1024


def sees_everyone(role):
    return role == OWNER or role in SUPERVISOR_ROLES


def _name_of(user):
    profile = getattr(user, 'tailor_profile', None)
    if profile is not None and profile.name:
        return profile.name
    designer = getattr(user, 'designer_profile', None)
    if designer is not None and designer.name:
        return designer.name
    return user.get_full_name() or user.username


class DailyUpdateSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()

    class Meta:
        model = DailyUpdate
        fields = ['id', 'author', 'author_name', 'author_role', 'date', 'note', 'voice_note',
                  'photos', 'video', 'created_at', 'mine']
        read_only_fields = fields

    def get_mine(self, row):
        request = self.context.get('request')
        return bool(request and row.author_id == request.user.id)


def _month(raw):
    """(first day, last day) of `raw` ('2026-11'), or of this month."""
    today = business_date(timezone.now())
    year, month = today.year, today.month
    if raw:
        try:
            year, month = (int(part) for part in str(raw).split('-')[:2])
            date(year, month, 1)
        except (TypeError, ValueError):
            raise ValidationError({'error': 'Give the month as YYYY-MM.'})
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _store(upload, folder, request, video=False):
    storage = default_storage
    if video and 'cloudinary' in settings.STORAGES['default']['BACKEND']:
        # Cloudinary keeps video under its own resource type, as voice notes do.
        from cloudinary_storage.storage import VideoMediaCloudinaryStorage
        storage = VideoMediaCloudinaryStorage()
    ext = (upload.name.rsplit('.', 1)[-1] if '.' in upload.name else 'bin')[:8]
    path = storage.save(f'daily_updates/{folder}/{uuid.uuid4()}.{ext}', upload)
    url = storage.url(path)
    return request.build_absolute_uri(url) if url.startswith('/') else url


class DailyUpdateViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        role = resolve_user_role(request.user)
        first, last = _month(request.query_params.get('month'))
        rows = DailyUpdate.objects.filter(date__gte=first, date__lte=last)
        if sees_everyone(role):
            person = request.query_params.get('person')
            if person:
                try:
                    rows = rows.filter(author_id=int(person))
                except (TypeError, ValueError):
                    rows = rows.none()
        else:
            rows = rows.filter(author=request.user)
        data = DailyUpdateSerializer(rows, many=True, context={'request': request}).data
        return Response({'month': first.strftime('%Y-%m'), 'sees_everyone': sees_everyone(role),
                         'can_post': role not in (None, OWNER), 'results': data})

    def create(self, request):
        role = resolve_user_role(request.user)
        if role in (None, OWNER):
            return Response({'error': 'Daily updates are posted by staff.'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            note = validate_text(request.data.get('note'), label='Note', max_length=MAX_NOTE) or ''
            voice_note = validate_http_url((request.data.get('voice_note') or '').strip(), label='Voice note') or ''
            photos = validate_image_uploads(request.FILES.getlist('photos'), label='Photos') or []
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                detail = next(iter(detail.values()), detail)
            if isinstance(detail, list):
                detail = detail[0] if detail else 'That is not valid.'
            return Response({'error': str(detail)}, status=status.HTTP_400_BAD_REQUEST)

        clip = request.FILES.get('video')
        if clip is not None:
            if not (clip.content_type or '').startswith('video/'):
                return Response({'error': 'The video must be a video file.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if clip.size > MAX_VIDEO_BYTES:
                return Response({'error': 'That video is too big. Keep it under 50 MB (about a minute).'},
                                status=status.HTTP_400_BAD_REQUEST)
        if not (note.strip() or voice_note or photos or clip):
            return Response({'error': 'Add a note, a photo, a voice note or a video.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            photo_urls = [_store(photo, 'photos', request) for photo in photos]
            video_url = _store(clip, 'videos', request, video=True) if clip is not None else ''
        except Exception:
            return Response({'error': 'The files could not be saved. Please try again.'},
                            status=status.HTTP_400_BAD_REQUEST)

        row = DailyUpdate.objects.create(
            author=request.user, author_name=_name_of(request.user), author_role=role,
            date=business_date(timezone.now()), note=note.strip(), voice_note=voice_note,
            photos=photo_urls, video=video_url)
        return Response(DailyUpdateSerializer(row, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        row = DailyUpdate.objects.filter(pk=pk).first()
        if row is None:
            return Response({'error': 'That update no longer exists.'}, status=status.HTTP_404_NOT_FOUND)
        if row.author_id != request.user.id:
            return Response({'error': 'Only the person who posted an update can delete it.'},
                            status=status.HTTP_403_FORBIDDEN)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
