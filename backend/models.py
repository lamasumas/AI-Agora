"""Pydantic models for Agora backend request bodies."""

from pydantic import BaseModel
from typing import Optional, List


class NoteCreate(BaseModel):
    folder_id: Optional[str] = None
    parent_id: Optional[str] = None
    title: str
    body: str
    tags: Optional[List[str]] = []


class NoteUpdate(BaseModel):
    parent_id: Optional[str] = None
    title: str
    body: str
    tags: Optional[List[str]] = []
    folder_id: Optional[str] = None


class CodeRunRequest(BaseModel):
    language: str
    code: str


class ClipRequest(BaseModel):
    url: str
    title: Optional[str] = None
    folder_id: Optional[str] = "shared"
    tags: Optional[List[str]] = []


class TagData(BaseModel):
    tag: str
