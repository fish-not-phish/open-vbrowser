import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vbsessions", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TrafficEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "container",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="traffic_events",
                        to="vbsessions.container",
                    ),
                ),
                (
                    "timestamp",
                    models.DateTimeField(
                        help_text="UTC timestamp reported by the container proxy"
                    ),
                ),
                (
                    "host",
                    models.CharField(
                        help_text="Hostname or raw IP address contacted by the browser",
                        max_length=253,
                    ),
                ),
                (
                    "url",
                    models.TextField(
                        help_text="Full URI including scheme, path, and query string",
                    ),
                ),
                (
                    "recorded_at",
                    models.DateTimeField(auto_now_add=True),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["container", "timestamp"],
                        name="vbsessions_traffice_contain_idx",
                    )
                ],
            },
        ),
    ]
