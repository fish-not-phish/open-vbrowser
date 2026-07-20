from django.contrib import admin
from .models import Case, Tag, SessionNote


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'created_by', 'workspace', 'created_at']
    list_filter = ['status']
    search_fields = ['name', 'created_by__username']


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name', 'color', 'workspace']
    search_fields = ['name']


@admin.register(SessionNote)
class SessionNoteAdmin(admin.ModelAdmin):
    list_display = ['container', 'author', 'created_at']
    search_fields = ['author__username', 'body']
