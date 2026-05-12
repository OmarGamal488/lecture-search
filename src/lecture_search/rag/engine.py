"""LangChain + DSPy RAG engine for Q&A and summarization over lecture videos.

LLM: any OpenAI-compatible chat-completions endpoint via `langchain-openai`.
     Documented for Lightning AI but works equally well with Together,
     Anyscale, OpenRouter, vLLM, and self-hosted servers.

QA path: a DSPy `LectureQA` module (ChainOfThought). If a compiled few-shot
state is present at `data/compiled/qa_program.json` (built by
`scripts/compile_prompts.py`), it's loaded automatically; otherwise the
program runs zero-shot.

Streaming + summarization stay on LCEL (DSPy 3.x doesn't expose stable
token-level streaming through compiled programs, and the summary task
isn't worth optimizing).

Required env vars:
    LECTURE_SEARCH_LLM_BASE_URL   e.g. https://lightning.ai/api/v1/
    LECTURE_SEARCH_LLM_API_KEY    your provider key
    LECTURE_SEARCH_LLM_MODEL      model name as the provider expects it
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI

from lecture_search.config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_TEMPERATURE,
    LLM_TIMEOUT,
    LLM_TOP_P,
)
from lecture_search.rag.dspy_program import (
    LectureQA,
    configure_dspy_lm,
    load_compiled,
)
from lecture_search.retrieval.vector_store import LectureRetrieverFactory
from lecture_search.storage.database import (
    SessionLocal,
    get_chunks_by_video,
    get_video_by_id,
)
from lecture_search.utils import format_timestamp

QA_TEMPLATE = """You are a helpful AI assistant that answers questions based \
on lecture video transcripts.

CONTEXT FROM LECTURE VIDEOS:
{context}

QUESTION:
{question}

INSTRUCTIONS:
1. Answer the question using ONLY the information provided in the context above.
2. If the context doesn't contain enough information, say so clearly.
3. Be concise and clear.
4. If multiple sources are relevant, synthesize them coherently.
5. Do not invent information that isn't in the context.
6. Cite which video source the information comes from when relevant.

ANSWER:"""

SUMMARY_TEMPLATE = """Summarize the following lecture video content {length_instruction}:

{content}

Focus on the main topics, key points, and important concepts discussed. \
Provide a clear, well-structured summary that captures the essence of the content.

