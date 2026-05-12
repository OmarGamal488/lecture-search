# syntax=docker/dockerfile:1.7
# Multi-stage build: a builder image installs deps and the package wheel,
# the runtime image copies only what's needed.
#
# The React UI is plain HTML + Babel-in-browser (no Node build step), so
# it just gets COPYed into the runtime image and served by FastAPI at
# /app/ via StaticFiles.
#
# Build:   docker build -t lecture-search-api .
# Run:     docker run --rm -p 8000:8000 -v "$PWD/data:/app/data" lecture-search-api

ARG PYTHON_VERSION=3.11

# ---------- Builder ----------
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Build deps for the few wheels that don't ship binaries (e.g. tiktoken on some arches).
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached on lockfile changes only).
#
# `setuptools 81` (Sep 2024) removed the `pkg_resources` module, which
# openai-whisper==20231117's setup.py imports on line 5. Without the
# PIP_CONSTRAINT below, pip's PEP-517 build isolation pulls modern
# setuptools into a fresh sandbox and the whisper wheel build dies with
# `ModuleNotFoundError: No module named 'pkg_resources'`. The constraint
# pins setuptools <81 in *both* the outer env and any build-isolation
# sub-envs so the legacy import keeps working.
COPY pyproject.toml requirements.txt ./
RUN echo "setuptools<81" > /tmp/constraints.txt
ENV PIP_CONSTRAINT=/tmp/constraints.txt
RUN pip install --upgrade pip wheel "setuptools<81" \
 && pip install --prefix=/install -r requirements.txt

# Install our package as a wheel.
COPY src ./src
COPY README.md ./
RUN pip install --prefix=/install --no-deps .

# ---------- API runtime ----------
FROM python:${PYTHON_VERSION}-slim AS api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LECTURE_SEARCH_DATA_DIR=/app/data \
    LECTURE_SEARCH_LOGS_DIR=/app/logs \
    LECTURE_SEARCH_TEMP_DIR=/tmp/lecture-search \
    LECTURE_SEARCH_API_PORT=7860

# FFmpeg is required at runtime for audio extraction + ffprobe.
# HF Spaces default Docker apps to port 7860; we listen there. Local
# `docker compose` overrides LECTURE_SEARCH_API_PORT back to 8000 in
# docker-compose.yml so the host workflow stays on the familiar port.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 app

WORKDIR /app
COPY --from=builder /install /usr/local
# Bake the React UI into the image. FastAPI mounts ui/web/ at /app/.
COPY ui/web /app/ui/web
RUN mkdir -p /app/data /app/logs /tmp/lecture-search \
 && chown -R app:app /app /tmp/lecture-search

USER app
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS "http://localhost:${LECTURE_SEARCH_API_PORT:-7860}/health" || exit 1

CMD ["python", "-m", "lecture_search.api.app"]
