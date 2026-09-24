from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExpenseViewSet, PaymentViewSet, ProfitLossView, TrendView

router = DefaultRouter()
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'payments', PaymentViewSet, basename='finance-payment')

urlpatterns = [
    path('profit-loss/', ProfitLossView.as_view(), name='finance-profit-loss'),
    path('trend/', TrendView.as_view(), name='finance-trend'),
    path('', include(router.urls)),
]
