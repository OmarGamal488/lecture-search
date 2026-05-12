"""FastAPI dependency providers backed by `app.state` singletons."""

from __future__ import annotations

from fastapi import HTTPException, Request


def get_video_processor(request: Request):
    processor = getattr(request.app.state, "video_processor", None)
    if processor is None:
        raise RuntimeError("Video processor not initialized")
    return processor


def get_search_engine(request: Request):
    engine = getattr(request.app.state, "search_engine", None)
    if engine is None:
        raise RuntimeError("Search engine not initialized")
    return engine


def require_rag_engine(request: Request):
    rag = getattr(request.app.state, "rag_engine", None)
    if rag is None:
        raise HTTPException(
            status_code=503,
            detail="RAG engine unavailable. Check Ollama is running.",
        )
    return rag


def get_processing_status(request: Request) -> dict:
    return request.app.state.processing_status
