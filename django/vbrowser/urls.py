from django.contrib import admin
from django.urls import path, include
from django.views.generic.base import RedirectView
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [  
    path('admin/', admin.site.urls),
    path('', include('main.urls')),
    path('accounts/email/', RedirectView.as_view(url='/', permanent=False), name='account_email'),
    path('accounts/inactive/', RedirectView.as_view(url='/', permanent=False), name='account_inactive'),
    path('accounts/3rdparty/', RedirectView.as_view(url='/', permanent=False), name='redirect_3rdparty'),
    path('accounts/social/login/cancelled/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_login_cancelled'),
    path('accounts/social/login/error/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_login_error'),
    path('accounts/social/signup/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_signup'),
    path('accounts/social/connections/', RedirectView.as_view(url='/', permanent=False), name='redirect_social_connections'),
    path('accounts/password/reset/', RedirectView.as_view(url='/', permanent=False), name='account_reset_password'),
    path('accounts/', include('allauth.urls')),
]

urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = 'main.views.error_404'
handler403 = 'main.views.error_403'
handler400 = 'main.views.error_400'
handler500 = 'main.views.error_500'