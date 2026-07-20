from django.apps import AppConfig


class SessionsConfig(AppConfig):
    name = 'sessions'
    label = 'vbsessions'  # avoid conflict with django.contrib.sessions
