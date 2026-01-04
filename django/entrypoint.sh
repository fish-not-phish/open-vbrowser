#!/bin/bash
set -e

# Apply migrations
echo "Running makemigrations..."
python3 manage.py makemigrations --noinput

echo "Running migrate..."
python3 manage.py migrate --noinput

echo "${DJANGO_SUPERUSER_USERNAME}"

# Create superuser if it doesn't exist
echo "Creating superuser..."
python3 manage.py shell << EOF
from django.contrib.auth import get_user_model
from allauth.account.models import EmailAddress
from main.models import ExtendProfile
from core.models import SiteSetting

User = get_user_model()
username = "${DJANGO_SUPERUSER_USERNAME}"
email = "${DJANGO_SUPERUSER_EMAIL}"
password = "${DJANGO_SUPERUSER_PASSWORD}"

site_settings, created = SiteSetting.objects.get_or_create(
    pk=1,
    defaults={"signups": True},
)

if not User.objects.filter(email=email).exists():
    user = User.objects.create_superuser(
        username=username,
        email=email,
        password=password
    )

    EmailAddress.objects.create(
        user=user,
        email=email,
        verified=True,
        primary=True
    )

user = User.objects.get(email=email)
if not hasattr(user, "extendprofile"):
    ExtendProfile.objects.create(user=user, phone=None)
EOF

# Start supervisord
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
