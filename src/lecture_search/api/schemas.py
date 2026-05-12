"""Pydantic request/response models."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---- Videos -------------------------------------------------------------


class VideoUploadResponse(BaseModel):
    success: bool
    message: str
    video_id: Optional[int] = None
    filename: str
    processing_started: bool = False


class VideoInfo(BaseModel):
    id: int
    filename: str
    title: str
    duration: float
    upload_date: datetime
    processed: bool
    num_chunks: Optional[int] = None


class VideoListResponse(BaseModel):
    total: int
    videos: List[VideoInfo]


# ---- Search -------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=30)
    video_id: Optional[int] = None
    use_mmr: bool = False
    score_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SearchResult(BaseModel):
    rank: int
    chunk_id: str
    text: str
    video_id: int
    video_title: str
    video_filename: str
    start_time: float
    end_time: float
    timestamp: str
    similarity_score: float
    chunk_index: int = 0


class SearchResponse(BaseModel):
    success: bool
    query: str
    num_results: int
    results: List[SearchResult]
    processing_time: Optional[float] = None


# ---- Q&A and summarization ----------------------------------------------


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=30)
    video_id: Optional[int] = None
    include_sources: bool = True
    use_mmr: bool = False


class QuestionResponse(BaseModel):
    success: bool
    question: str
    answer: str
    sources: List[SearchResult] = []
    num_sources: int
    processing_time: Optional[float] = None


class SummarizeRequest(BaseModel):
    video_id: int
    length: str = Field(default="medium", pattern="^(short|medium|long)$")


class SummarizeResponse(BaseModel):
    success: bool
    video_id: int
    summary: str
    length: str
    processing_time: Optional[float] = None
