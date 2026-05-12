"""LangChain Chroma vector store + retriever factory.

Module-level side effect: instantiates the embedding model and Chroma
collection at import time. Don't import this from package `__init__.py`
files — it costs hundreds of MB of RAM and seconds of init time.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

from lecture_search.config import CHROMA_DIR, EMBEDDING_DEVICE, EMBEDDING_MODEL

CHROMA_DIR.mkdir(parents=True, exist_ok=True)

embedding_function = HuggingFaceEmbeddings(
    model_name=EMBEDDING_MODEL,
    model_kwargs={"device": EMBEDDING_DEVICE},
    encode_kwargs={"normalize_embeddings": True},
)
print(f"[OK] Embeddings ready: {EMBEDDING_MODEL} on {EMBEDDING_DEVICE}")

vectorstore = Chroma(
    collection_name="lecture_chunks",
    embedding_function=embedding_function,
    persist_directory=str(CHROMA_DIR),
    collection_metadata={
        "description": "Lecture video transcript chunks with timestamps",
        "embedding_model": EMBEDDING_MODEL,
        "device": EMBEDDING_DEVICE,
    },
)
print(f"[OK] Chroma vectorstore ready at {CHROMA_DIR}")


# ---- Bulk operations ----------------------------------------------------


def add_chunks_to_vectorstore(
    chunk_ids: List[str],
    texts: List[str],
    metadatas: List[Dict],
) -> bool:
    """Add many chunks at once. Metadata values are coerced to str (Chroma req)."""
    try:
        metadatas_str = [{k: str(v) for k, v in m.items()} for m in metadatas]
        vectorstore.add_texts(texts=texts, metadatas=metadatas_str, ids=chunk_ids)
        print(f"[OK] Added {len(chunk_ids)} chunks to vectorstore")
        return True
    except Exception as exc:
        print(f"[ERROR] add_chunks_to_vectorstore failed: {exc}")
        return False


def delete_chunks_by_video_id(video_id: int) -> bool:
    try:
        vectorstore._collection.delete(where={"video_id": str(video_id)})
        print(f"[OK] Deleted vector chunks for video {video_id}")
        return True
    except Exception as exc:
        print(f"[ERROR] delete_chunks_by_video_id failed: {exc}")
        return False


# ---- Search -------------------------------------------------------------


def search_with_scores(
    query: str,
    n_results: int = 5,
    filter_dict: Optional[Dict] = None,
) -> List[tuple[Document, float]]:
    """Similarity search returning (document, distance) tuples."""
    try:
        where = (
            {k: str(v) for k, v in filter_dict.items()} if filter_dict else None
        )
        if where:
            return vectorstore.similarity_search_with_score(
                query=query, k=n_results, filter=where
            )
        return vectorstore.similarity_search_with_score(query=query, k=n_results)
    except Exception as exc:
        print(f"[ERROR] search_with_scores failed: {exc}")
        return []


def get_collection_stats() -> Dict:
    try:
        return {
            "total_chunks": vectorstore._collection.count(),
            "collection_name": "lecture_chunks",
            "embedding_model": EMBEDDING_MODEL,
            "device": EMBEDDING_DEVICE,
            "persist_directory": str(CHROMA_DIR),
        }
    except Exception as exc:
        return {"total_chunks": 0, "error": str(exc)}


# ---- Retrievers ---------------------------------------------------------


class LectureRetrieverFactory:
    """Build LangChain retrievers with consistent filters and search modes."""

    @staticmethod
    def create_similarity_retriever(
        k: int = 5, video_id: Optional[int] = None
    ) -> BaseRetriever:
        kwargs: dict = {"k": k}
        if video_id is not None:
            kwargs["filter"] = {"video_id": str(video_id)}
        return vectorstore.as_retriever(search_type="similarity", search_kwargs=kwargs)

    @staticmethod
    def create_mmr_retriever(
        k: int = 5,
        fetch_k: int = 20,
        lambda_mult: float = 0.5,
        video_id: Optional[int] = None,
    ) -> BaseRetriever:
        kwargs: dict = {"k": k, "fetch_k": fetch_k, "lambda_mult": lambda_mult}
        if video_id is not None:
            kwargs["filter"] = {"video_id": str(video_id)}
        return vectorstore.as_retriever(search_type="mmr", search_kwargs=kwargs)

    @staticmethod
    def create_threshold_retriever(
        score_threshold: float = 0.5,
        k: int = 5,
        video_id: Optional[int] = None,
    ) -> BaseRetriever:
        kwargs: dict = {"score_threshold": score_threshold, "k": k}
        if video_id is not None:
            kwargs["filter"] = {"video_id": str(video_id)}
        return vectorstore.as_retriever(
            search_type="similarity_score_threshold", search_kwargs=kwargs
        )
