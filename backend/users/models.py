from django.db import models
from django.contrib.auth.models import User
from django.core.validators import RegexValidator
import secrets
import uuid as _uuid


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True)
    is_admin = models.BooleanField(default=False)

    def __str__(self):
        return f"Profile for {self.user.username if self.user else 'Unknown'}"


class ExtendProfile(models.Model):
    """Extended user profile — phone number etc."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, related_name='extend_profile')
    phone = models.CharField(
        null=True, blank=True, max_length=13,
        validators=[RegexValidator(r'^\d{3}-\d{3}-\d{4}$')]
    )

    def __str__(self):
        return f"ExtendProfile for {self.user.username if self.user else 'Unknown'}"


class SiteSettings(models.Model):
    allow_registration = models.BooleanField(default=True)
    oidc_enabled = models.BooleanField(default=False)
    oidc_provider_type = models.CharField(max_length=64, blank=True, default='')
    oidc_client_id = models.CharField(max_length=255, blank=True, default='')
    oidc_client_secret = models.CharField(max_length=255, blank=True, default='')
    oidc_server_url = models.CharField(max_length=500, blank=True, default='')
    # Admin-configurable limits (site-wide defaults)
    default_idle_timeout_minutes = models.PositiveIntegerField(default=10)
    default_max_concurrent_sessions = models.PositiveIntegerField(default=3)
    default_max_session_duration_hours = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Leave blank for no hard cap"
    )
    # JSON list of user IDs whose TOTP was suspended when OIDC was enabled
    mfa_suspended_user_ids = models.TextField(default='[]', blank=True)
    # Whether the system auto-creates a personal workspace for each new user.
    # When disabled, users without any workspace assignment see a "contact admin" page.
    allow_personal_workspaces = models.BooleanField(
        default=True,
        help_text="When disabled, no personal workspace is created for new users."
    )
    # Whether regular users can create their own workspaces.
    # Admins can always create workspaces regardless of this setting.
    allow_workspace_creation = models.BooleanField(
        default=True,
        help_text="When disabled, only admins can create new workspaces."
    )
    # JSON list of browser slugs that ALL workspaces (non-personal) may pick from.
    # Empty list = every enabled browser is allowed globally.
    global_allowed_browser_slugs = models.TextField(
        default='[]', blank=True,
        help_text='JSON list of slugs. Empty = all browsers available to workspaces.'
    )
    # JSON list of browser slugs that personal workspaces get by default.
    # Must be a subset of global_allowed_browser_slugs (enforced in the API).
    # Empty list = personal workspaces inherit all globally allowed browsers.
    default_personal_browser_slugs = models.TextField(
        default='[]', blank=True,
        help_text='JSON list of slugs for personal workspaces. Empty = all globally allowed.'
    )
    # Whether network (traffic) logging is available anywhere on this instance.
    # When False, the feature is completely disabled regardless of workspace settings.
    enable_network_logging = models.BooleanField(
        default=False,
        help_text="When enabled, workspace admins may allow members to capture network traffic logs."
    )
    # Whether file protection (encrypted download wrapping) is available anywhere on this instance.
    # When False, the feature is completely disabled regardless of workspace settings.
    enable_file_protection = models.BooleanField(
        default=False,
        help_text="When enabled, workspace admins may allow members to use file protection."
    )
    # Whether persistent S3 storage is available anywhere on this instance.
    # When False, the feature is completely disabled regardless of workspace settings.
    enable_persistent_storage = models.BooleanField(
        default=False,
        help_text="When enabled, workspace admins may allow members to use persistent S3 storage."
    )
    # ── ECS task resource provisioning ────────────────────────────────────────
    # vCPU and memory for standard browser sessions (Chrome, Firefox, etc.)
    # Allowed combos: 0.5/1..4 GB, 1/2..8 GB, 2/4..16 GB, 4/8..30 GB
    browser_vcpu = models.DecimalField(
        max_digits=4, decimal_places=2, default='0.5',
        help_text="vCPU allocation for standard browser sessions (e.g. 0.25, 0.5, 1.0)."
    )
    browser_memory_gb = models.DecimalField(
        max_digits=6, decimal_places=2, default='2.0',
        help_text="RAM in GB for standard browser sessions (e.g. 0.5, 1.0, 2.0)."
    )
    # vCPU and memory for OS-based sessions (Kali, Ubuntu, Alpine)
    os_vcpu = models.DecimalField(
        max_digits=4, decimal_places=2, default='2.0',
        help_text="vCPU allocation for OS-based sessions (Kali, Ubuntu, Alpine)."
    )
    os_memory_gb = models.DecimalField(
        max_digits=6, decimal_places=2, default='4.0',
        help_text="RAM in GB for OS-based sessions (Kali, Ubuntu, Alpine)."
    )

    class Meta:
        verbose_name = 'Site Settings'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class UserLimit(models.Model):
    """
    Per-user resource limits. Falls back to SiteSettings defaults if not set.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='limits')
    max_concurrent_sessions = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Leave blank to use site default"
    )
    idle_timeout_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Leave blank to use site default"
    )
    max_session_duration_hours = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Hard cap on session length. Leave blank for no cap."
    )

    def __str__(self):
        return f"Limits for {self.user.username}"


class APIKey(models.Model):
    """API key for programmatic access — replaces DRF Token."""
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_keys')
    key = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = secrets.token_urlsafe(48)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"APIKey({self.name or 'unnamed'}) for {self.user.username}"