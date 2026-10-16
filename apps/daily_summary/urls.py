from django.urls import path

from .views import SummaryPreferenceView

urlpatterns = [
    path('settings/', SummaryPreferenceView.as_view()),
    path('settings/<int:user_id>/', SummaryPreferenceView.as_view()),
]
