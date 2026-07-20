from django.contrib import admin
from .models import BrowserImage, BrowserAvailabilityRule


class BrowserAvailabilityRuleInline(admin.TabularInline):
    model = BrowserAvailabilityRule
    extra = 1


@admin.register(BrowserImage)
class BrowserImageAdmin(admin.ModelAdmin):
    list_display = [
        'slug', 'display_name', 'category', 'enabled',
        'requires_spot', 'sort_order', 'idle_timeout_override_minutes',
    ]
    list_filter = ['enabled', 'category', 'requires_spot']
    search_fields = ['slug', 'display_name']
    inlines = [BrowserAvailabilityRuleInline]


@admin.register(BrowserAvailabilityRule)
class BrowserAvailabilityRuleAdmin(admin.ModelAdmin):
    list_display = ['browser', 'user', 'group', 'workspace']
