"""Shared test fixtures.

Environment variables are set before any application module is imported, because
database.py and the routers read their configuration at import time.
"""

import os
import shutil
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
TMP_ROOT = Path(tempfile.mkdtemp(prefix="agora-tests-"))

# The cron fixtures are read-only inputs, so copy them somewhere writable.
shutil.copy(REPO_ROOT / "demo" / "cron.json", TMP_ROOT / "cron.json")
shutil.copytree(REPO_ROOT / "demo" / "scripts", TMP_ROOT / "scripts")

os.environ["AGORA_DB_PATH"] = str(TMP_ROOT / "agora.db")
os.environ["UPLOAD_DIR"] = str(TMP_ROOT / "uploads")
os.environ["CRON_JSON_PATH"] = str(TMP_ROOT / "cron.json")
os.environ["CRON_SCRIPTS_DIR"] = str(TMP_ROOT / "scripts")
os.environ["FINANCE_DATA_DIR"] = str(REPO_ROOT / "demo" / "finance")
os.environ["REACT_DIST"] = str(TMP_ROOT / "no-frontend")
os.environ["DEMO_MODE"] = "1"
os.environ["ENABLE_CODE_EXEC"] = "0"
os.environ["CORS_ORIGINS"] = "http://example.test"


@pytest.fixture(scope="session")
def client():
    """A TestClient with the app lifespan applied, so the schema and demo seed run."""
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def finance_dir(tmp_path):
    """Writable copy of the demo CSV fixtures."""
    import shutil

    target = tmp_path / "finance"
    shutil.copytree(REPO_ROOT / "demo" / "finance", target)
    return target
