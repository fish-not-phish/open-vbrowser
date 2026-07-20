from django.conf import settings


def oidc_settings(request):
    """Expose auth configuration to templates."""
    try:
        from users.models import SiteSettings
        config = SiteSettings.get()
        return {
            'OIDC_ENABLED': config.oidc_enabled,
            'OIDC_PROVIDER_TYPE': config.oidc_provider_type,
            'SIGNUPS_ENABLED': config.allow_registration,
            'APP_NAME': getattr(settings, 'APP_NAME', 'DevGuard'),
        }
    except Exception:
        return {
            'OIDC_ENABLED': getattr(settings, 'OIDC_ENABLED', False),
            'OIDC_PROVIDER_TYPE': getattr(settings, 'OIDC_PROVIDER_TYPE', ''),
            'SIGNUPS_ENABLED': getattr(settings, 'ACCOUNT_SIGNUP_ENABLED', True),
            'APP_NAME': getattr(settings, 'APP_NAME', 'DevGuard'),
        }