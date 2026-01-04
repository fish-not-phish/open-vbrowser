# core/middleware.py
from django.http import Http404
from django.urls import resolve
from main.models import SiteSetting

SIGNUP_URL_NAMES = {
    "account_signup",
}

class DisableSignupMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            match = resolve(request.path_info)
        except Exception:
            return self.get_response(request)

        if match.url_name in SIGNUP_URL_NAMES:
            settings = SiteSetting.get_settings()
            if not settings or not settings.signups:
                raise Http404()

        return self.get_response(request)
