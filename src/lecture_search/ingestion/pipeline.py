"""LangGraph state machine for video ingestion.

Linear pipeline: extract_duration -> extract_audio -> transcribe ->
chunk_transcript -> save_to_database -> generate_embeddings -> finalize.

State is a TypedDict; do NOT put SQLAlchemy ORM objects into it (the
checkpointer can't serialize them via msgpack).
"""

from __future__ import annotations

import time
import traceback
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from lecture_search.config import (
    CHUNK_DURATION,
    CHUNK_OVERLAP,
    TEMP_DIR,
    WHISPER_MODEL,
)
from lecture_search.ingestion.audio import AudioExtractor
from lecture_search.ingestion.chunker import TextChunker
from lecture_search.ingestion.transcriber import Transcriber
from lecture_search.retrieval.vector_store import add_chunks_to_vectorstore
from lecture_search.storage.database import (
    SessionLocal,
    add_transcript_chunk,
    get_video_by_filename,
    mark_video_processed,
    update_video_transcript,
)


class VideoProcessingState(TypedDict, total=False):
    video_path: str
    filename: str
    video_id: Optional[int]

    duration: Optional[float]
    audio_path: Optional[str]
    transcript_result: Optional[Dict[str, Any]]
    full_transcript: Optional[str]
    segments: Optional[List[Dict[str, Any]]]
    chunks: Optional[List[Dict[str, Any]]]

    current_step: str
    success: bool
    error: Optional[str]
    processing_time: float
    num_chunks: int
    start_time: float


