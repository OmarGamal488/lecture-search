"""FastAPI application factory + lifespan + console entry."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from lecture_search.config import (
    API_DESCRIPTION,
    API_HOST,
    API_PORT,
    API_TITLE,
    API_VERSION,
    CORS_ORIGINS,
    EMBEDDING_MODEL,
    LLM_MODEL,
    WHISPER_MODEL,
)
from lecture_search.storage.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print(f"Initializing {API_TITLE} v{API_VERSION}")
    print("=" * 60)

    init_db()

    # Heavy imports happen inside lifespan so the package itself imports cheap.
    from lecture_search.ingestion.pipeline import VideoProcessorGraph
    from lecture_search.rag.engine import RAGEngine
    from lecture_search.retrieval.search import SearchEngine

    print("\n[INIT] Building video processor (LangGraph)...")
    app.state.video_processor = VideoProcessorGraph()

    print("\n[INIT] Building search engine...")
    app.state.search_engine = SearchEngine()

    print("\n[INIT] Building RAG engine...")
    try:
        app.state.rag_engine = RAGEngine()
    except Exception as exc:
        print(f"[WARNING] RAG engine init failed: {exc}")
        print("[INFO] /ask, /ask/stream, /summarize will return 503")
        app.state.rag_engine = None

    app.state.processing_status = {}

    print()
    print("=" * 60)
    print(f"READY — http://{API_HOST}:{API_PORT}")
    print(f"  embedding: {EMBEDDING_MODEL}")
    print(f"  whisper:   {WHISPER_MODEL}")
    print(f"  llm:       {LLM_MODEL}")
    print("=" * 60)

    yield

    # No teardown needed; in-memory engines clean up on process exit.


def create_app() -> FastAPI:
    app = FastAPI(
        title=API_TITLE,
        description=API_DESCRIPTION,
        version=API_VERSION,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from lecture_search.api.routes import qa, search, system, videos

    app.include_router(system.router)
    app.include_router(videos.router)
    app.include_router(search.router)
    app.include_router(qa.router)

    # Mount the React UI at /app. The bundle is plain HTML + Babel-in-browser
    # so there's no build step. We probe several candidate locations because
    # the package may be running:
    #   - editable-installed at <repo>/src/...     → <repo>/ui/web
    #   - wheel-installed inside Docker            → /app/ui/web (Dockerfile COPY)
    #   - or pointed at explicitly via env var
    ui_dir = _find_ui_dir()
    if ui_dir is not None:
        app.mount("/app", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        print(f"[INIT] Serving React UI from {ui_dir} at /app/")
    else:
        print("[WARNING] React UI directory not found; /app/ will return 404.")

    return app


def _find_ui_dir() -> Path | None:
    """Resolve the React UI directory across editable/Docker/explicit setups."""
    explicit = os.environ.get("LECTURE_SEARCH_UI_DIR")
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    # Editable install: <repo>/src/lecture_search/api/app.py → parents[3] = <repo>
    candidates.append(Path(__file__).resolve().parents[3] / "ui" / "web")
    # Docker layout: WORKDIR=/app, COPY ui/web /app/ui/web
    candidates.append(Path("/app/ui/web"))
    # CWD-relative fallback (covers running from the repo root).
    candidates.append(Path.cwd() / "ui" / "web")
    for path in candidates:
        if path.exists() and (path / "index.html").exists():
            return path
    return None


app = create_app()


def run() -> None:
    """Console entry point: `lecture-search-api`."""
    import uvicorn

    uvicorn.run(
        "lecture_search.api.app:app",
        host=API_HOST,
        port=API_PORT,
        reload=False,
        timeout_keep_alive=120,
    )


if __name__ == "__main__":
    run()
