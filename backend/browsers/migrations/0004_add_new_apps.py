"""
Data migration: add ubuntu, code-server, and terminal browser entries plus the
'os' and 'tools' BrowserCategory rows.  Existing rows are left untouched.
"""
from django.db import migrations


# ─── New categories ───────────────────────────────────────────────────────────

NEW_CATEGORIES = [
    {"slug": "os",    "label": "Operating Systems"},
    {"slug": "tools", "label": "Tools"},
]

# ─── New browser entries ──────────────────────────────────────────────────────
# (slug, display_name, category, icon_filename, idle_timeout_override_minutes)
NEW_BROWSERS = [
    {
        "slug":            "ubuntu",
        "display_name":    "Ubuntu",
        "category":        "os",
        "icon_filename":   "ubuntu.png",
        "idle_timeout_override_minutes": 600,
        "categories":      ["os"],
    },
    {
        "slug":            "code-server",
        "display_name":    "code-server",
        "category":        "tools",
        "icon_filename":   "code-server.png",
        "idle_timeout_override_minutes": 600,
        "categories":      ["tools"],
    },
    {
        "slug":            "terminal",
        "display_name":    "Terminal",
        "category":        "tools",
        "icon_filename":   "terminal.png",
        "idle_timeout_override_minutes": None,
        "categories":      ["tools"],
    },
]

# Also make sure kali gets the 'os' category tag (it already has 'security').
KALI_EXTRA_CATEGORY = "os"


def forwards(apps, schema_editor):
    BrowserImage = apps.get_model('browsers', 'BrowserImage')
    BrowserCategory = apps.get_model('browsers', 'BrowserCategory')

    # 1) Ensure the new categories exist.
    for cat_data in NEW_CATEGORIES:
        BrowserCategory.objects.get_or_create(
            slug=cat_data["slug"],
            defaults={"label": cat_data["label"]},
        )

    # 2) Add new browser rows.
    # Determine sort_order starting point so new entries appear after existing ones.
    max_sort = BrowserImage.objects.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
    next_sort = max_sort + 1

    for i, data in enumerate(NEW_BROWSERS):
        browser, _ = BrowserImage.objects.get_or_create(
            slug=data["slug"],
            defaults={
                "display_name":    data["display_name"],
                "category":        data["category"],
                "icon_filename":   data["icon_filename"],
                "description":     "",
                "enabled":         True,
                "requires_spot":   False,
                "idle_timeout_override_minutes": data["idle_timeout_override_minutes"],
                "sort_order":      next_sort + i,
            },
        )
        # Assign M2M categories.
        for cat_slug in data["categories"]:
            try:
                cat = BrowserCategory.objects.get(slug=cat_slug)
                browser.categories.add(cat)
            except BrowserCategory.DoesNotExist:
                pass

    # 3) Tag kali with the 'os' category as well.
    try:
        kali = BrowserImage.objects.get(slug="kali")
        os_cat = BrowserCategory.objects.get(slug=KALI_EXTRA_CATEGORY)
        kali.categories.add(os_cat)
    except (BrowserImage.DoesNotExist, BrowserCategory.DoesNotExist):
        pass


def backwards(apps, schema_editor):
    pass  # non-destructive reverse


class Migration(migrations.Migration):

    dependencies = [
        ('browsers', '0003_add_browser_categories'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
