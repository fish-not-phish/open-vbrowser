from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'actor', 'action', 'target_user', 'ip_address')
    list_filter = ('action',)
    search_fields = ('actor__username', 'target_user__username', 'action')
    readonly_fields = ('timestamp', 'actor', 'action', 'target_user', 'ip_address', 'metadata')
    ordering = ('-timestamp',)
