"""Semantic search engine over lecture transcript chunks."""

from __future__ import annotations

import time
import traceback
from typing import Dict, List, Optional

from langchain_core.documents import Document

from lecture_search.retrieval.vector_store import (
    LectureRetrieverFactory,
    search_with_scores,
)
from lecture_search.storage.database import SessionLocal, get_video_by_id
from lecture_search.utils import format_timestamp


class SearchEngine:
    """Routes between similarity, MMR, and threshold retrieval strategies."""

    def __init__(self) -> None:
        self.retrievers = LectureRetrieverFactory()
        print("[INIT] SearchEngine ready")

    def search(
        self,
        query: str,
        top_k: int = 5,
        video_id: Optional[int] = None,
        use_mmr: bool = False,
        score_threshold: Optional[float] = None,
    ) -> List[Dict]:
        start = time.time()
        try:
            if score_threshold is not None:
                retriever = self.retrievers.create_threshold_retriever(
                    score_threshold=score_threshold, k=top_k, video_id=video_id
                )
                docs = retriever.invoke(query)
                scores: Optional[List[float]] = None
            elif use_mmr:
                retriever = self.retrievers.create_mmr_retriever(
                    k=top_k,
                    fetch_k=top_k * 3,
                    lambda_mult=0.5,
                    video_id=video_id,
                )
                docs = retriever.invoke(query)
                scores = None
            else:
                filter_dict = (
                    {"video_id": str(video_id)} if video_id is not None else None
                )
                pairs = search_with_scores(
                    query=query, n_results=top_k, filter_dict=filter_dict
                )
                docs = [d for d, _ in pairs]
                scores = [s for _, s in pairs]

            if not docs:
                return []

            results = self._format_results(docs, scores)
            print(
                f"[OK] Search returned {len(results)} results in {time.time() - start:.2f}s"
            )
            return results
        except Exception as exc:
            print(f"[ERROR] search failed: {exc}")
            print(traceback.format_exc())
            return []

    # ---- Helpers --------------------------------------------------------

    def _format_results(
        self,
        documents: List[Document],
        scores: Optional[List[float]] = None,
    ) -> List[Dict]:
        db = SessionLocal()
        try:
            return [
                self._format_one(doc, idx, scores, db)
                for idx, doc in enumerate(documents)
            ]
        finally:
            db.close()

    def _format_one(
        self,
        doc: Document,
        idx: int,
        scores: Optional[List[float]],
        db,
    ) -> Dict:
        meta = doc.metadata
        try:
            video_id = int(meta.get("video_id", 0))
        except (TypeError, ValueError):
            video_id = 0

        video = get_video_by_id(db, video_id) if video_id else None
        title = video.title if video else "Unknown"
        filename = video.filename if video else "Unknown"

        if scores is not None and idx < len(scores):
            similarity = max(0.0, min(1.0, 1 - scores[idx]))
        else:
            similarity = 0.0

        try:
            chunk_index = int(meta.get("chunk_index", 0))
        except (TypeError, ValueError):
            chunk_index = 0

        start_time = float(meta.get("start_time", 0.0) or 0.0)
        end_time = float(meta.get("end_time", 0.0) or 0.0)

        return {
            "rank": idx + 1,
            "chunk_id": f"video{video_id}_chunk{chunk_index}",
            "text": doc.page_content,
            "video_id": video_id,
            "video_title": title,
            "video_filename": filename,
            "start_time": start_time,
            "end_time": end_time,
            "chunk_index": chunk_index,
            "similarity_score": similarity,
            "timestamp": format_timestamp(start_time),
        }
