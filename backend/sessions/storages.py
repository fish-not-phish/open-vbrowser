from storages.backends.s3boto3 import S3Boto3Storage


class OverwriteS3Boto3Storage(S3Boto3Storage):
    """S3 storage backend that overwrites files with the same name."""
    FILE_OVERWRITE = True
