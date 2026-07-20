#!/bin/bash
set -e

# ─── Migrations (run by ovb_backend only) ─────────────────────────────────────
# Pass --migrate as the first argument to trigger this block.
# ovb_worker and ovb_beat skip migrations to avoid race conditions on a fresh DB.
if [ "$1" = "--migrate" ]; then
    shift  # remove --migrate; $@ is now the actual command to run

    echo "Running migrations…"
    python manage.py migrate --noinput

    echo "Setting up periodic tasks…"
    python manage.py cont_tasks || true

    echo "Creating superuser if needed…"
    python manage.py shell -c "
from django.contrib.auth.models import User
from allauth.account.models import EmailAddress
import os
if not User.objects.filter(is_superuser=True).exists():
    email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
    password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'changeme')
    user = User.objects.create_superuser(username='admin', email=email, password=password)
    EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
    print('Superuser created:', email)
else:
    print('Superuser already exists.')
"
fi

exec "$@"
