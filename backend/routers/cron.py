"""Cron router — list Hermes cron jobs, trigger runs, manage script files."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import os
import httpx

router = APIRouter(prefix="/api/cron", tags=["cron"])

HERMES_API = os.getenv("HERMES_API_URL", "http://skynet:8080")

CRON_JSON = os.getenv("CRON_JSON_PATH", "/data/cron.json")
SCRIPTS_DIR = os.getenv("CRON_SCRIPTS_DIR", "/data/scripts")

# In demo mode the cron fixtures are mounted read-only, so reject writes.
DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1"


class ScriptSave(BaseModel):
    content: str


class CronSync(BaseModel):
    jobs: list


# ── Jobs ──

@router.post("/sync")
async def sync_cron_jobs(body: CronSync):
    """Receive cron job data from Hermes and write to cron.json."""
    if DEMO_MODE:
        raise HTTPException(status_code=403, detail="This endpoint is read-only in demo mode.")

    os.makedirs(os.path.dirname(CRON_JSON) or "/data", exist_ok=True)
    with open(CRON_JSON, "w") as f:
        json.dump({"jobs": body.jobs}, f, indent=2)
    return {"ok": True, "count": len(body.jobs)}

@router.get("/list")
async def list_cron_jobs():
    """Return the synced cron job list."""
    if not os.path.isfile(CRON_JSON):
        return {"jobs": [], "error": "cron.json not found — sync job may not have run yet"}
    with open(CRON_JSON, "r") as f:
        data = json.load(f)
    return data


# ── Trigger ──
@router.post("/{job_id}/trigger")
async def trigger_cron_job(job_id: str):
    """Trigger a Hermes cron job to run now."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{HERMES_API}/api/cron/jobs/{job_id}/trigger")
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot reach Hermes API server — is it running on port 8080?")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


# ── Scripts ──

@router.get("/scripts")
async def list_scripts():
    """List all script files in the scripts directory."""
    if not os.path.isdir(SCRIPTS_DIR):
        os.makedirs(SCRIPTS_DIR, exist_ok=True)
        return {"scripts": []}
    files = []
    for fname in sorted(os.listdir(SCRIPTS_DIR)):
        fpath = os.path.join(SCRIPTS_DIR, fname)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append({
                "name": fname,
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
    return {"scripts": files}


@router.get("/scripts/{filename}")
async def read_script(filename: str):
    """Read a script file's content."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(SCRIPTS_DIR, filename)
    resolved = os.path.realpath(fpath)
    if not resolved.startswith(os.path.realpath(SCRIPTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Script not found")
    with open(fpath, "r") as f:
        content = f.read()
    return {"name": filename, "content": content}


@router.put("/scripts/{filename}")
async def save_script(filename: str, body: ScriptSave):
    """Save a script file."""
    if DEMO_MODE:
        raise HTTPException(status_code=403, detail="This endpoint is read-only in demo mode.")

    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(SCRIPTS_DIR, filename)
    resolved = os.path.realpath(fpath)
    if not resolved.startswith(os.path.realpath(SCRIPTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Script not found")
    with open(fpath, "w") as f:
        f.write(body.content)
    return {"ok": True, "name": filename}
