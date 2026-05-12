"""FastAPI application factory + lifespan + console entry."""

from __future__ import annotations

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
    # so there's no build step; it lives at <repo>/ui/web.
    ui_dir = Path(__file__).resolve().parents[3] / "ui" / "web"
    if ui_dir.exists():
        app.mount("/app", StaticFiles(directory=str(ui_dir), html=True), name="ui")

        # Redirect bare root to the UI (the existing GET / system endpoint
        # was registered first, so it still serves the API metadata under
        # /api-info — see system.py).

    return app


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
