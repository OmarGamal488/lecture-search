"""Embedding-based similarity metric for QA evaluation and DSPy compilation.

Uses the same sentence-transformer that powers retrieval, so it adds no new
model weights and reflects the embedding space the rest of the system uses.
"""

from __future__ import annotations

from typing import Optional

import dspy

# Importing this triggers the embedding model load (~430 MB). That's already
# paid by the rest of the package, so the cost here is negligible.
from lecture_search.retrieval.vector_store import embedding_function

QA_SIMILARITY_THRESHOLD: float = 0.65


def _cosine(a: list[float], b: list[float]) -> float:
    # Embeddings from `HuggingFaceEmbeddings` with `normalize_embeddings=True`
    # are unit vectors, so the dot product is the cosine.
    return float(sum(x * y for x, y in zip(a, b)))


def qa_similarity(
    gold: dspy.Example,
    pred: dspy.Prediction,
    trace: Optional[object] = None,
) -> float | bool:
    """Cosine similarity between gold and predicted answers.

    DSPy convention: return a float when used as an eval metric (`trace is None`),
    and a bool when used inside the optimizer trace (so it gates demo selection).
    """
    pred_answer = getattr(pred, "answer", "") or ""
    gold_answer = getattr(gold, "answer", "") or ""

    if not pred_answer.strip() or not gold_answer.strip():
        return 0.0 if trace is None else False

    g = embedding_function.embed_query(gold_answer)
    p = embedding_function.embed_query(pred_answer)
    score = _cosine(g, p)

    if trace is None:
        return score
    return score >= QA_SIMILARITY_THRESHOLD
