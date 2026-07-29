# Generated for CaseFileLink

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cases', '0005_add_case_attachment'),
        ('workspaces', '0008_workspace_enable_persistent_storage_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CaseFileLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uuid', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('s3_path', models.CharField(help_text='Path relative to the workspace S3 prefix.', max_length=1024)),
                ('filename', models.CharField(max_length=255)),
                ('size_bytes', models.PositiveBigIntegerField(default=0)),
                ('sha256', models.CharField(blank=True, max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('case', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='file_links', to='cases.case')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='case_file_links', to='workspaces.workspace')),
                ('linked_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('case', 's3_path')},
            },
        ),
    ]
