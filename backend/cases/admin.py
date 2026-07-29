from django.contrib import admin
from .models import Case, Tag, SessionNote, CaseAttachment, CaseFileLink


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


@admin.register(CaseAttachment)
class CaseAttachmentAdmin(admin.ModelAdmin):
    list_display = ['filename', 'case', 'uploaded_by', 'size_bytes', 'created_at']
    search_fields = ['filename', 'case__name', 'uploaded_by__username']
    list_filter = ['created_at']


@admin.register(CaseFileLink)
class CaseFileLinkAdmin(admin.ModelAdmin):
    list_display = ['filename', 'case', 'workspace', 'linked_by', 'size_bytes', 'created_at']
    search_fields = ['filename', 's3_path', 'case__name', 'workspace__name']
    list_filter = ['created_at']
