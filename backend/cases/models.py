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


class CaseFileLink(models.Model):
    """A read-only reference from a case to a file that lives in the workspace's
    S3 persistent storage. No bytes are copied — the link only stores the S3
    path (relative to the workspace prefix) and snapshotted metadata so the
    case's Files list stays useful even if the source object is later removed.
    """
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name='file_links')
    workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.CASCADE, related_name='case_file_links'
    )
    s3_path = models.CharField(max_length=1024, help_text="Path relative to the workspace S3 prefix.")
    filename = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    linked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('case', 's3_path')]

    def __str__(self):
        return f"{self.filename} linked on case {self.case_id}"
