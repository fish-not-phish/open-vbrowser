from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model

User = get_user_model()


class MyAccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        try:
            from .models import SiteSettings
            return SiteSettings.get().allow_registration
        except Exception:
            from django.conf import settings
            return getattr(settings, 'ACCOUNT_SIGNUP_ENABLED', True)

    def respond_signup_closed(self, request, sociallogin=None):
        from django.shortcuts import redirect
        return redirect('account_login')


class MySocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin):
        # OIDC users can always register regardless of the allow_registration setting.
        # allow_registration only gates the public username/password signup form.
        return True

    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        # Extract email — OIDC providers may not always set email_verified,
        # so check email_addresses list first then fall back to raw extra_data
        email = next((ea.email for ea in sociallogin.email_addresses if ea.email), None)
        if not email:
            email = sociallogin.account.extra_data.get('email')
        if not email:
            return

        try:
            user = User.objects.get(email__iexact=email)
        except (User.DoesNotExist, User.MultipleObjectsReturned):
            return

        # Ensure a verified EmailAddress record exists for this user so that
        # allauth's wipe_password logic won't remove their local password on
        # future logins.
        try:
            addr = EmailAddress.objects.get(user=user, email__iexact=email)
            if not addr.verified:
                addr.verified = True
                addr.save(update_fields=['verified'])
        except EmailAddress.DoesNotExist:
            EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)

        # Link the social account to the existing user directly — avoids
        # connect()'s user.save() + signal cascade which can fail silently.
        sociallogin.user = user
        if not sociallogin.account.pk:
            sociallogin.account.user = user
            sociallogin.account.save()