from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from main.models import SiteSetting

User = get_user_model()

@receiver(pre_save, sender=User)
def prevent_user_creation(sender, instance, **kwargs):
    if instance.pk:
        return
    settings = SiteSetting.get_settings()
    if not settings or not settings.signups:
        raise PermissionDenied("User creation disabled")
