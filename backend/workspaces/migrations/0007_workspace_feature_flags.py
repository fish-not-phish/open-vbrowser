from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workspaces', '0006_add_workspace_logo'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspace',
            name='enable_network_logging',
            field=models.BooleanField(
                default=False,
                help_text='Allow members of this workspace to use network logging (requires global flag).',
            ),
        ),
        migrations.AddField(
            model_name='workspace',
            name='enable_file_protection',
            field=models.BooleanField(
                default=False,
                help_text='Allow members of this workspace to use file protection (requires global flag).',
            ),
        ),
    ]
