from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import UserProfile, SiteSettings, ExtendProfile, UserLimit, APIKey


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "Profile"


class ExtendProfileInline(admin.StackedInline):
    model = ExtendProfile
    can_delete = False
    verbose_name_plural = "Extended Profile"


class UserLimitInline(admin.StackedInline):
    model = UserLimit
    can_delete = True
    verbose_name_plural = "Resource Limits"


class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline, ExtendProfileInline, UserLimitInline]


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "is_admin"]
    list_filter = ["is_admin"]
    search_fields = ["user__username", "user__email"]


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = [
        "allow_registration", "oidc_enabled", "oidc_provider_type",
        "default_idle_timeout_minutes", "default_max_concurrent_sessions",
        "default_max_session_duration_hours",
    ]


@admin.register(ExtendProfile)
class ExtendProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "phone"]
    search_fields = ["user__username", "user__email"]


@admin.register(UserLimit)
class UserLimitAdmin(admin.ModelAdmin):
    list_display = ["user", "max_concurrent_sessions", "idle_timeout_minutes", "max_session_duration_hours"]
    search_fields = ["user__username", "user__email"]


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "active", "created_at", "last_used_at"]
    list_filter = ["active"]
    search_fields = ["user__username", "name"]
    readonly_fields = ["key", "created_at", "last_used_at"]