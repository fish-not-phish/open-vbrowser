from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_sitesettings_allow_workspace_creation'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='allow_personal_workspaces',
            field=models.BooleanField(
                default=True,
                help_text='When disabled, no personal workspace is created for new users.',
            ),
        ),
    ]
