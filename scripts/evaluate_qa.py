"""Evaluate the QA program (compiled or zero-shot) on the eval set.

Loads `data/eval.jsonl`, hydrates with retrieval context, and runs
`dspy.Evaluate` with the embedding-similarity metric. By default uses the
compiled program at `data/compiled/qa_program.json` if present.

Usage:
    python scripts/evaluate_qa.py
    python scripts/evaluate_qa.py --zero-shot
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import dspy

from lecture_search.rag.dspy_program import (
    LectureQA,
    configure_dspy_lm,
    load_compiled,
)
from lecture_search.rag.metric import qa_similarity
from lecture_search.retrieval.search import SearchEngine

# Reuse the helper from compile script.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from compile_prompts import build_examples  # noqa: E402


def main(zero_shot: bool = False, num_threads: int = 4) -> None:
    configure_dspy_lm()
    search = SearchEngine()

    examples = build_examples(search)
    if not examples:
        raise SystemExit("No eval examples; run generate_eval_set.py first.")
    print(f"Evaluating on {len(examples)} examples...")

    program = LectureQA()
    if not zero_shot and load_compiled(program):
        print("Using compiled program.")
    else:
        print("Using zero-shot program.")

    evaluator = dspy.Evaluate(
        devset=examples,
        metric=qa_similarity,
        num_threads=num_threads,
        display_progress=True,
        display_table=0,
    )
    score = evaluator(program)
    score = score if isinstance(score, (int, float)) else score.score
    print(f"\nAvg similarity: {score:.3f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zero-shot", action="store_true")
    parser.add_argument("--num-threads", type=int, default=4)
    args = parser.parse_args()
    main(zero_shot=args.zero_shot, num_threads=args.num_threads)
