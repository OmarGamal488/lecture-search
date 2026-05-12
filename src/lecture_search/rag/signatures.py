"""DSPy signatures for the lecture-search QA stack.

A signature is a typed declaration of a task: what goes in, what comes out,
and what the LM should do. DSPy compiles signatures into prompts.
"""

from __future__ import annotations

import dspy


class AnswerLectureQuestion(dspy.Signature):
    """Answer a student's question using ONLY the provided lecture excerpts.

    Be concise (1-3 sentences). Cite the source title when relevant.
    If the excerpts do not contain enough information, say so plainly
    instead of inventing an answer.
    """

    context: str = dspy.InputField(
        desc="Numbered lecture excerpts with timestamps."
    )
    question: str = dspy.InputField(desc="The student's question.")
    answer: str = dspy.OutputField(
        desc="A concise, grounded answer in 1-3 sentences."
    )


class GenerateEvalQA(dspy.Signature):
    """Generate one factual question and its grounded answer from a passage.

    The question must be specific enough that its answer is contained in the
    passage. The answer must be 1-3 sentences and only use information from
    the passage. Avoid trivia and yes/no questions.
    """

    passage: str = dspy.InputField(
        desc="A passage from a lecture transcript."
    )
    question: str = dspy.OutputField(
        desc="A focused question whose answer is in the passage."
    )
    answer: str = dspy.OutputField(
        desc="A 1-3 sentence answer grounded in the passage."
    )
