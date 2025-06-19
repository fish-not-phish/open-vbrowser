from django.urls import path, include
from . import views
from django.views.generic.base import TemplateView

urlpatterns = [
    # main views
    path('', views.start, name='start'),
    path('session/', views.session, name='session'),
    path('loading/<str:container_uuid>/', views.loading, name='loading'),
    path('session/<str:container_uuid>', views.surf, name='surf'),
    path('account/settings/', views.account_settings, name='account_settings'),
    path('account/security/', views.account_security, name='account_security'),
    path('account/api/', views.account_api_key, name='account_api'),

    path('robots.txt', TemplateView.as_view(template_name="main/robots.txt", content_type="text/plain")),

    # callback views
    path('container_data_returned/', views.container_data_returned, name='container_data_returned'),
    path('container_status/<str:container_uuid>', views.container_status, name='container_status'),
    path('close_session/<str:container_uuid>', views.close_session, name='close_session'),
    path('ping/<str:container_uuid>', views.ping, name='ping'),

    # docs
    path('docs/session/', views.docs_session, name='docs_session'),
    path('docs/clipboard/', views.docs_clipboard, name='docs_clipboard'),
    path('docs/sound/', views.docs_sounds, name='docs_sounds'),
    path('docs/screenshot/', views.docs_screenshot, name='docs_screenshot'),
    path('docs/files/', views.docs_file, name='docs_file'),

    # container session proxy view
    path('proxy/', views.container_proxy, name='container_proxy'),
]