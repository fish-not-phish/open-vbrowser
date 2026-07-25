from django.contrib.auth.models import User
from django.db.models.signals import post_save, post_migrate
from django.dispatch import receiver
from .models import UserProfile

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        is_first_user = User.objects.count() == 1
        UserProfile.objects.create(user=instance, is_admin=is_first_user)
        if is_first_user:
            User.objects.filter(pk=instance.pk).update(is_staff=True, is_superuser=True)

        # Auto-verify the user's email on creation so they are never blocked by
        # email verification requirements (covers OIDC/SSO and password signups).
        if instance.email:
            from allauth.account.models import EmailAddress
            EmailAddress.objects.get_or_create(
                user=instance,
                email__iexact=instance.email,
                defaults={
                    'email': instance.email,
                    'verified': True,
                    'primary': True,
                },
            )
            # If the record already existed but wasn't verified, mark it verified.
            EmailAddress.objects.filter(
                user=instance, email__iexact=instance.email, verified=False
            ).update(verified=True)


@receiver(post_migrate)
def sync_site_domain(sender, **kwargs):
    """Keep the django.contrib.sites Site #1 in sync with CUSTOM_DOMAIN."""
    from django.conf import settings
    domain = getattr(settings, 'CUSTOM_DOMAIN', '').split(':')[0]
    if not domain:
        return
    try:
        from django.contrib.sites.models import Site
        Site.objects.update_or_create(
            id=settings.SITE_ID,
            defaults={'domain': domain, 'name': domain},
        )
    except Exception:
        pass  # table may not exist yet on a fresh DB before migrations run