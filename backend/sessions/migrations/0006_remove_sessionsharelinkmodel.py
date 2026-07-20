from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('vbsessions', '0005_rename_vbsessions_traffice_contain_idx_vbsessions__contain_350152_idx_and_more'),
    ]

    operations = [
        migrations.DeleteModel(
            name='SessionShareLink',
        ),
    ]
