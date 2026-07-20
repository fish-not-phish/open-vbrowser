from django.db import models
from django.contrib.auth.models import User
import uuid as _uuid
import os


class Tag(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.CASCADE,
        null=True, blank=True, related_name='tags'
    )
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default='#6366f1')  # hex color for UI badge

    class Meta:
        unique_together = [('workspace', 'name')]

    def __str__(self):
        return self.name


class Case(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.CASCADE,
        null=True, blank=True, related_name='cases'
    )
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('open', 'Open'),
            ('closed', 'Closed'),
            ('archived', 'Archived'),
        ],
        default='open'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class SessionNote(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    container = models.ForeignKey(
        'vbsessions.Container', on_delete=models.CASCADE, related_name='notes'
    )
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Note on {self.container_id} by {self.author_id}"


class CaseComment(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment on case {self.case_id} by {self.author_id}"


def _attachment_upload_path(instance, filename):
    return f"case_attachments/{instance.case.uuid}/{filename}"


class CaseAttachment(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    file = models.FileField(upload_to=_attachment_upload_path)
    filename = models.CharField(max_length=255)  # original filename
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.filename} on case {self.case_id}"
