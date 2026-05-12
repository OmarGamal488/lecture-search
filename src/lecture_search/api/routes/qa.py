"""Q&A and summarization endpoints, including streaming."""

from __future__ import annotations

import time
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from lecture_search.api.dependencies import require_rag_engine
from lecture_search.api.schemas import (
    QuestionRequest,
    QuestionResponse,
    SearchResult,
    SummarizeRequest,
    SummarizeResponse,
)

router = APIRouter(tags=["qa"])


@router.post("/ask", response_model=QuestionResponse)
async def ask(
    req: QuestionRequest,
    rag = Depends(require_rag_engine),
) -> QuestionResponse:
    start = time.time()
    try:
        response = rag.ask(
            question=req.question,
            top_k=req.top_k,
            video_id=req.video_id,
            include_sources=req.include_sources,
            use_mmr=req.use_mmr,
        )
    except Exception as exc:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Q&A failed: {exc}")

    sources = (
        [SearchResult(**s) for s in response.get("sources", [])]
        if req.include_sources
        else []
    )
    return QuestionResponse(
        success=True,
        question=req.question,
        answer=response["answer"],
        sources=sources,
        num_sources=response["num_sources"],
        processing_time=time.time() - start,
    )


@router.get("/ask/stream")
async def ask_stream(
    request: Request,
    question: str,
    top_k: int = 5,
    video_id: Optional[int] = None,
):
    rag = require_rag_engine(request)

    def gen():
        try:
            for chunk in rag.ask_streaming(
                question=question, top_k=top_k, video_id=video_id
            ):
                yield chunk
        except Exception as exc:
            yield f"\n[error] {exc}"

    return StreamingResponse(gen(), media_type="text/plain")


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(
    req: SummarizeRequest,
    rag = Depends(require_rag_engine),
) -> SummarizeResponse:
    start = time.time()
    try:
        response = rag.summarize_video(
            video_id=req.video_id, summary_length=req.length
        )
    except Exception as exc:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Summarization failed: {exc}")

    return SummarizeResponse(
        success=True,
        video_id=req.video_id,
        summary=response["summary"],
        length=req.length,
        processing_time=time.time() - start,
    )
