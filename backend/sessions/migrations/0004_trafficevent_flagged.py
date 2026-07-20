from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vbsessions", "0003_container_flags_trafficevent_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="trafficevent",
            name="flagged",
            field=models.BooleanField(
                default=False,
                help_text="Manually flagged by the user for later review",
            ),
        ),
        migrations.AddIndex(
            model_name="trafficevent",
            index=models.Index(fields=["container", "flagged"], name="vbsessions__contain_flagged_idx"),
        ),
    ]
