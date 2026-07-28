from ninja import Schema
from typing import Optional
from datetime import datetime


class FileEntry(Schema):
    name: str
    is_dir: bool
    size: int = 0
    last_modified: Optional[datetime] = None
    sha256: Optional[str] = None


class FileListOut(Schema):
    path: str
    entries: list[FileEntry]


class HashOut(Schema):
    path: str
    sha256: str


class MkdirIn(Schema):
    path: str


class UploadOut(Schema):
    status: str
    path: str