class VideoProcessorGraph:
    """LangGraph-based video processor with checkpointing."""

    def __init__(self) -> None:
        print("[INIT] Building VideoProcessorGraph...")
        self.audio = AudioExtractor()
        self.transcriber = Transcriber(model_name=WHISPER_MODEL)
        self.chunker = TextChunker(
            chunk_duration=CHUNK_DURATION, overlap=CHUNK_OVERLAP
        )
        self.graph = self._build_graph()
        print("[OK] VideoProcessorGraph ready")

    def _build_graph(self):
        workflow = StateGraph(VideoProcessingState)

        workflow.add_node("extract_duration", self._node_duration)
        workflow.add_node("extract_audio", self._node_audio)
        workflow.add_node("transcribe", self._node_transcribe)
        workflow.add_node("chunk_transcript", self._node_chunk)
        workflow.add_node("save_to_database", self._node_save)
        workflow.add_node("generate_embeddings", self._node_embed)
        workflow.add_node("finalize", self._node_finalize)

        workflow.set_entry_point("extract_duration")
        workflow.add_edge("extract_duration", "extract_audio")
        workflow.add_edge("extract_audio", "transcribe")
        workflow.add_edge("transcribe", "chunk_transcript")
        workflow.add_edge("chunk_transcript", "save_to_database")
        workflow.add_edge("save_to_database", "generate_embeddings")
        workflow.add_edge("generate_embeddings", "finalize")
        workflow.add_edge("finalize", END)

        return workflow.compile(checkpointer=MemorySaver())

    # ---- Nodes ----------------------------------------------------------

    @staticmethod
    def _fail(state: VideoProcessingState, error: str) -> VideoProcessingState:
        state["success"] = False
        state["error"] = error
        state["current_step"] = "error"
        return state

    def _node_duration(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        try:
            print("[1/6] Probing duration...")
            video_path = Path(state["video_path"])
            if not video_path.exists():
                return self._fail(state, f"Video not found: {video_path}")
            duration = self.audio.get_video_duration(str(video_path))
            if duration is None:
                return self._fail(state, "Failed to read video duration")
            state["duration"] = duration
            state["current_step"] = "extract_duration"
            print(f"[INFO] Duration: {duration:.1f}s")
            return state
        except Exception as exc:
            return self._fail(state, f"Duration probe failed: {exc}")

    def _node_audio(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        try:
            print("[2/6] Extracting audio...")
            audio_path = TEMP_DIR / f"audio_{int(time.time() * 1000)}.wav"
            ok = self.audio.extract_audio(state["video_path"], str(audio_path))
            if not ok or not audio_path.exists():
                return self._fail(state, "Audio extraction failed")
            state["audio_path"] = str(audio_path)
            state["current_step"] = "extract_audio"
            return state
        except Exception as exc:
            return self._fail(state, f"Audio extraction failed: {exc}")

    def _node_transcribe(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        audio_path = state.get("audio_path")
        if not audio_path:
            return self._fail(state, "No audio path available")
        try:
            print("[3/6] Transcribing (this can take a while)...")
            result = self.transcriber.transcribe(audio_path)
            if not result:
                Path(audio_path).unlink(missing_ok=True)
                return self._fail(state, "Transcription returned empty")
            state["transcript_result"] = result
            state["full_transcript"] = result.get("text", "")
            state["segments"] = result.get("segments", [])
            state["current_step"] = "transcribe"
            Path(audio_path).unlink(missing_ok=True)
            return state
        except Exception as exc:
            Path(audio_path).unlink(missing_ok=True)
            return self._fail(state, f"Transcription failed: {exc}")

    def _node_chunk(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        try:
            print("[4/6] Chunking transcript...")
            segments = state.get("segments") or []
            chunks = self.chunker.chunk_by_time(segments)
            if not chunks:
                return self._fail(state, "Chunking produced no chunks")
            state["chunks"] = chunks
            state["num_chunks"] = len(chunks)
            state["current_step"] = "chunk_transcript"
            return state
        except Exception as exc:
            return self._fail(state, f"Chunking failed: {exc}")

    def _node_save(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        print("[5/6] Saving chunks to SQLite...")
        db = SessionLocal()
        try:
            video = get_video_by_filename(db, state["filename"])
            if not video:
                return self._fail(state, f"Video row missing: {state['filename']}")

            video_id = video.id
            state["video_id"] = video_id

            update_video_transcript(db, video_id, state.get("full_transcript", ""))
            video.duration = state.get("duration", 0.0)
            db.commit()

            chunks = state.get("chunks") or []
            saved = 0
            for i, chunk in enumerate(chunks):
                rec = add_transcript_chunk(
                    db=db,
                    video_id=video_id,
                    chunk_index=i,
                    text=chunk["text"],
                    start_time=chunk["start_time"],
                    end_time=chunk["end_time"],
                    embedding_id=f"video{video_id}_chunk{i}",
                )
                if rec:
                    saved += 1
            print(f"[OK] Saved {saved}/{len(chunks)} chunks to database")
            state["current_step"] = "save_to_database"
            return state
        except Exception as exc:
            db.rollback()
            return self._fail(state, f"Database save failed: {exc}")
        finally:
            db.close()

    def _node_embed(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        try:
            print("[6/6] Building embeddings...")
            video_id = state.get("video_id")
            chunks = state.get("chunks") or []
            if not video_id or not chunks:
                return self._fail(state, "Missing video_id or chunks")

            ids: List[str] = []
            texts: List[str] = []
            metas: List[Dict] = []
            for i, chunk in enumerate(chunks):
                ids.append(f"video{video_id}_chunk{i}")
                texts.append(chunk["text"])
                metas.append(
                    {
                        "video_id": str(video_id),
                        "chunk_index": str(i),
                        "start_time": str(chunk["start_time"]),
                        "end_time": str(chunk["end_time"]),
                    }
                )

            ok = add_chunks_to_vectorstore(ids, texts, metas)
            if not ok:
                return self._fail(state, "Vector store write failed")
            state["current_step"] = "generate_embeddings"
            return state
        except Exception as exc:
            return self._fail(state, f"Embedding failed: {exc}")

    def _node_finalize(self, state: VideoProcessingState) -> VideoProcessingState:
        if not state.get("success", True):
            return state
        try:
            video_id = state.get("video_id")
            if video_id is None:
                return self._fail(state, "No video_id at finalize")
            db = SessionLocal()
            try:
                mark_video_processed(db, video_id)
            finally:
                db.close()
            elapsed = time.time() - state.get("start_time", time.time())
            state["processing_time"] = elapsed
            state["success"] = True
            state["current_step"] = "completed"
            print(
                f"[DONE] video_id={video_id} chunks={state.get('num_chunks', 0)} "
                f"in {elapsed:.1f}s"
            )
            return state
        except Exception as exc:
            return self._fail(state, f"Finalization failed: {exc}")

    # ---- Public API -----------------------------------------------------

    # Pipeline node order. Used to derive a rough progress % per step and
    # to map a node name back to its index for the UI visualizer.
    NODE_ORDER: List[str] = [
        "extract_duration",
        "extract_audio",
        "transcribe",
        "chunk_transcript",
        "save_to_database",
        "generate_embeddings",
        "finalize",
    ]

    def process_video(
        self,
        video_path: str,
        filename: str,
        on_step: Optional[Callable[[str, int], None]] = None,
    ) -> Dict[str, Any]:
        print(f"\n{'=' * 60}\nPROCESSING: {filename}\n{'=' * 60}")

        initial: VideoProcessingState = {
            "video_path": video_path,
            "filename": filename,
            "video_id": None,
            "duration": None,
            "audio_path": None,
            "transcript_result": None,
            "full_transcript": None,
            "segments": None,
            "chunks": None,
            "current_step": "initialized",
            "success": True,
            "error": None,
            "processing_time": 0.0,
            "num_chunks": 0,
            "start_time": time.time(),
        }
        config = {
            "configurable": {"thread_id": f"{filename}_{int(time.time())}"}
        }

        try:
            final_state: Optional[VideoProcessingState] = None
            total = len(self.NODE_ORDER)
            for state_update in self.graph.stream(initial, config):
                for node_name, node_state in state_update.items():
                    final_state = node_state
                    print(f"[GRAPH] node done: {node_name}")
                    # Surface per-node progress to whoever drives this. The
                    # frontend pipeline visualizer needs intermediate ticks
                    # — without this it sees only "started" and "done".
                    if on_step is not None:
                        try:
                            idx = self.NODE_ORDER.index(node_name)
                            pct = int(round((idx + 1) / total * 100))
                            on_step(node_name, pct)
                        except (ValueError, Exception):  # noqa: BLE001
                            pass

            if final_state is None:
                return {"success": False, "error": "Graph produced no final state"}

            if final_state.get("success"):
                return {
                    "success": True,
                    "video_id": final_state.get("video_id"),
                    "filename": filename,
                    "duration": final_state.get("duration", 0),
                    "num_chunks": final_state.get("num_chunks", 0),
                    "processing_time": final_state.get("processing_time", 0),
                }
            return {"success": False, "error": final_state.get("error", "Unknown")}
        except Exception as exc:
            print(traceback.format_exc())
            return {"success": False, "error": f"Graph exception: {exc}"}
