from ninja import Schema
from typing import Optional


class BrowserOut(Schema):
    slug: str
    display_name: str
    description: str
    icon_filename: str
    category: str           # legacy — primary category slug
    categories: list[str]   # all category slugs
    requires_spot: bool
    sort_order: int
