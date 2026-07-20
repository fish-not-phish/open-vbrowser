from django.contrib import admin
from django.urls import path, include, re_path
from users.api import router as users_router
from ninja_extra import NinjaExtraAPI
from django.views.generic.base import RedirectView
from django.conf import settings
from django.views.static import serve
from users.views import *
from .api import api

urlpatterns = [
    path("ovb-admin/", admin.site.urls),
    path("api/", api.urls),
    path('accounts/auth/', include('users.urls')),
    path('accounts/email/', RedirectView.as_view(url='/', permanent=False), name='account_email'),
    path('accounts/inactive/', RedirectView.as_view(url='/', permanent=False), name='account_inactive'),
    path('accounts/3rdparty/', RedirectView.as_view(url='/', permanent=False), name='redirect_3rdparty'),
    path('accounts/social/login/cancelled/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_login_cancelled'),
    path('accounts/social/login/error/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_login_error'),
    path('accounts/social/signup/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_signup'),
    path('accounts/social/connections/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_connections'),
    path('accounts/password/reset/', RedirectView.as_view(url='/', permanent=False), name='account_reset_password'),
    path('accounts/', include('allauth.urls')),
    # Serve user-uploaded media unconditionally (works in both DEBUG and production).
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]