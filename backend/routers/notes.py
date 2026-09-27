"""Notes router — all Mental Library note, tag, attachment, tree, stats,
import/export, code execution, and web clipper API endpoints."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Request
from fastapi.responses import FileResponse, Response
from typing import Optional
from datetime import datetime, timedelta, timezone

import sqlite3
import os
import re
import uuid
import hashlib
import shutil
import time
import json
import html as html_module
import subprocess
import ipaddress
import urllib.parse
import socket
import markdown
import markdown.extensions
from markdown.inlinepatterns import InlineProcessor
from xml.etree import ElementTree as etree
import requests
from bs4 import BeautifulSoup

from database import get_db, UPLOAD_DIR
from models import NoteCreate, NoteUpdate, CodeRunRequest, ClipRequest, TagData

router = APIRouter(prefix="/api/notes", tags=["notes"])


# ---------------------------------------------------------------------------
# Wikilinks Extension (used for note HTML rendering)
# ---------------------------------------------------------------------------

class WikilinkProcessor(InlineProcessor):
    def __init__(self, pattern, db_connection):
        super().__init__(pattern)
        self.db = db_connection

    def handleMatch(self, m, data):
        title = m.group(1).strip()

        # Look up note by title
        row = self.db.execute("SELECT id FROM notes WHERE title = ?", (title,)).fetchone()

        if row:
            note_id = row["id"]
            el = etree.Element("a")
            el.set("href", f"/note/{note_id}")
            el.text = title
        else:
            el = etree.Element("span")
            el.set("class", "broken-link")
            el.text = title

        return el, m.start(0), m.end(0)


class WikilinkExtension(markdown.extensions.Extension):
    def __init__(self, db_connection, **kwargs):
        self.db = db_connection
        super().__init__(**kwargs)

    def extendMarkdown(self, md):
        wikilink_pattern = r'\[\[([^\]]+)\]\]'
        wikilink_processor = WikilinkProcessor(wikilink_pattern, self.db)
        md.inlinePatterns.register(wikilink_processor, 'wikilink', 175)


def _js_safe(s: str) -> str:
    """Escape </ sequences in JSON strings so they don't break <script> tags."""
    return s.replace("</", "<\\/")


# ---------------------------------------------------------------------------
# Notes CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_notes(
    parent_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    pinned: Optional[bool] = Query(None),
):
    query = """
        SELECT notes.id, notes.title, notes.body, notes.folder_id, notes.parent_id,
               notes.created_at, notes.updated_at, notes.pinned,
               GROUP_CONCAT(t.name, ',') as tags
        FROM notes
        LEFT JOIN note_tags nt ON notes.id = nt.note_id
        LEFT JOIN tags t ON nt.tag_id = t.id
        WHERE 1=1
    """
    params = []

    if parent_id is not None:
        if parent_id == "":
            query += " AND notes.parent_id IS NULL"
        else:
            query += " AND notes.parent_id = ?"
            params.append(parent_id)

    if search:
        query += " AND (notes.title LIKE ? OR notes.body LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if tag:
        query += " AND t.name = ?"
        params.append(tag)

    if pinned is not None:
        query += " AND notes.pinned = ?"
        params.append(1 if pinned else 0)

    query += " GROUP BY notes.id ORDER BY notes.updated_at DESC"

    def _make_summary(body: str, max_len: int = 200) -> str:
        """Strip markdown and return a short plaintext excerpt."""
        if not body:
            return ""
        text = body
        # Remove code blocks
        text = re.sub(r"```[\s\S]*?```", "", text)
        # Remove inline code
        text = re.sub(r"`[^`]+`", "", text)
        # Remove wikilinks [[...]] -> ...
        text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
        # Remove markdown links [text](url) -> text
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        # Remove headings markers, bold, italic, strikethrough, blockquotes
        text = re.sub(r"[#*_~`>|]", "", text)
        # Collapse whitespace
        text = re.sub(r"\n{2,}", "\n", text).strip()
        if len(text) > max_len:
            text = text[:max_len].rsplit(" ", 1)[0] + "…"
        return text

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        notes = []
        for row in rows:
            note = dict(row)
            note["tags"] = note["tags"].split(",") if note["tags"] else []
            note["summary"] = _make_summary(note.pop("body", ""))
            notes.append(note)
        return notes


