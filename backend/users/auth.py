from ninja.security import SessionAuth


session_mfa_auth = SessionAuth()


class AdminSessionAuth(SessionAuth):
    """Session auth that additionally requires UserProfile.is_admin = True."""

    def authenticate(self, request, key):
        user = super().authenticate(request, key)
        if user is None:
            return None
        from users.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if not profile.is_admin:
            return None
        return user


admin_session_auth = AdminSessionAuth()
