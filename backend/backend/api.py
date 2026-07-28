from ninja_extra import NinjaExtraAPI
from users.api import router as users_router
from sessions.api import router as sessions_router
from browsers.api import router as browsers_router
from workspaces.api import router as workspaces_router
from cases.api import router as cases_router
from notifications.api import router as notifications_router
from files.api import router as files_router

api = NinjaExtraAPI(
    title="Open vBrowser API",
    version="2.0.0",
    docs_url="/docs",
)

api.add_router("/accounts/", users_router)
api.add_router("/v1/sessions/", sessions_router)
api.add_router("/v1/browsers/", browsers_router)
api.add_router("/v1/workspaces/", workspaces_router)
api.add_router("/v1/cases/", cases_router)
api.add_router("/v1/notifications/", notifications_router)
api.add_router("/v1/files/", files_router)
