import base64
from rest_framework import serializers
from main.models import Container

class CreateSessionSerializer(serializers.Serializer):
    special_key = serializers.CharField(required=True)
    api_token = serializers.CharField(required=True)
    # We expect a base64 encoded URL; if not provided, we default to "google.com".
    url = serializers.CharField(required=False, default="google.com")
    session_type = serializers.CharField(required=False, default="vStandard")

    def validate_url(self, value):
        """
        Validate that the URL is valid base64 and decode it.
        If decoding fails, a ValidationError is raised.
        """
        try:
            # If the provided value is the default "google.com", assume it's plain text.
            if value == "google.com":
                return value
            decoded_url = base64.b64decode(value).decode('utf-8')
        except Exception:
            raise serializers.ValidationError("Invalid base64 URL encoding.")
        return decoded_url

class ContainerSerializer(serializers.ModelSerializer):
    # Map the model's uuid field to container_uuid in the output.
    container_uuid = serializers.UUIDField(source='uuid', read_only=True)

    class Meta:
        model = Container
        fields = ('container_uuid', 'container_url')
