"""Agora backend — FastAPI application assembling all routers."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from demo_seed import maybe_seed
from routers.notes import (
    router as notes_router,
    tree_router,
    stats_router,
    export_router,
    code_router,
    clip_router,
    graph_router,
)
from routers.finance import router as finance_router
from routers.calendar import router as calendar_router
from routers.cron import router as cron_router

DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1"


@asynccontextmanager
async def lifespan(app):
    init_db()
    maybe_seed()
    yield

app = FastAPI(title="Agora", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS — allow specific origins (comma-separated CORS_ORIGINS, env-driven)
# ---------------------------------------------------------------------------

DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:8000,http://localhost:8080"

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    return {"status": "ok", "demo": DEMO_MODE}


# ---------------------------------------------------------------------------
# Mount API routers
# ---------------------------------------------------------------------------

# Notes CRUD (prefix /api/notes)
app.include_router(notes_router)

# Tree, stats, export/import, code, clip — these have their own full paths
app.include_router(tree_router)
app.include_router(stats_router)
app.include_router(export_router)
app.include_router(code_router)
app.include_router(clip_router)
app.include_router(graph_router)

# Finance (prefix /api/finance)
app.include_router(finance_router)

# Calendar (prefix /api/calendar)
app.include_router(calendar_router)

# Cron (prefix /api/cron)
app.include_router(cron_router)


# ---------------------------------------------------------------------------
# Serve React SPA from REACT_DIST (default /app/frontend)
# ---------------------------------------------------------------------------

REACT_DIST = os.getenv("REACT_DIST", "/app/frontend")


def _register_spa_routes():
    """Register SPA serving routes only when the build directory exists."""
    if not os.path.isdir(REACT_DIST):
        return

    assets_dir = os.path.join(REACT_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="react-assets")

    @app.get("/")
    async def serve_index():
        """Serve the React SPA index.html for the root path."""
        index_path = os.path.join(REACT_DIST, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return Response("Not Found", status_code=404)

    @app.get("/{filename:path}")
    async def serve_react_spa(filename: str):
        """Catch-all: serve React SPA for all non-API routes."""
        file_path = os.path.realpath(os.path.join(REACT_DIST, filename))
        if not file_path.startswith(os.path.realpath(REACT_DIST)):
            return Response("Forbidden", status_code=403)
        if filename and os.path.isfile(file_path):
            return FileResponse(file_path)
        # SPA fallback
        index_path = os.path.join(REACT_DIST, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return Response("Not Found", status_code=404)


_register_spa_routes()
