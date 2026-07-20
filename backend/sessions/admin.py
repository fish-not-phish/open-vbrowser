from django.contrib import admin
from .models import Container, OpenContainers, SessionLog


class OpenContainersInline(admin.TabularInline):
    model = OpenContainers
    extra = 0
    readonly_fields = ['last_ping_at', 'opened_at', 'closed_at']


@admin.register(Container)
class ContainerAdmin(admin.ModelAdmin):
    list_display = [
        'uuid', 'type', 'user', 'active', 'capacity_provider',
        'start_time', 'closed_at', 'session_cost_usd', 'workspace',
    ]
    list_filter = ['active', 'type', 'capacity_provider']
    search_fields = ['uuid', 'user__username', 'subdomain', 'ip_address']
    readonly_fields = ['uuid', 'date_created', 'session_token']
    inlines = [OpenContainersInline]


@admin.register(OpenContainers)
class OpenContainersAdmin(admin.ModelAdmin):
    list_display = ['container', 'container_uuid', 'last_ping_at', 'opened_at', 'closed_at']
    search_fields = ['container_uuid']


@admin.register(SessionLog)
class SessionLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'container', 'date_created']
    search_fields = ['user__username']



