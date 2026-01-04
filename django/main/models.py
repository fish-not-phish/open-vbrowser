from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid
from django.core.validators import RegexValidator
import secrets

def alphanumeric_username(instance, filename):
    # Get the username and remove non-alphanumeric characters
    username = ''.join(char for char in instance.user.username if char.isalnum())
    return f'downloads/{username}/{filename}'

class Container(models.Model):
    name = models.CharField("Name", max_length=255, null=True, blank=True)
    port = models.PositiveBigIntegerField("Port", null=True, blank=True)
    active = models.BooleanField("Active", default=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    url = models.CharField("URL", max_length=500, null=True, blank=True)
    date_created = models.DateTimeField("Date", auto_now_add=True, help_text="Format: YYYY-MM-DD HH:MM:SS", null=True, editable=False)
    objects = models.Manager()
    uuid = models.UUIDField(default=uuid.uuid4, editable=False)
    private_ip = models.CharField("Private IP Address", max_length=50, null=True, blank=True)
    ip_address = models.CharField("IP Address", max_length=50, null=True, blank=True)
    subdomain = models.CharField("Subdomain", max_length=255, null=True, blank=True)
    session_token = models.CharField("Session Token", max_length=255, null=True, blank=True) 
    container_url = models.URLField("Container URL", max_length=255, null=True, blank=True) 
    task_arn = models.CharField("Task ARN", max_length=255, null=True, blank=True)
    type = models.CharField("Type", max_length=50, null=True, blank=True)
    start_time = models.DateTimeField("Start Time", null=True, blank=True) 
    closed_at = models.DateTimeField(null=True)
    sg_id = models.CharField("SG ID", max_length=50, null=True, blank=True)
    capacity_provider = models.CharField("Capacity Provider", max_length=50, null=True, blank=True) 
    category = models.CharField("Category", max_length=10, null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.id:
            self.date_created = timezone.now().strftime('%Y-%m-%d %H:%M:%S')
            self.session_token = secrets.token_urlsafe(32)
        super(Container, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} (Port: {self.port})"
    
class OpenContainers(models.Model):
    container = models.ForeignKey(Container, on_delete=models.SET_NULL, null=True)
    container_uuid = models.CharField("UUID", max_length=255, null=True)
    last_ping_at = models.DateTimeField(auto_now_add=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True)

class ExtendProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True)
    phone = models.CharField(null=True, max_length=13, validators=[RegexValidator(r'^\d{3}-\d{3}-\d{4}$')])
    
class SessionLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True)
    container = models.ForeignKey(Container, on_delete=models.SET_NULL, null=True)
    file_path = models.FileField(upload_to='session_logs/')
    date_created = models.DateTimeField("Date", auto_now_add=True, help_text="Format: YYYY-MM-DD HH:MM:SS", null=True, editable=False)

class SiteSetting(models.Model):
    signups = models.BooleanField("Sign Ups Allowed", default=True)

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
    



