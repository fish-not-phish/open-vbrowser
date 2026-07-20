from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import UserProfile

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        is_first_user = User.objects.count() == 1
        UserProfile.objects.create(user=instance, is_admin=is_first_user)
        if is_first_user:
            User.objects.filter(pk=instance.pk).update(is_staff=True, is_superuser=True)