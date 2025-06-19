from django.contrib import admin
from .models import *
from allauth.mfa.models import Authenticator
from django.utils.html import format_html

# Register your models here.
@admin.register(Container)
class ContainerAdmin(admin.ModelAdmin):
    list_display = [
        'type',
        'category',
        'active',
        'truncated_url',
        'start_time',
        'closed_at',
        'user_email',
        'capacity_provider',
        'uuid'
    ]
    list_filter = ['active', 'start_time', 'category', 'capacity_provider']

    # Add the search_fields attribute to allow searching by user email
    search_fields = ['user__email', 'ip_address']

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User Email'

    def truncated_url(self, obj):
        max_length = 30  # Set a maximum length for the URL display
        if obj.url:  # Check if the URL is not None
            if len(obj.url) > max_length:
                return format_html(f'<a href="{obj.url}">{obj.url[:max_length]}...</a>')
            return format_html(f'<a href="{obj.url}">{obj.url}</a>')
        return "No URL"

    truncated_url.short_description = 'URL'

@admin.register(OpenContainers)
class OpenContainerAdmin(admin.ModelAdmin):
    list_display = [
        'container',
        'container_uuid',
        'last_ping_at',
        'opened_at',
        'closed_at'
    ]

@admin.register(ExtendProfile)
class ExtendProfileAdmin(admin.ModelAdmin):
    list_display = [
        'user',
    ]

@admin.register(SessionLog)
class SessionLogAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'container',
        'file_path'
    ]