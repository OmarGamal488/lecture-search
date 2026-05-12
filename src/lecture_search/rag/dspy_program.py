"""DSPy program wrapping the lecture-search QA task.

Configures DSPy to use the same OpenAI-compatible endpoint as the rest of
the package. Compiled few-shot state lives at `data/compiled/qa_program.json`
— regenerate via `scripts/compile_prompts.py`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import dspy

from lecture_search.config import (
    DATA_DIR,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_TEMPERATURE,
    LLM_TIMEOUT,
)
from lecture_search.rag.signatures import AnswerLectureQuestion

COMPILED_DIR: Path = DATA_DIR / "compiled"
QA_PROGRAM_PATH: Path = COMPILED_DIR / "qa_program.json"

_configured = False


def configure_dspy_lm(force: bool = False) -> dspy.LM:
    """Configure DSPy's global LM. Idempotent unless force=True."""
    global _configured

    if not LLM_BASE_URL or not LLM_API_KEY:
        raise RuntimeError(
            "LECTURE_SEARCH_LLM_BASE_URL and _API_KEY must be set "
            "(see .env.example) before configuring DSPy."
        )

    # DSPy/LiteLLM routes "openai/<model>" through the OpenAI client to
    # `api_base`, which is exactly the protocol Lightning AI exposes.
    lm = dspy.LM(
        f"openai/{LLM_MODEL}",
        api_base=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model_type="chat",
        temperature=LLM_TEMPERATURE,
        max_tokens=LLM_MAX_TOKENS,
        timeout=LLM_TIMEOUT,
    )

    if force or not _configured:
        dspy.configure(lm=lm)
        _configured = True

    return lm


class LectureQA(dspy.Module):
    """Chain-of-thought QA module over lecture transcripts."""

    def __init__(self) -> None:
        super().__init__()
        self.qa = dspy.ChainOfThought(AnswerLectureQuestion)

    def forward(self, context: str, question: str) -> dspy.Prediction:
        return self.qa(context=context, question=question)


def load_compiled(program: LectureQA, path: Optional[Path] = None) -> bool:
    """Load compiled few-shot state into `program`. Return True if loaded."""
    target = path or QA_PROGRAM_PATH
    if target.exists():
        program.load(str(target))
        return True
    return False