@router.post("")
async def create_note(note: NoteCreate):
    note_id = f"note-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    timestamp = int(time.time())

    with get_db() as conn:
        conn.execute(
            "INSERT INTO notes (id, folder_id, parent_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (note_id, note.folder_id, note.parent_id, note.title, note.body, timestamp, timestamp),
        )

        # Add tags if provided
        if note.tags:
            for tag_name in note.tags:
                tag_id = f"tag-{hashlib.md5(tag_name.encode()).hexdigest()[:12]}"
                try:
                    conn.execute(
                        "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
                        (tag_id, tag_name, timestamp),
                    )
                except sqlite3.IntegrityError:
                    pass  # Tag already exists

                try:
                    conn.execute(
                        "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                        (note_id, tag_id),
                    )
                except sqlite3.IntegrityError:
                    pass  # Already linked

        return {"id": note_id}


# MUST be defined before /{note_id} to avoid path-param collision
@router.get("/search")
async def search_notes(q: str = Query("")):
    """Search notes for wikilink autocomplete."""
    if not q or len(q) < 1:
        return []
    with get_db() as conn:
        notes = conn.execute(
            "SELECT id, title FROM notes WHERE title LIKE ? LIMIT 10",
            (f"%{q}%",),
        ).fetchall()
        return [{"id": n["id"], "title": n["title"]} for n in notes]


@router.get("/{note_id}")
async def get_note(note_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        return dict(row)


@router.put("/{note_id}")
async def update_note(note_id: str, note: NoteUpdate):
    timestamp = int(time.time())

    with get_db() as conn:
        existing = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found")

        if note.folder_id is not None:
            conn.execute(
                "UPDATE notes SET title = ?, body = ?, parent_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",
                (note.title, note.body, note.parent_id, note.folder_id, timestamp, note_id),
            )
        else:
            conn.execute(
                "UPDATE notes SET title = ?, body = ?, parent_id = ?, updated_at = ? WHERE id = ?",
                (note.title, note.body, note.parent_id, timestamp, note_id),
            )

        # Replace tags if provided
        if note.tags is not None:
            # Remove existing tags
            conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))

            # Add new tags
            for tag_name in note.tags:
                tag_id = f"tag-{hashlib.md5(tag_name.encode()).hexdigest()[:12]}"
                try:
                    conn.execute(
                        "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
                        (tag_id, tag_name, timestamp),
                    )
                except sqlite3.IntegrityError:
                    pass  # Tag already exists

                try:
                    conn.execute(
                        "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                        (note_id, tag_id),
                    )
                except sqlite3.IntegrityError:
                    pass  # Already linked

        return {"id": note_id}


@router.delete("/{note_id}")
async def delete_note(note_id: str):
    with get_db() as conn:
        # Delete attachments first (cascade will handle this, but explicit for safety)
        attachments = conn.execute(
            "SELECT file_path FROM attachments WHERE note_id = ?", (note_id,)
        ).fetchall()
        for att in attachments:
            if os.path.exists(att["file_path"]):
                os.remove(att["file_path"])

        cursor = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Task toggling
# ---------------------------------------------------------------------------

@router.patch("/{note_id}/toggle-task")
async def toggle_task(note_id: str, task_index: int = Query(..., ge=0)):
    """Toggle a checkbox in a note."""
    with get_db() as conn:
        note = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        body = note["body"]
        lines = body.split("\n")

        # Find the task_index-th checkbox
        found = 0
        for i, line in enumerate(lines):
            if re.match(r"^[\s]*-\s+\[[ x]\]", line):
                if found == task_index:
                    # Toggle the checkbox
                    lines[i] = re.sub(
                        r"-\s+\[([ x])\]",
                        lambda m: f"- [{'x' if m.group(1) == ' ' else ' '}]",
                        line,
                    )
                    break
                found += 1

        if found <= task_index:
            raise HTTPException(status_code=400, detail="Task index out of bounds")

        updated_body = "\n".join(lines)
        timestamp = int(time.time())
        conn.execute(
            "UPDATE notes SET body = ?, updated_at = ? WHERE id = ?",
            (updated_body, timestamp, note_id),
        )

        return {"status": "toggled", "body": updated_body}


