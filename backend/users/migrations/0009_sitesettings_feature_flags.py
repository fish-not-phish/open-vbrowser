from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_sitesettings_allow_personal_workspaces'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='enable_network_logging',
            field=models.BooleanField(
                default=False,
                help_text='When enabled, workspace admins may allow members to capture network traffic logs.',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='enable_file_protection',
            field=models.BooleanField(
                default=False,
                help_text='When enabled, workspace admins may allow members to use file protection.',
            ),
        ),
    ]
