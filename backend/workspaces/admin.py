from django.contrib import admin
from .models import Workspace, WorkspaceMembership
from .services import deprovision_access_point


class WorkspaceMembershipInline(admin.TabularInline):
    model = WorkspaceMembership
    extra = 1


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'slug', 'created_by', 'created_at',
        'max_concurrent_sessions_per_member', 'idle_timeout_minutes',
    ]
    search_fields = ['name', 'slug']
    inlines = [WorkspaceMembershipInline]

    def delete_queryset(self, request, queryset):
        # Bulk delete via QuerySet.delete() bypasses pre_delete signals, so
        # deprovision each workspace's S3 Files resources explicitly first.
        for obj in queryset:
            deprovision_access_point(obj)
        super().delete_queryset(request, queryset)


@admin.register(WorkspaceMembership)
class WorkspaceMembershipAdmin(admin.ModelAdmin):
    list_display = ['workspace', 'user', 'role', 'joined_at']
    list_filter = ['role']
    search_fields = ['workspace__name', 'user__username']