# ---------------------------------------------------------------------------
# Pin / unpin
# ---------------------------------------------------------------------------

@router.patch("/{note_id}/pin")
async def toggle_pin(note_id: str, pinned: bool = Query(...)):
    """Toggle pin status on a note."""
    with get_db() as conn:
        note = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        timestamp = int(time.time())
        conn.execute(
            "UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?",
            (1 if pinned else 0, timestamp, note_id),
        )

        return {"status": "pinned" if pinned else "unpinned", "pinned": pinned}


# ---------------------------------------------------------------------------
# Backlinks
# ---------------------------------------------------------------------------

@router.get("/{note_id}/backlinks")
async def get_backlinks(note_id: str):
    """Get notes that link to this note via [[Title]] wikilinks."""
    with get_db() as conn:
        note = conn.execute("SELECT title FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            return []
        safe_title_like = note["title"].replace("%", "\\%").replace("_", "\\_")
        backlinks = conn.execute(
            "SELECT id, title, updated_at FROM notes WHERE id != ? AND body LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 20",
            (note_id, f"%[[{safe_title_like}]]%"),
        ).fetchall()
        return [
            {"id": bl["id"], "title": bl["title"], "updated_at": bl["updated_at"]}
            for bl in backlinks
        ]


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

@router.get("/tags/all", tags=["tags"])
async def list_tags():
    """Return all tags. Mounted at /api/notes/tags/all to avoid collision with /{note_id}."""
    with get_db() as conn:
        return [dict(row) for row in conn.execute("SELECT * FROM tags ORDER BY name").fetchall()]


@router.get("/{note_id}/tags")
async def get_note_tags(note_id: str):
    with get_db() as conn:
        tags = conn.execute(
            """
            SELECT t.name FROM tags t
            JOIN note_tags nt ON t.id = nt.tag_id
            WHERE nt.note_id = ?
            ORDER BY t.name
        """,
            (note_id,),
        ).fetchall()
        return [tag["name"] for tag in tags]


@router.post("/{note_id}/tags")
async def add_tag_to_note(note_id: str, tag_data: TagData):
    tag_name = tag_data.tag.strip()

    if not tag_name:
        raise HTTPException(status_code=400, detail="Tag name is required")

    if len(tag_name) > 100 or "\n" in tag_name:
        raise HTTPException(status_code=400, detail="Invalid tag name")

    timestamp = int(time.time())
    # Generate tag ID from tag name
    tag_id = f"tag-{hashlib.md5(tag_name.encode()).hexdigest()[:12]}"

    with get_db() as conn:
        # Check if note exists
        note = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        # Create tag if it doesn't exist
        try:
            conn.execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
                (tag_id, tag_name, timestamp),
            )
        except sqlite3.IntegrityError:
            pass  # Tag already exists

        # Link note to tag
        try:
            conn.execute(
                "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                (note_id, tag_id),
            )
        except sqlite3.IntegrityError:
            pass  # Already linked

    return {"status": "added"}


@router.delete("/{note_id}/tags/{tag_name}")
async def remove_tag_from_note(note_id: str, tag_name: str):
    with get_db() as conn:
        tag = conn.execute("SELECT id FROM tags WHERE name = ?", (tag_name,)).fetchone()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")

        conn.execute(
            "DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?",
            (note_id, tag["id"]),
        )

    return {"status": "removed"}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post("/{note_id}/attachments")
