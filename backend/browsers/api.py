from ninja import Router
from django.http import HttpRequest
from users.auth import session_mfa_auth
from .services import list_available_browsers
from .schemas import BrowserOut

router = Router(tags=["browsers"])


@router.get("/", response=list[BrowserOut], auth=session_mfa_auth)
def get_browsers(request: HttpRequest):
    """Return the list of browser images available to the current user."""
    browsers = list_available_browsers(request.auth)
    return [
        {
            "slug": b.slug,
            "display_name": b.display_name,
            "description": b.description,
            "icon_filename": b.icon_filename,
            "category": b.category,
            "categories": [c.slug for c in b.categories.all()],
            "requires_spot": b.requires_spot,
            "sort_order": b.sort_order,
        }
        for b in browsers
    ]
