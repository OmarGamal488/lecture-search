"""System-level endpoints: root, health, stats."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from lecture_search.config import (
    API_TITLE,
    API_VERSION,
    EMBEDDING_MODEL,
    LLM_MODEL,
    WHISPER_MODEL,
)
from lecture_search.retrieval.vector_store import get_collection_stats
from lecture_search.storage.database import SessionLocal, get_database_stats

router = APIRouter(tags=["system"])


@router.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    # The React UI is mounted at /app — bare root opens it directly so
    # users typing the host without a path land on the application.
    return RedirectResponse(url="/app/", status_code=307)


@router.get("/api-info")
async def api_info() -> dict:
    return {
        "name": API_TITLE,
        "version": API_VERSION,
        "framework": "LangChain + LangGraph",
        "status": "online",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health")
async def health() -> dict:
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/stats")
async def stats() -> dict:
    db = SessionLocal()
    try:
        db_stats = get_database_stats(db)
    finally:
        db.close()

    vector_stats = get_collection_stats()

    return {
        **db_stats,
        "embedding_model": EMBEDDING_MODEL,
        "llm_model": LLM_MODEL,
        "whisper_model": WHISPER_MODEL,
        "vector_store_chunks": vector_stats.get("total_chunks", 0),
        "framework": "LangChain + LangGraph",
    }
