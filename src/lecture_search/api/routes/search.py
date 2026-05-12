"""Semantic search endpoint."""

from __future__ import annotations

import time
import traceback

from fastapi import APIRouter, HTTPException, Request

from lecture_search.api.schemas import SearchRequest, SearchResponse, SearchResult

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest, request: Request) -> SearchResponse:
    engine = request.app.state.search_engine
    start = time.time()
    try:
        results = engine.search(
            query=req.query,
            top_k=req.top_k,
            video_id=req.video_id,
            use_mmr=req.use_mmr,
            score_threshold=req.score_threshold,
        )
    except Exception as exc:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")

    return SearchResponse(
        success=True,
        query=req.query,
        num_results=len(results),
        results=[SearchResult(**r) for r in results],
        processing_time=time.time() - start,
    )
