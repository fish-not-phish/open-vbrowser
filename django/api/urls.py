# api/urls.py
from django.urls import path
from . import views
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path('', views.apiOverview, name='api-overview'),
    path('create-session/', views.api_create_session, name='create-session'),
    path('get-session/', views.api_get_session, name='get-session'),
    path("terminate-session/", views.api_terminate_session, name="api-terminate-session"),
    path('schema/', SpectacularAPIView.as_view(urlconf='api.urls'), name='schema'),
    path('docs/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
