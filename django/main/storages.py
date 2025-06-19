from storages.backends.s3boto3 import S3Boto3Storage

class OverwriteS3Boto3Storage(S3Boto3Storage):
    def get_available_name(self, name, max_length=None):
        # If the file exists, remove it before saving the new one
        if self.exists(name):
            self.delete(name)
        return name
