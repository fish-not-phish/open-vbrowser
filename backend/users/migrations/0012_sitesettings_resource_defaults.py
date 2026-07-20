"""
Data migration: update the existing SiteSettings singleton to the new
resource provisioning defaults:
  - browser: 0.5 vCPU, 2.0 GB RAM
  - OS-based (Kali, Ubuntu, Alpine): 2.0 vCPU, 4.0 GB RAM
"""
from django.db import migrations


def set_resource_defaults(apps, schema_editor):
    SiteSettings = apps.get_model('users', 'SiteSettings')
    SiteSettings.objects.update(
        browser_vcpu='0.5',
        browser_memory_gb='2.0',
        os_vcpu='2.0',
        os_memory_gb='4.0',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_sitesettings_resource_provisioning'),
    ]

    operations = [
        migrations.RunPython(set_resource_defaults, migrations.RunPython.noop),
    ]
