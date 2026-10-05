from django.urls import path

from .portal_views import (
    CustomerIntakeView, ProfileView, VerifyRequestView, VerifyView,
)

#: Mounted at /intake/ (boutique_crm/urls.py). Outside /api/ for the same
#: reason /track/ is: these resolve their own tenant from the slug and must
#: never meet TenantHeaderMiddleware's X-Tenant-ID path.
urlpatterns = [
    path('<slug:shop_slug>/customer/verify/request/',
         VerifyRequestView.as_view(), name='portal-verify-request'),
    path('<slug:shop_slug>/customer/verify/',
         VerifyView.as_view(), name='portal-verify'),
    path('<slug:shop_slug>/customer/profile/',
         ProfileView.as_view(), name='portal-profile'),
    path('<slug:shop_slug>/customers/',
         CustomerIntakeView.as_view(), name='portal-customer-intake'),
]
