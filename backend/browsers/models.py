from django.db import models
from django.contrib.auth.models import User


class BrowserCategory(models.Model):
    slug = models.CharField(max_length=50, unique=True)   # e.g. "browser", "security"
    label = models.CharField(max_length=100)               # e.g. "Browser", "Security"

    class Meta:
        ordering = ['label']
        verbose_name_plural = 'browser categories'

    def __str__(self):
        return self.label


class BrowserImage(models.Model):
    slug = models.CharField(max_length=50, unique=True)   # matches directory name, e.g. "kali"
    display_name = models.CharField(max_length=100)        # e.g. "Kali Linux"
    description = models.TextField(blank=True)
    icon_filename = models.CharField(max_length=100, blank=True)  # e.g. "kali.png"
    category = models.CharField(max_length=50, blank=True)        # legacy single-category field
    categories = models.ManyToManyField(BrowserCategory, blank=True, related_name='browsers')
    enabled = models.BooleanField(default=True)            # global kill-switch
    requires_spot = models.BooleanField(default=False)     # force Spot for cost reasons
    idle_timeout_override_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Override idle timeout for this browser type only."
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'display_name']

    def __str__(self):
        return self.display_name


class BrowserAvailabilityRule(models.Model):
    """
    Allowlist entry. If any rules exist for a browser, only matched
    users/groups/workspaces see it. If no rules exist, all users see it
    (subject to BrowserImage.enabled).
    """
    browser = models.ForeignKey(BrowserImage, on_delete=models.CASCADE, related_name='rules')
    # At most one of these is set per rule:
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    group = models.ForeignKey(
        'auth.Group', on_delete=models.SET_NULL, null=True, blank=True
    )
    workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(user__isnull=False, group__isnull=True, workspace__isnull=True) |
                    models.Q(user__isnull=True, group__isnull=False, workspace__isnull=True) |
                    models.Q(user__isnull=True, group__isnull=True, workspace__isnull=False)
                ),
                name='exactly_one_subject'
            )
        ]

    def __str__(self):
        subject = self.user or self.group or self.workspace
        return f"{self.browser.slug} → {subject}"
