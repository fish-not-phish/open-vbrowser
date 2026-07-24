from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('vbsessions', '0006_remove_sessionsharelinkmodel'),
    ]

    operations = [
        migrations.AlterField(
            model_name='opencontainers',
            name='last_ping_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
