from django.contrib import admin
from .models import Workspace, WorkspaceMembership


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


@admin.register(WorkspaceMembership)
class WorkspaceMembershipAdmin(admin.ModelAdmin):
    list_display = ['workspace', 'user', 'role', 'joined_at']
    list_filter = ['role']
    search_fields = ['workspace__name', 'user__username']
