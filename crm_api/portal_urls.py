from django.urls import path

from .portal_views import (
    CustomerIntakeView, ProductsView, ProfileView, RequirementView,
    VerifyRequestView, VerifyView,
)

#: Mounted at /intake/ (boutique_crm/urls.py). Outside /api/ for the same
#: reason /track/ is: these resolve their own tenant and must never meet
#: TenantHeaderMiddleware's X-Tenant-ID path.
#:
#: No boutique in the path. X-Portal-Key names the boutique, because a
#: credential belongs to exactly one -- so these URLs are identical for every
#: portal and the website developer has one value to configure, not two.
urlpatterns = [
    path('products/', ProductsView.as_view(), name='portal-products'),
    path('customer/verify/request/', VerifyRequestView.as_view(),
         name='portal-verify-request'),
    path('customer/verify/', VerifyView.as_view(), name='portal-verify'),
    path('customer/profile/', ProfileView.as_view(), name='portal-profile'),
    path('customer/', CustomerIntakeView.as_view(), name='portal-customer-intake'),
    path('customer/product/', RequirementView.as_view(), name='portal-customer-product'),
]
