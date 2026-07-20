from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_sitesettings_browser_allowlists'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='allow_workspace_creation',
            field=models.BooleanField(
                default=True,
                help_text='When disabled, only admins can create new workspaces.',
            ),
        ),
    ]
