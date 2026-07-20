"""
Data migration: populate BrowserImage rows from the DEFAULT_BROWSERS list
so the admin doesn't start with an empty catalogue.
"""
from django.db import migrations


def populate_browsers(apps, schema_editor):
    BrowserImage = apps.get_model('browsers', 'BrowserImage')

    from browsers.services import DEFAULT_BROWSERS
    for i, data in enumerate(DEFAULT_BROWSERS):
        BrowserImage.objects.get_or_create(
            slug=data['slug'],
            defaults={
                'display_name': data['display_name'],
                'category': data.get('category', ''),
                'icon_filename': data.get('icon_filename', ''),
                'description': '',
                'enabled': True,
                'requires_spot': False,
                'idle_timeout_override_minutes': data.get('idle_timeout_override_minutes'),
                'sort_order': i,
            }
        )


def remove_browsers(apps, schema_editor):
    pass  # nothing to do on reverse


class Migration(migrations.Migration):

    dependencies = [
        ('browsers', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(populate_browsers, remove_browsers),
    ]
