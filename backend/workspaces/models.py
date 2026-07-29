from django.db import models
from django.contrib.auth.models import User
import uuid as _uuid


class Workspace(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='created_workspaces'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Workspace-level overrides (same pattern as UserLimit)
    max_concurrent_sessions_per_member = models.PositiveIntegerField(null=True, blank=True)
    idle_timeout_minutes = models.PositiveIntegerField(null=True, blank=True)
    max_session_duration_hours = models.PositiveIntegerField(null=True, blank=True)
    is_personal = models.BooleanField(default=False, help_text="Auto-created personal workspace for this user")
    logo = models.ImageField(upload_to='workspace_logos/', blank=True, null=True)
    # If empty, all enabled browsers are available; if set, only these are accessible in this workspace
    allowed_browsers = models.ManyToManyField(
        'browsers.BrowserImage', blank=True, related_name='workspace_allowlist'
    )
    # Per-workspace feature flags (only effective when the corresponding global flag is also enabled)
    enable_network_logging = models.BooleanField(
        default=False,
        help_text="Allow members of this workspace to use network logging (requires global flag)."
    )
    enable_file_protection = models.BooleanField(
        default=False,
        help_text="Allow members of this workspace to use file protection (requires global flag)."
    )
    enable_persistent_storage = models.BooleanField(
        default=False,
        help_text="Allow members of this workspace to use persistent S3 storage (requires global flag)."
    )
    # S3 Files access point ARN — provisioned automatically when the workspace
    # is created (if persistent storage is available). Null for personal workspaces
    # or if provisioning failed.
    s3files_access_point_arn = models.CharField(
        max_length=500, blank=True, default='',
        help_text="ARN of the S3 Files access point for this workspace's persistent storage."
    )

    def __str__(self):
        return self.name


class WorkspaceMembership(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspacemembership_set')
    role = models.CharField(
        max_length=20,
        choices=[
            ('owner', 'Owner'),
            ('admin', 'Admin'),
            ('member', 'Member'),
            ('analyst', 'Analyst'),
            ('viewer', 'Viewer'),
        ],
        default='member'
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('workspace', 'user')]

    def __str__(self):
        return f"{self.user.username} in {self.workspace.name} ({self.role})"
