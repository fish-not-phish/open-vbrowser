from pathlib import Path
from django.conf import settings
from django.db import models as dj_models
from .models import BrowserImage, BrowserAvailabilityRule


# Default browser list — used for initial data migration
DEFAULT_BROWSERS = [
    {"slug": "brave",      "display_name": "Brave",            "category": "browser",  "icon_filename": "brave.png"},
    {"slug": "chrome",     "display_name": "Chrome",           "category": "browser",  "icon_filename": "chrome.png"},
    {"slug": "edge",       "display_name": "Microsoft Edge",   "category": "browser",  "icon_filename": "edge.png"},
    {"slug": "firefox",    "display_name": "Firefox",          "category": "browser",  "icon_filename": "firefox.png"},
    {"slug": "kali",        "display_name": "Kali Linux",       "category": "security", "icon_filename": "kali.png", "idle_timeout_override_minutes": 600},
    {"slug": "ubuntu",      "display_name": "Ubuntu",           "category": "os",       "icon_filename": "ubuntu.png", "idle_timeout_override_minutes": 600},
    {"slug": "code-server", "display_name": "code-server",      "category": "tools",    "icon_filename": "code-server.png", "idle_timeout_override_minutes": 600},
    {"slug": "terminal",    "display_name": "Terminal",         "category": "tools",    "icon_filename": "terminal.png"},
    {"slug": "librewolf",  "display_name": "LibreWolf",        "category": "browser",  "icon_filename": "librewolf.png"},
    {"slug": "mullvad",    "display_name": "Mullvad Browser",  "category": "browser",  "icon_filename": "mullvad.png"},
    {"slug": "palemoon",   "display_name": "Pale Moon",        "category": "browser",  "icon_filename": "palemoon.png"},
    {"slug": "pulse",      "display_name": "Pulse Secure",     "category": "vpn",      "icon_filename": "pulse.png"},
    {"slug": "telegram",   "display_name": "Telegram",         "category": "comms",    "icon_filename": "telegram.png"},
    {"slug": "tor",        "display_name": "Tor Browser",      "category": "browser",  "icon_filename": "tor.png"},
    {"slug": "waterfox",   "display_name": "Waterfox",         "category": "browser",  "icon_filename": "waterfox.png"},
    {"slug": "zen",        "display_name": "Zen Browser",      "category": "browser",  "icon_filename": "zen.png"},
]


def list_available_browsers(user):
    """
    Returns BrowserImage queryset visible to this user, intersected with
    what actually exists on disk under VBROWSERS_PATH (if configured).
    Falls back to all enabled browsers if the path isn't set.
    """
    vbrowsers_path = getattr(settings, 'VBROWSERS_PATH', None)
    if vbrowsers_path and Path(vbrowsers_path).is_dir():
        on_disk = {d.name for d in Path(vbrowsers_path).iterdir() if d.is_dir()}
        qs = BrowserImage.objects.filter(enabled=True, slug__in=on_disk)
    else:
        qs = BrowserImage.objects.filter(enabled=True)

    # Apply availability rules
    browsers_with_rules = BrowserAvailabilityRule.objects.values_list('browser_id', flat=True).distinct()
    user_groups = user.groups.all()
    user_workspace_ids = user.workspacemembership_set.values_list('workspace_id', flat=True)

    # Browsers with no rules are visible to everyone.
    # Browsers with rules are visible only if a matching rule exists for this user.
    return qs.filter(
        dj_models.Q(id__in=browsers_with_rules, rules__user=user) |
        dj_models.Q(id__in=browsers_with_rules, rules__group__in=user_groups) |
        dj_models.Q(id__in=browsers_with_rules, rules__workspace__in=user_workspace_ids) |
        dj_models.Q(~dj_models.Q(id__in=browsers_with_rules))
    ).distinct().prefetch_related('categories').order_by('sort_order', 'display_name')