async def upload_attachment(note_id: str, file: UploadFile = File(...)):
    # Check if note exists
    with get_db() as conn:
        note = conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

    # Validate file type (allow most common file types)
    allowed_extensions = {
        # Documents
        ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt",
        # Spreadsheets
        ".csv", ".xls", ".xlsx", ".ods",
        # Images
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
        # Data
        ".json", ".yaml", ".yml", ".xml", ".toml",
        # Archives
        ".zip", ".tar", ".gz", ".7z",
        # Code
        ".py", ".js", ".ts", ".html", ".css", ".sh", ".sql",
        # Other
        ".mp3", ".mp4", ".wav", ".ogg", ".pdf",
    }
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed")

    # Generate unique filename
    attachment_id = f"att-{uuid.uuid4().hex[:8]}"
    safe_filename = f"{attachment_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Save to database
    timestamp = int(time.time())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO attachments (id, note_id, filename, original_filename, content_type, file_path, file_size, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (attachment_id, note_id, safe_filename, file.filename, file.content_type, file_path, file_size, timestamp),
        )

    return {"id": attachment_id, "filename": file.filename, "original_filename": file.filename, "content_type": file.content_type, "size": file_size}


@router.get("/{note_id}/attachments")
async def list_attachments(note_id: str):
    """List all attachments for a note."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, original_filename, filename, content_type, file_size, created_at FROM attachments WHERE note_id = ? ORDER BY created_at ASC",
            (note_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "filename": r["original_filename"] or r["filename"],
                "content_type": r["content_type"],
                "size": r["file_size"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]


@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: str):
    with get_db() as conn:
        attachment = conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")

        attachment = dict(attachment)

        if not os.path.exists(attachment["file_path"]):
            raise HTTPException(status_code=404, detail="File not found on disk")

        return FileResponse(
            attachment["file_path"],
            media_type=attachment["content_type"],
            filename=attachment["original_filename"],
        )


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(attachment_id: str):
    with get_db() as conn:
        attachment = conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")

        attachment = dict(attachment)

        conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))

    # Delete file from disk after DB record is gone
    if os.path.exists(attachment["file_path"]):
        os.remove(attachment["file_path"])

    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Tree
# ---------------------------------------------------------------------------

tree_router = APIRouter(tags=["tree"])


@tree_router.get("/api/tree")
async def get_tree():
    """Build parent-child tree. Notes with parent_id=NULL are top-level.
    All notes are in a flat hierarchy — no agent folders."""
    with get_db() as conn:
        # Get all notes
        all_notes = conn.execute(
            """
            SELECT id, folder_id, parent_id, title, updated_at
            FROM notes
            ORDER BY title
        """
        ).fetchall()

        # Build children index: parent_id -> [child notes]
        children_map: dict = {}
        for note in all_notes:
            pid = note["parent_id"]
            if pid not in children_map:
                children_map[pid] = []
            children_map[pid].append(note)

        def build_subtree(note_row):
            node = dict(note_row)
            node["children"] = []
            kids = children_map.get(note_row["id"], [])
            for kid in kids:
                node["children"].append(build_subtree(kid))
            return node

        # Build flat tree — top-level notes (no parent) at root
        tree = {}
        for note in all_notes:
            if note["parent_id"] is None:
                tree[note["id"]] = build_subtree(note)

        return tree


# ---------------------------------------------------------------------------
# Stats / Activity
# ---------------------------------------------------------------------------

stats_router = APIRouter(tags=["stats"])


@stats_router.get("/api/stats/activity")
async def get_activity_stats():
    """Get activity data for the last 365 days."""
    with get_db() as conn:
        # Get activity from notes (created and updated)
        cutoff = int((datetime.now() - timedelta(days=365)).timestamp())

        activity = {}

        # Count notes created per day
        created_rows = conn.execute(
            "SELECT created_at FROM notes WHERE created_at >= ?",
            (cutoff,),
        ).fetchall()

        for row in created_rows:
            date_str = datetime.fromtimestamp(row["created_at"]).strftime("%Y-%m-%d")
            activity[date_str] = activity.get(date_str, 0) + 1

        # Count notes updated per day (separate from created)
        updated_rows = conn.execute(
            "SELECT updated_at FROM notes WHERE updated_at >= ?",
            (cutoff,),
        ).fetchall()

        for row in updated_rows:
            date_str = datetime.fromtimestamp(row["updated_at"]).strftime("%Y-%m-%d")
            activity[date_str] = activity.get(date_str, 0) + 1

        return {"dates": activity}


@stats_router.get("/api/stats/summary")
async def get_stats_summary():
    """Get summary statistics for the stats page."""
    with get_db() as conn:
        total_notes = conn.execute("SELECT COUNT(*) as count FROM notes").fetchone()["count"]
        total_tags = conn.execute("SELECT COUNT(*) as count FROM tags").fetchone()["count"]

        week_ago = int((datetime.now() - timedelta(days=7)).timestamp())
        notes_week = conn.execute(
            "SELECT COUNT(*) as count FROM notes WHERE created_at >= ?",
            (week_ago,),
        ).fetchone()["count"]

        month_ago = int((datetime.now() - timedelta(days=30)).timestamp())
        notes_month = conn.execute(
            "SELECT COUNT(*) as count FROM notes WHERE created_at >= ?",
            (month_ago,),
        ).fetchone()["count"]

        most_active_month = conn.execute("""
            SELECT strftime('%Y-%m', datetime(created_at, 'unixepoch')) as month,
                   COUNT(*) as count
            FROM notes
            GROUP BY month
            ORDER BY count DESC
            LIMIT 1
        """).fetchone()

        most_active = most_active_month["month"] if most_active_month else "N/A"

        top_tags = conn.execute("""
            SELECT t.name, COUNT(*) as count
            FROM tags t
            JOIN note_tags nt ON t.id = nt.tag_id
            GROUP BY t.id
            ORDER BY count DESC
            LIMIT 10
        """).fetchall()

        return {
            "total_notes": total_notes,
            "total_tags": total_tags,
            "notes_week": notes_week,
            "notes_month": notes_month,
            "most_active_month": most_active,
            "top_tags": [{"name": t["name"], "count": t["count"]} for t in top_tags],
        }


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

graph_router = APIRouter(tags=["graph"])


@graph_router.get("/api/graph")
async def get_graph_data():
    """Get nodes and edges for the knowledge graph visualization."""
    with get_db() as conn:
        notes = conn.execute(
            "SELECT id, parent_id, title FROM notes ORDER BY title"
        ).fetchall()

        # Only fetch bodies with wikilinks for edge extraction
        wikilink_notes = conn.execute(
            "SELECT id, body FROM notes WHERE body LIKE '%[[%'"
        ).fetchall()
        body_map = {n["id"]: n["body"] for n in wikilink_notes}

    note_ids = {n["id"] for n in notes}
    parent_ids = {n["parent_id"] for n in notes if n["parent_id"]}
    title_to_id = {n["title"]: n["id"] for n in notes}

    # Build nodes
    nodes = []
    for n in notes:
        is_parent = n["id"] in parent_ids
        nodes.append({
            "id": n["id"],
            "label": n["title"],
            "color": "#06b6d4" if is_parent else "#94a3b8",
            "font": {"color": "#f1f5f9"},
        })

    # Build edges from parent-child
    edges = []
    seen_edges = set()
    for n in notes:
        if n["parent_id"] and n["parent_id"] in note_ids:
            edge_key = (n["parent_id"], n["id"])
            if edge_key not in seen_edges:
                edges.append({
                    "from": n["parent_id"],
                    "to": n["id"],
                    "arrows": "to",
                    "color": {"color": "#475569"},
                })
                seen_edges.add(edge_key)

    # Build edges from wikilinks [[title]]
    for n in notes:
        body_text = body_map.get(n["id"], "")
        for m in re.finditer(r'\[\[([^\]]+)\]\]', body_text):
            linked_title = m.group(1).strip()
            linked_id = title_to_id.get(linked_title)
            if linked_id and linked_id != n["id"]:
                edge_key = (n["id"], linked_id)
                reverse_key = (linked_id, n["id"])
                if edge_key not in seen_edges and reverse_key not in seen_edges:
                    edges.append({
                        "from": n["id"],
                        "to": linked_id,
                        "color": {"color": "#06b6d4"},
                        "dashes": True,
                    })
                    seen_edges.add(edge_key)

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Export / Import
# ---------------------------------------------------------------------------

export_router = APIRouter(tags=["export"])


@export_router.get("/api/export")
async def export_notes():
    """Export all notes with tags and attachments metadata as JSON backup."""
    with get_db() as conn:
        notes = conn.execute(
            """
            SELECT n.id, n.title, n.body, n.folder_id, n.parent_id,
                   n.created_at, n.updated_at, n.pinned
            FROM notes n
            ORDER BY n.created_at
        """
        ).fetchall()

        all_tags = conn.execute("""
            SELECT nt.note_id, t.name FROM tags t
            JOIN note_tags nt ON t.id = nt.tag_id
            ORDER BY t.name
        """).fetchall()

        all_attachments = conn.execute(
            "SELECT note_id, id, original_filename, file_size, created_at FROM attachments ORDER BY created_at"
        ).fetchall()

        tags_by_note = {}
        for t in all_tags:
            tags_by_note.setdefault(t["note_id"], []).append(t["name"])

        atts_by_note = {}
        for a in all_attachments:
            atts_by_note.setdefault(a["note_id"], []).append(dict(a))

        result = []
        for note in notes:
            result.append(
                {
                    "id": note["id"],
                    "title": note["title"],
                    "body": note["body"],
                    "folder_id": note["folder_id"],
                    "parent_id": note["parent_id"],
                    "created_at": note["created_at"],
                    "updated_at": note["updated_at"],
                    "pinned": bool(note["pinned"]),
                    "tags": tags_by_note.get(note["id"], []),
                    "attachments": atts_by_note.get(note["id"], []),
                }
            )

    now = datetime.now(timezone.utc)
    filename = f"mental-library-backup-{now.strftime('%Y-%m-%d')}.json"
    return Response(
        content=json.dumps(
            {"exported_at": now.isoformat(), "notes": result},
            indent=2,
            ensure_ascii=False,
        ),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@export_router.post("/api/import")
async def import_notes(request: Request):
    """Import notes from a JSON backup file. Skips notes that already exist by ID."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    notes_data = body.get("notes", [])
    if not notes_data:
        raise HTTPException(status_code=400, detail="No notes found in import data")

    imported = 0
    skipped = 0
    tags_added = 0

    with get_db() as conn:
        for note in notes_data:
            existing = conn.execute("SELECT id FROM notes WHERE id = ?", (note.get("id"),)).fetchone()
            if existing:
                skipped += 1
                continue

            conn.execute(
                """
                INSERT INTO notes (id, title, body, folder_id, parent_id, created_at, updated_at, pinned)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    note.get("id"),
                    note.get("title", "Untitled"),
                    note.get("body", ""),
                    note.get("folder_id"),
                    note.get("parent_id"),
                    note.get("created_at", int(time.time())),
                    note.get("updated_at", int(time.time())),
                    1 if note.get("pinned") else 0,
                ),
            )

            for tag_name in note.get("tags", []):
                try:
                    # Ensure tag exists in tags table
                    tag_id = tag_name.lower().replace(" ", "-")
                    conn.execute(
                        "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
                        (tag_id, tag_name, int(time.time())),
                    )
                    conn.execute(
                        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                        (note["id"], tag_id),
                    )
                    tags_added += 1
                except Exception:
                    pass

            imported += 1

    return {"imported": imported, "skipped": skipped, "tags_added": tags_added}


# ---------------------------------------------------------------------------
# Code execution
# ---------------------------------------------------------------------------

code_router = APIRouter(tags=["code"])

# Arbitrary code execution is opt-in. Even with this on, only requests coming
# from the loopback interface are accepted.
ENABLE_CODE_EXEC = os.getenv("ENABLE_CODE_EXEC", "0") == "1"


@code_router.post("/api/run-code")
async def run_code(code_request: CodeRunRequest, request: Request):
    """Execute Python or JavaScript code with timeout."""
    if not ENABLE_CODE_EXEC:
        raise HTTPException(
            status_code=403,
            detail="Code execution is disabled. Set ENABLE_CODE_EXEC=1 to enable it.",
        )

    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Code execution only allowed from localhost")

    if code_request.language not in ["python", "javascript"]:
        raise HTTPException(status_code=400, detail="Unsupported language")

    try:
        if code_request.language == "python":
            # Run Python with subprocess and timeout
            result = subprocess.run(
                ["python3", "-c", code_request.code],
                capture_output=True,
                text=True,
                timeout=5,
            )
            output = result.stdout
            error = result.stderr if result.stderr else None
            if result.returncode != 0 and not error:
                error = f"Exit code: {result.returncode}"
        else:  # JavaScript
            # Run JavaScript with Node.js
            result = subprocess.run(
                ["node", "-e", code_request.code],
                capture_output=True,
                text=True,
                timeout=5,
            )
            output = result.stdout
            error = result.stderr if result.stderr else None
            if result.returncode != 0 and not error:
                error = f"Exit code: {result.returncode}"

        return {
            "output": output or "",
            "error": error,
        }
    except subprocess.TimeoutExpired:
        return {
            "output": "",
            "error": "Execution timeout (5s limit)",
        }
    except Exception as e:
        return {
            "output": "",
            "error": f"Execution error: {str(e)}",
        }


# ---------------------------------------------------------------------------
# Web clipper
# ---------------------------------------------------------------------------

clip_router = APIRouter(tags=["clip"])


def _validate_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs allowed")
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")
    try:
        ip = socket.gethostbyname(hostname)
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            raise HTTPException(status_code=400, detail="URL resolves to private/internal network")
    except socket.gaierror:
        pass
    return url


@clip_router.post("/api/clip")
async def clip_webpage(request: ClipRequest):
    """Clip a webpage and create a note from it."""
    _validate_url(request.url)
    try:
        # Fetch the webpage with manual redirect handling (max 3)
        headers = {"User-Agent": "Mozilla/5.0 (compatible; MentalLibrary/1.0)"}
        url = request.url
        for _ in range(4):
            response = requests.get(url, headers=headers, timeout=10, allow_redirects=False)
            if response.is_redirect and response.headers.get("Location"):
                url = _validate_url(response.headers["Location"])
                continue
            break
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.text, "html.parser")

        # Extract title (from <title> or meta og:title)
        title = request.title
        if not title:
            title_tag = soup.find("title")
            if title_tag:
                title = title_tag.get_text().strip()
            else:
                og_title = soup.find("meta", property="og:title")
                if og_title:
                    title = og_title.get("content", "").strip()

        if not title:
            title = request.url

        # Extract main content (strip HTML tags)
        # Remove script, style, nav, footer elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
            element.decompose()

        # Try to find main content area
        main_content = (
            soup.find("main")
            or soup.find("article")
            or soup.find("div", class_=re.compile(r"content|article|post"))
            or soup.body
        )

        if main_content:
            text = main_content.get_text(separator="\n", strip=True)
        else:
            text = soup.get_text(separator="\n", strip=True)

        # Limit to ~2000 chars
        if len(text) > 2000:
            text = text[:2000] + "..."

        # Create note body
        note_body = f"Clipped from: {request.url}\n\n{text}"

        # Create note
        note_id = f"note-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        timestamp = int(time.time())

        with get_db() as conn:
            conn.execute(
                "INSERT INTO notes (id, folder_id, parent_id, title, body, created_at, updated_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                (note_id, request.folder_id, None, title, note_body, timestamp, timestamp),
            )

            # Add tags if provided
            if request.tags:
                for tag_name in request.tags:
                    tag_id = f"tag-{hashlib.md5(tag_name.encode()).hexdigest()[:12]}"
                    try:
                        conn.execute(
                            "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
                            (tag_id, tag_name, timestamp),
                        )
                    except sqlite3.IntegrityError:
                        pass

                    try:
                        conn.execute(
                            "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)",
                            (note_id, tag_id),
                        )
                    except sqlite3.IntegrityError:
                        pass

            # Return the created note
            note = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
            return dict(note)

    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clip failed: {str(e)}")
