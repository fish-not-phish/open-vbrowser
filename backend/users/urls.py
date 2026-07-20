from django.urls import path
from . import views

urlpatterns = [
    path('gate/', views.auth_gate, name='auth_gate'),
]