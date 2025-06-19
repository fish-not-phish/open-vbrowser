from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status, serializers
from main.models import Container
from main.tasks import start_container, delete_container
from rest_framework.authtoken.models import Token
from drf_spectacular.utils import (
    extend_schema,
    OpenApiParameter,
    OpenApiResponse,
    inline_serializer,
)
import base64

# Global header parameters for documentation
AUTH_HEADER = OpenApiParameter(
    name="Authorization",
    location=OpenApiParameter.HEADER,
    description='Token-based authentication with required prefix "Token"',
    required=True,
    type=str,
)

SPECIAL_KEY_HEADER = OpenApiParameter(
    name="X-Special-Key",
    location=OpenApiParameter.HEADER,
    description="Special integration key required for accessing the API",
    required=True,
    type=str,
)

@extend_schema(exclude=True)
@api_view(['GET'])
def apiOverview(request):
    api_urls = {
        'Create Session': '/create-session/',
        'Get Session': '/get-session/',
        'Terminate Session': '/terminate-session/',
    }
    return Response(api_urls)

@extend_schema(
    summary="Create Session", 
    parameters=[AUTH_HEADER, SPECIAL_KEY_HEADER],
    request=inline_serializer(
        name="CreateSessionRequest",
        fields={
            # The special key is expected to be sent in the header.
            "url": serializers.CharField(
                required=False, default="Z29vZ2xlLmNvbQ==",
                help_text="Base64 encoded URL to open in the session (optional)"
            ),
            "session_type": serializers.CharField(
                required=False, default="vStandard",
                help_text="Session type (optional)"
            ),
        }
    ),
    responses={
        201: inline_serializer(
            name="CreateSessionResponse",
            fields={
                "session_uuid": serializers.UUIDField(),
                "seconds": serializers.IntegerField()
            }
        ),
        400: OpenApiResponse(description="Bad Request"),
        403: OpenApiResponse(description="Forbidden"),
    },
)
@api_view(['POST'])
@permission_classes([])  # Adjust or add authentication as needed.
def api_create_session(request):
    """
    API endpoint to create a new session.
    Expects:
      - The special integration key in the header "X-Special-Key".
      - The API token in the "Authorization" header as "Token <api_token>".
      - Optionally, a JSON payload with:
          - "url": Base64 encoded URL to open in the session (defaults to "google.com" decoded).
          - "session_type": The session type (defaults to "vStandard").
    """
    data = request.data

    # Validate the special integration key from header.
    special_key = request.headers.get("X-Special-Key")
    if special_key != settings.API_SPECIAL_KEY:
        return Response({"error": "Invalid special key."}, status=status.HTTP_403_FORBIDDEN)

    # Extract API token from the Authorization header.
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Token "):
        return Response(
            {"error": "Authorization header missing or improperly formatted."},
            status=status.HTTP_400_BAD_REQUEST
        )
    api_token = auth_header.split(" ")[1]

    try:
        token_obj = Token.objects.get(key=api_token)
    except Token.DoesNotExist:
        return Response({"error": "Invalid API token."}, status=status.HTTP_403_FORBIDDEN)

    user = token_obj.user

    # Check if the user already has an active session or one being provisioned.
    existing_session = Container.objects.filter(user=user).filter(
        Q(active=True) | Q(start_time__isnull=True)
    ).first()

    if existing_session:
        return Response(
            {
                "error": "User already has an active session or one is being provisioned.",
                "session_uuid": existing_session.uuid,
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Enforce Free subscription daily limit: max 3 sessions per day.
    if user.extendprofile.subscription_tier.lower() == 'free':
        start_of_today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_today = start_of_today + timedelta(days=1)
        session_count_today = Container.objects.filter(
            user=user, date_created__range=(start_of_today, end_of_today)
        ).count()
        if session_count_today >= 3:
            return Response(
                {"error": "Free subscription users are limited to 3 sessions per day."},
                status=status.HTTP_403_FORBIDDEN
            )

    # Set defaults for URL and session type if not provided.
    encoded_url = data.get("url", None)
    if encoded_url:
        try:
            # Allow plain text if the default is used.
            url = encoded_url if encoded_url == "google.com" else base64.b64decode(encoded_url).decode("utf-8")
        except Exception:
            return Response({"error": "Invalid base64 URL encoding."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        url = "google.com"
    session_type = data.get("session_type", "vStandard")

    # Create the session (container) record.
    container = Container.objects.create(
        user=user,
        name="api_session",
        port=443,
        active=False,
        type='mullvad',  # Use your desired default browser type.
        url=url,
        category=session_type,
        container_url=None
    )

    # Trigger the asynchronous task to start the container.
    start_container.delay(
        container.uuid,
        container.type,
        container.url,
        user.extendprofile.subscription_tier,
        user.username,
        container.category
    )

    # Return the container UUID as confirmation.
    return Response({"session_uuid": container.uuid, "seconds": 90000}, status=status.HTTP_201_CREATED)

@extend_schema(
    summary="Get Session",
    parameters=[AUTH_HEADER, SPECIAL_KEY_HEADER],
    responses={
        200: inline_serializer(
            name="SessionURLResponse",
            fields={"session_url": serializers.CharField()}
        ),
        400: OpenApiResponse(description="Bad Request"),
        403: OpenApiResponse(description="Forbidden"),
        404: OpenApiResponse(description="Not Found"),
    },
)
@api_view(['GET'])
@permission_classes([])  # Adjust or add authentication as needed.
def api_get_session(request):
    """
    API endpoint to get the session URL of the user's active session.
    Expects:
      - The special integration key in the header "X-Special-Key".
      - The API token in the "Authorization" header as "Token <api_token>".
      - Returns:
        - session_url: URL for accessing the session.
    """
    # Validate the special integration key from header.
    special_key = request.headers.get("X-Special-Key")
    if special_key != settings.API_SPECIAL_KEY:
        return Response({"error": "Invalid special key."}, status=status.HTTP_403_FORBIDDEN)

    # Extract API token from the Authorization header.
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Token "):
        return Response(
            {"error": "Authorization header missing or improperly formatted."},
            status=status.HTTP_400_BAD_REQUEST
        )
    api_token = auth_header.split(" ")[1]

    try:
        token_obj = Token.objects.get(key=api_token)
    except Token.DoesNotExist:
        return Response({"error": "Invalid API token."}, status=status.HTTP_403_FORBIDDEN)

    user = token_obj.user

    # Retrieve the active session container that has a container_url set.
    container = Container.objects.filter(
        user=user,
        active=True,
        container_url__isnull=False
    ).order_by("-date_created").first()

    if not container:
        return Response({"error": "No active session found."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "session_url": f"{container.container_url}/?token={container.uuid}"
    }, status=status.HTTP_200_OK)

@extend_schema(
    summary="Terminate Session",
    description="Terminates the user's active session.",
    parameters=[AUTH_HEADER, SPECIAL_KEY_HEADER],
    request=None,  # No request body
    responses={
        200: inline_serializer(
            name="TerminateSessionResponse",
            fields={"message": serializers.CharField()}
        ),
        400: OpenApiResponse(description="Bad Request"),
        403: OpenApiResponse(description="Forbidden"),
        404: OpenApiResponse(description="Not Found"),
    },
)
@api_view(['POST'])
@permission_classes([])  # Adjust or add authentication as needed.
def api_terminate_session(request):
    """
    API endpoint to terminate the user's active session.
    Expects:
      - The special integration key in the header "X-Special-Key".
      - The API token in the "Authorization" header as "Token <api_token>".
      - The endpoint locates the active session terminates it.
    Returns a confirmation message.
    """
    # Validate the special integration key from header.
    special_key = request.headers.get("X-Special-Key")
    if special_key != settings.API_SPECIAL_KEY:
        return Response({"error": "Invalid special key."}, status=status.HTTP_403_FORBIDDEN)

    # Extract API token from the Authorization header.
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Token "):
        return Response(
            {"error": "Authorization header missing or improperly formatted."},
            status=status.HTTP_400_BAD_REQUEST
        )
    api_token = auth_header.split(" ")[1]

    try:
        token_obj = Token.objects.get(key=api_token)
    except Token.DoesNotExist:
        return Response({"error": "Invalid API token."}, status=status.HTTP_403_FORBIDDEN)

    user = token_obj.user

    # Retrieve the active session container that has a container_url set.
    container = Container.objects.filter(
        user=user,
        active=True,
        container_url__isnull=False
    ).order_by("-date_created").first()

    if not container:
        return Response({"error": "No active session found."}, status=status.HTTP_404_NOT_FOUND)

    # Trigger the asynchronous task to terminate the container.
    delete_container.delay(container.uuid)

    return Response({
        "message": "Session termination initiated."
    }, status=status.HTTP_200_OK)

