"""
Centralized configuration. All paths and model selections are env-overridable.

Defaults are repo-root-relative so the package works the same regardless of
CWD. Override via `LECTURE_SEARCH_*` env vars (see `.env.example`).

A `.env` file at the repo root is loaded automatically when `python-dotenv`
is available (it is a runtime dependency). Docker users can rely on
`env_file: .env` in `docker-compose.yml` instead.
"""

from __future__ import annotations

import os
from pathlib import Path

import torch


# Repo root: src/lecture_search/config.py -> parents[2]
BASE_DIR: Path = Path(__file__).resolve().parents[2]

# Soft-load .env so the package works the same whether started via shell,
# IDE, or Docker (which uses env_file directly).
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env", override=False)
except ImportError:
    pass


def _env_path(key: str, default: Path) -> Path:
    return Path(os.getenv(key, str(default)))


def _env_int(key: str, default: int) -> int:
    return int(os.getenv(key, str(default)))


def _env_float(key: str, default: float) -> float:
    return float(os.getenv(key, str(default)))


# ---- Paths --------------------------------------------------------------
DATA_DIR: Path = _env_path("LECTURE_SEARCH_DATA_DIR", BASE_DIR / "data")
VIDEOS_DIR: Path = _env_path("LECTURE_SEARCH_VIDEOS_DIR", DATA_DIR / "videos")
CHROMA_DIR: Path = _env_path("LECTURE_SEARCH_CHROMA_DIR", DATA_DIR / "chroma")
SQLITE_PATH: Path = _env_path("LECTURE_SEARCH_SQLITE_PATH", DATA_DIR / "lectures.db")
TEMP_DIR: Path = _env_path("LECTURE_SEARCH_TEMP_DIR", DATA_DIR / "temp")
LOGS_DIR: Path = _env_path("LECTURE_SEARCH_LOGS_DIR", BASE_DIR / "logs")

# Create everything except CHROMA_DIR (Chroma manages its own dir).
for _dir in (DATA_DIR, VIDEOS_DIR, TEMP_DIR, LOGS_DIR, CHROMA_DIR.parent):
    _dir.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_URL: str = f"sqlite:///{SQLITE_PATH}"

# ---- Models -------------------------------------------------------------
# Default to BAAI/bge-m3 — a strong multilingual retrieval model that
# handles Arabic and English in the same embedding space without the
# English-bias the previous `all-mpnet-base-v2` exhibited. Outputs are
# 1024-d (not 768-d), so existing Chroma vectors must be wiped and
# re-embedded after switching: run `scripts/reembed.py`.
EMBEDDING_MODEL: str = os.getenv(
    "LECTURE_SEARCH_EMBEDDING_MODEL", "BAAI/bge-m3"
)
WHISPER_MODEL: str = os.getenv("LECTURE_SEARCH_WHISPER_MODEL", "medium")

# LLM is provider-neutral: any OpenAI-compatible endpoint works. The defaults
# documented in .env.example point at Lightning AI. Both BASE_URL and
# API_KEY must be set explicitly — the engine fails loudly at startup
# otherwise.
LLM_BASE_URL: str | None = os.getenv("LECTURE_SEARCH_LLM_BASE_URL")
LLM_API_KEY: str | None = os.getenv("LECTURE_SEARCH_LLM_API_KEY")
LLM_MODEL: str = os.getenv(
    "LECTURE_SEARCH_LLM_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct"
)

def _infer_embedding_dim(model: str) -> int:
    """Best-effort dimension lookup for the embedding model we ship with."""
    name = model.lower()
    if "minilm" in name:
        return 384
    if "bge-m3" in name or "e5-large" in name:
        return 1024
    # mpnet, multilingual-mpnet, bge-large-en, etc.
    return 768


EMBEDDING_DIM: int = _infer_embedding_dim(EMBEDDING_MODEL)


def _device_default() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


EMBEDDING_DEVICE: str = (
    os.getenv("LECTURE_SEARCH_EMBEDDING_DEVICE") or _device_default()
)
WHISPER_DEVICE: str = (
    os.getenv("LECTURE_SEARCH_WHISPER_DEVICE") or _device_default()
)

# ---- Processing ---------------------------------------------------------
CHUNK_DURATION: int = _env_int("LECTURE_SEARCH_CHUNK_DURATION", 45)
CHUNK_OVERLAP: int = _env_int("LECTURE_SEARCH_CHUNK_OVERLAP", 10)
DEFAULT_TOP_K: int = _env_int("LECTURE_SEARCH_DEFAULT_TOP_K", 5)
MAX_TOP_K: int = _env_int("LECTURE_SEARCH_MAX_TOP_K", 30)
MIN_SIMILARITY_THRESHOLD: float = _env_float(
    "LECTURE_SEARCH_MIN_SIMILARITY_THRESHOLD", 0.35
)

# ---- LLM generation -----------------------------------------------------
# OpenAI-compatible parameters only. Provider-specific knobs (Ollama's
# top_k / num_ctx) are intentionally absent — most hosted endpoints reject
# unknown params.
LLM_TEMPERATURE: float = _env_float("LECTURE_SEARCH_LLM_TEMPERATURE", 0.2)
LLM_TOP_P: float = _env_float("LECTURE_SEARCH_LLM_TOP_P", 0.9)
LLM_MAX_TOKENS: int = _env_int("LECTURE_SEARCH_LLM_MAX_TOKENS", 1024)
LLM_TIMEOUT: int = _env_int("LECTURE_SEARCH_LLM_TIMEOUT", 120)

# ---- API ----------------------------------------------------------------
API_HOST: str = os.getenv("LECTURE_SEARCH_API_HOST", "0.0.0.0")
API_PORT: int = _env_int("LECTURE_SEARCH_API_PORT", 8000)
API_TITLE: str = "Lecture Search Engine"
API_DESCRIPTION: str = "AI-powered semantic search and Q&A over lecture videos"
API_VERSION: str = "0.2.0"

CORS_ORIGINS: list[str] = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:7860",
    "http://localhost:8080",
    "http://localhost:8501",
    "http://127.0.0.1:7860",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8501",
]

# ---- Uploads ------------------------------------------------------------
MAX_UPLOAD_BYTES: int = _env_int(
    "LECTURE_SEARCH_MAX_UPLOAD_BYTES", 1000 * 1024 * 1024
)
ALLOWED_VIDEO_EXTENSIONS: tuple[str, ...] = (
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".flv",
)