SUMMARY:"""


class RAGConfigurationError(RuntimeError):
    """Raised when the LLM provider is not configured."""


class RAGEngine:
    """Retrieval-augmented Q&A and summarization using LangChain LCEL."""

    def __init__(
        self,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        self.model = model or LLM_MODEL
        self.base_url = base_url or LLM_BASE_URL
        api_key = api_key or LLM_API_KEY

        missing = [
            name
            for name, value in (
                ("LECTURE_SEARCH_LLM_BASE_URL", self.base_url),
                ("LECTURE_SEARCH_LLM_API_KEY", api_key),
            )
            if not value
        ]
        if missing:
            raise RAGConfigurationError(
                f"Missing required env var(s): {', '.join(missing)}. "
                "Set them in .env (see .env.example) or pass to RAGEngine()."
            )

        # ChatOpenAI returns AIMessage; StrOutputParser unwraps to .content
        # so the chain still emits plain strings (verified by smoke test).
        # Used for streaming + summarization paths.
        self.llm = ChatOpenAI(
            model=self.model,
            base_url=self.base_url,
            api_key=api_key,
            temperature=LLM_TEMPERATURE,
            top_p=LLM_TOP_P,
            max_tokens=LLM_MAX_TOKENS,
            timeout=LLM_TIMEOUT,
            max_retries=2,
        )

        self.retrievers = LectureRetrieverFactory()

        # LCEL chain — used for streaming and as a safety fallback.
        qa_prompt = PromptTemplate(
            template=QA_TEMPLATE, input_variables=["context", "question"]
        )
        self.qa_chain = qa_prompt | self.llm | StrOutputParser()

        summary_prompt = PromptTemplate(
            template=SUMMARY_TEMPLATE,
            input_variables=["content", "length_instruction"],
        )
        self.summary_chain = summary_prompt | self.llm | StrOutputParser()

        # DSPy program for non-streaming QA. Configures DSPy's global LM to
        # the same Lightning AI endpoint and loads compiled few-shot state
        # if available.
        self.qa_program: Optional[LectureQA]
        self.using_compiled = False
        if os.getenv("LECTURE_SEARCH_FORCE_ZERO_SHOT") == "1":
            self.qa_program = None
        else:
            try:
                configure_dspy_lm()
                self.qa_program = LectureQA()
                self.using_compiled = load_compiled(self.qa_program)
            except Exception as exc:
                print(f"[WARNING] DSPy init failed: {exc}; falling back to LCEL")
                self.qa_program = None

        mode = (
            "compiled DSPy"
            if self.using_compiled
            else ("zero-shot DSPy" if self.qa_program else "LCEL only")
        )
        print(
            f"[OK] RAGEngine ready (model={self.model}, qa={mode}, "
            f"base_url={self.base_url})"
        )

    # ---- Public API -----------------------------------------------------

    def ask(
        self,
        question: str,
        top_k: int = 5,
        video_id: Optional[int] = None,
        include_sources: bool = True,
        use_mmr: bool = False,
    ) -> Dict:
        retriever = (
            self.retrievers.create_mmr_retriever(
                k=top_k, fetch_k=top_k * 3, lambda_mult=0.5, video_id=video_id
            )
            if use_mmr
            else self.retrievers.create_similarity_retriever(
                k=top_k, video_id=video_id
            )
        )
        docs = retriever.invoke(question)

        if not docs:
            return {
                "answer": "I couldn't find any relevant information in the videos.",
                "sources": [],
                "question": question,
                "num_sources": 0,
            }

        context = self._format_context(docs)
        try:
            if self.qa_program is not None:
                prediction = self.qa_program(context=context, question=question)
                answer = (prediction.answer or "").strip()
            else:
                answer = self.qa_chain.invoke(
                    {"context": context, "question": question}
                ).strip()
        except Exception as exc:
            return {
                "answer": f"Error generating answer: {exc}",
                "sources": [],
                "question": question,
                "num_sources": 0,
            }

        return {
            "answer": answer,
            "question": question,
            "sources": self._format_sources(docs) if include_sources else [],
            "num_sources": len(docs),
        }

    def ask_streaming(
        self,
        question: str,
        top_k: int = 5,
        video_id: Optional[int] = None,
    ):
        retriever = self.retrievers.create_similarity_retriever(
            k=top_k, video_id=video_id
        )
        docs = retriever.invoke(question)
        if not docs:
            yield "I couldn't find any relevant information in the videos."
            return

        context = self._format_context(docs)
        try:
            for chunk in self.qa_chain.stream(
                {"context": context, "question": question}
            ):
                yield chunk
        except Exception as exc:
            yield f"\n[error] {exc}"

    def summarize_video(
        self, video_id: int, summary_length: str = "medium"
    ) -> Dict:
        content = self._get_video_content(video_id)
        if not content:
            return {
                "summary": "Video not found or has no content.",
                "video_id": video_id,
                "length": summary_length,
            }

        instruction = {
            "short": "in 2-3 sentences",
            "medium": "in 1-2 paragraphs",
            "long": "in 3-4 detailed paragraphs",
        }.get(summary_length, "in 1-2 paragraphs")

        try:
            summary = self.summary_chain.invoke(
                {"content": content, "length_instruction": instruction}
            )
        except Exception as exc:
            return {
                "summary": f"Error: {exc}",
                "video_id": video_id,
                "length": summary_length,
            }

        return {
            "summary": summary.strip(),
            "video_id": video_id,
            "length": summary_length,
        }

    # ---- Helpers --------------------------------------------------------

    def _format_context(self, documents: List[Document]) -> str:
        parts: List[str] = []
        db = SessionLocal()
        try:
            for i, doc in enumerate(documents, 1):
                meta = doc.metadata
                try:
                    vid = int(meta.get("video_id", 0))
                except (TypeError, ValueError):
                    vid = 0
                video = get_video_by_id(db, vid) if vid else None
                title = video.title if video else "Unknown"
                ts = format_timestamp(meta.get("start_time", 0))
                parts.append(f"[Source {i} — {title} at {ts}]\n{doc.page_content}\n")
        finally:
            db.close()
        return "\n".join(parts)

    def _format_sources(self, documents: List[Document]) -> List[Dict]:
        sources: List[Dict] = []
        db = SessionLocal()
        try:
            for i, doc in enumerate(documents, 1):
                meta = doc.metadata
                try:
                    vid = int(meta.get("video_id", 0))
                except (TypeError, ValueError):
                    vid = 0
                video = get_video_by_id(db, vid) if vid else None
                title = video.title if video else "Unknown"
                filename = video.filename if video else "Unknown"
                try:
                    chunk_index = int(meta.get("chunk_index", 0))
                except (TypeError, ValueError):
                    chunk_index = 0
                start_time = float(meta.get("start_time", 0.0) or 0.0)
                sources.append(
                    {
                        "rank": i,
                        "chunk_id": f"video{vid}_chunk{chunk_index}",
                        "text": doc.page_content,
                        "video_id": vid,
                        "video_title": title,
                        "video_filename": filename,
                        "start_time": start_time,
                        "end_time": float(meta.get("end_time", 0.0) or 0.0),
                        "chunk_index": chunk_index,
                        "timestamp": format_timestamp(start_time),
                        "similarity_score": 0.0,
                    }
                )
        finally:
            db.close()
        return sources

    def _get_video_content(
        self, video_id: int, max_chunks: int = 30
    ) -> str:
        db = SessionLocal()
        try:
            video = get_video_by_id(db, video_id)
            if not video:
                return ""
            chunks = get_chunks_by_video(db, video_id)
            if len(chunks) > max_chunks:
                step = len(chunks) // max_chunks
                chunks = [chunks[i * step] for i in range(max_chunks)]

            lines = [
                f"Video: {video.title}",
                f"Duration: {format_timestamp(video.duration)}",
                "",
            ]
            for chunk in chunks:
                lines.append(
                    f"[{format_timestamp(chunk.start_time)}] {chunk.text}\n"
                )
            return "\n".join(lines)
        finally:
            db.close()
