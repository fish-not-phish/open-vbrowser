from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vbsessions", "0002_trafficevent"),
    ]

    operations = [
        # Container: network logging and file protection feature flags
        migrations.AddField(
            model_name="container",
            name="enable_traffic_log",
            field=models.BooleanField(
                default=False,
                help_text="Whether mitmproxy traffic logging was enabled for this session",
                verbose_name="Network Logging",
            ),
        ),
        migrations.AddField(
            model_name="container",
            name="file_protection",
            field=models.BooleanField(
                default=False,
                help_text="Whether downloaded files were 7z-encrypted for this session",
                verbose_name="File Protection",
            ),
        ),
        # TrafficEvent: store the HTTP method alongside host/url
        migrations.AddField(
            model_name="trafficevent",
            name="method",
            field=models.CharField(
                blank=True,
                default="",
                help_text="HTTP method (GET, POST, …) reported by the container proxy",
                max_length=16,
            ),
        ),
    ]
