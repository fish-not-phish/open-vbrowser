from django.apps import AppConfig


class WorkspacesConfig(AppConfig):
    name = 'workspaces'

    def ready(self):
        import workspaces.signals  # noqa: F401 — registers signal handlers
