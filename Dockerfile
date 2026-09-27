# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — FastAPI runtime with the built SPA baked in
# ---------------------------------------------------------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/
COPY --from=frontend /build/dist /app/frontend

RUN mkdir -p /data/uploads

ENV AGORA_DB_PATH=/data/agora.db \
    UPLOAD_DIR=/data/uploads \
    FINANCE_DATA_DIR=/data/finance \
    CRON_JSON_PATH=/data/cron.json \
    CRON_SCRIPTS_DIR=/data/scripts \
    REACT_DIST=/app/frontend

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).read()"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
