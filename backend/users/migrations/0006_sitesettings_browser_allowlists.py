from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_add_mfa_suspended_ids'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='global_allowed_browser_slugs',
            field=models.TextField(
                blank=True,
                default='[]',
                help_text='JSON list of slugs. Empty = all browsers available to workspaces.',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='default_personal_browser_slugs',
            field=models.TextField(
                blank=True,
                default='[]',
                help_text='JSON list of slugs for personal workspaces. Empty = all globally allowed.',
            ),
        ),
    ]
