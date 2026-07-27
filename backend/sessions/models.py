from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from decimal import Decimal
import uuid
import secrets


# Note: this app uses label 'vbsessions' to avoid conflict with django.contrib.sessions


class Container(models.Model):
    """Core session record — one row per ephemeral browser session."""
    name = models.CharField("Name", max_length=255, null=True, blank=True)
    port = models.PositiveBigIntegerField("Port", null=True, blank=True)
    active = models.BooleanField("Active", default=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    url = models.CharField("URL", max_length=500, null=True, blank=True)
    date_created = models.DateTimeField("Date", auto_now_add=True, help_text="Format: YYYY-MM-DD HH:MM:SS", null=True, editable=False)
    objects = models.Manager()
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    private_ip = models.CharField("Private IP Address", max_length=50, null=True, blank=True)
    ip_address = models.CharField("IP Address", max_length=50, null=True, blank=True)
    subdomain = models.CharField("Subdomain", max_length=255, null=True, blank=True)
    session_token = models.CharField("Session Token", max_length=255, null=True, blank=True)
    container_url = models.URLField("Container URL", max_length=255, null=True, blank=True)
    task_arn = models.CharField("Task ARN", max_length=255, null=True, blank=True)
    type = models.CharField("Type", max_length=50, null=True, blank=True)
    start_time = models.DateTimeField("Start Time", null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    sg_id = models.CharField("SG ID", max_length=50, null=True, blank=True)
    capacity_provider = models.CharField("Capacity Provider", max_length=50, null=True, blank=True)
    category = models.CharField("Category", max_length=10, null=True, blank=True)

    # New fields (added in migration)
    workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sessions'
    )
    vcpu = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('0.25'))
    memory_gb = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.5'))
    session_cost_usd = models.DecimalField(max_digits=8, decimal_places=6, null=True, blank=True)

    # Session feature flags — stored so history/audit can reflect what was enabled
    enable_traffic_log = models.BooleanField(
        "Network Logging",
        default=False,
        help_text="Whether mitmproxy traffic logging was enabled for this session"
    )
    file_protection = models.BooleanField(
        "File Protection",
        default=False,
        help_text="Whether downloaded files were 7z-encrypted for this session"
    )
    persistent_storage = models.BooleanField(
        "Persistent Storage",
        default=False,
        help_text="Whether persistent S3 storage was mounted for this session"
    )
    # Case and tags (linked from cases app)
    case = models.ForeignKey(
        'cases.Case', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sessions'
    )
    tags = models.ManyToManyField('cases.Tag', blank=True, related_name='containers')

    def save(self, *args, **kwargs):
        if not self.id:
            self.session_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Container {self.uuid} ({self.type})"


class OpenContainers(models.Model):
    """Tracks live/open containers for idle-timeout enforcement."""
    container = models.ForeignKey(Container, on_delete=models.SET_NULL, null=True)
    container_uuid = models.CharField("UUID", max_length=255, null=True)
    last_ping_at = models.DateTimeField(default=timezone.now)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"OpenContainer for {self.container_uuid}"


class SessionLog(models.Model):
    """S3 session log reference."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True)
    container = models.ForeignKey(Container, on_delete=models.SET_NULL, null=True)
    file_path = models.FileField(upload_to='session_logs/')
    date_created = models.DateTimeField("Date", auto_now_add=True, null=True, editable=False)

    def __str__(self):
        return f"SessionLog for {self.container_id}"



class TrafficEvent(models.Model):
    """A single hostname/IP contact recorded by the in-container traffic proxy."""
    container = models.ForeignKey(
        Container, on_delete=models.CASCADE, related_name='traffic_events'
    )
    timestamp = models.DateTimeField(
        help_text="UTC timestamp reported by the container proxy"
    )
    host = models.CharField(
        max_length=253,
        help_text="Hostname or raw IP address contacted by the browser"
    )
    url = models.TextField(
        help_text="Full URI including scheme, path, and query string"
    )
    method = models.CharField(
        max_length=16,
        default='',
        blank=True,
        help_text="HTTP method (GET, POST, …) reported by the container proxy"
    )
    flagged = models.BooleanField(
        default=False,
        help_text="Manually flagged by the user for later review"
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['container', 'timestamp'], name='vbsessions__contain_350152_idx'),
            models.Index(fields=['container', 'flagged'], name='vbsessions__contain_a5f14f_idx'),
        ]

    def __str__(self):
        return f"{self.host} @ {self.timestamp} (session {self.container_id})"
