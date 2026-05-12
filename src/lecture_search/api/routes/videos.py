"""Video upload, listing, status, details, and deletion."""

from __future__ import annotations

import os
import time
import traceback

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    HTTPException,
    Request,
    UploadFile,
)

from lecture_search.api.schemas import (
    VideoInfo,
    VideoListResponse,
    VideoUploadResponse,
)
from lecture_search.config import (
    ALLOWED_VIDEO_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    VIDEOS_DIR,
)
from lecture_search.retrieval.vector_store import delete_chunks_by_video_id
from lecture_search.storage.database import (
    SessionLocal,
    add_video,
)
from lecture_search.storage.database import delete_video as db_delete_video
from lecture_search.storage.database import (
    get_all_videos,
    get_chunks_by_video,
    get_video_by_filename,
    get_video_by_id,
)
from lecture_search.utils import (
    extract_title_from_filename,
    get_file_size_mb,
    sanitize_filename,
    validate_video_extension,
)

router = APIRouter(tags=["videos"])


def _process_video_task(
    processor,
    processing_status: dict,
    video_id: int,
    filepath: str,
    filename: str,
) -> None:
    """Background task that drives the LangGraph ingestion pipeline.

    Each LangGraph node calls back into `on_step` as it completes so the
    polling UI can advance the 7-stage visualizer instead of jumping from
    "initializing" straight to "completed".
    """
    try:
        processing_status[video_id] = {
            "status": "processing",
            "step": "initializing",  # frontend treats this as "stage 0 active"
            "progress": 5,
            "message": "Starting LangGraph pipeline...",
        }

        def on_step(node_name: str, pct: int) -> None:
            processing_status[video_id] = {
                "status": "processing",
                "step": node_name,
                "progress": pct,
                "message": f"{node_name} ({pct}%)",
            }

        start = time.time()
        result = processor.process_video(filepath, filename, on_step=on_step)
        elapsed = time.time() - start

        if result and result.get("success"):
            processing_status[video_id] = {
                "status": "completed",
                "step": "completed",
                "progress": 100,
                "message": "Processed successfully",
                "num_chunks": result.get("num_chunks", 0),
                "duration": result.get("duration", 0),
                "processing_time": elapsed,
            }
        else:
            err = result.get("error", "Unknown error") if result else "Processing failed"
            processing_status[video_id] = {
                "status": "failed",
                "step": "failed",
                "progress": 0,
                "message": f"Processing failed: {err}",
                "error": err,
            }
    except Exception as exc:
        processing_status[video_id] = {
            "status": "failed",
            "step": "failed",
            "progress": 0,
            "message": f"Processing failed: {exc}",
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not validate_video_extension(file.filename, ALLOWED_VIDEO_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
            ),
        )

    sanitized = sanitize_filename(file.filename)
    filepath = VIDEOS_DIR / sanitized

    db = SessionLocal()
    try:
        existing = get_video_by_filename(db, sanitized)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Video '{sanitized}' is already in the database. "
                    "Delete it first or use a different filename."
                ),
            )
        if filepath.exists():
            os.remove(filepath)
    finally:
        db.close()

    with open(filepath, "wb") as buf:
        buf.write(await file.read())

    if filepath.stat().st_size > MAX_UPLOAD_BYTES:
        os.remove(filepath)
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max: {MAX_UPLOAD_BYTES / (1024 * 1024):.0f}MB",
        )

    size_mb = get_file_size_mb(filepath)

    db = SessionLocal()
    try:
        title = extract_title_from_filename(sanitized)
        video = add_video(db, filename=sanitized, title=title, duration=0.0)
        if not video:
            os.remove(filepath)
            raise HTTPException(status_code=500, detail="Failed to create DB row")
        video_id = video.id
    finally:
        db.close()

    processing_status = request.app.state.processing_status
    processor = request.app.state.video_processor

    processing_status[video_id] = {
        "status": "queued",
        "step": "queued",
        "progress": 0,
        "message": "Queued for processing",
    }

    background_tasks.add_task(
        _process_video_task,
        processor,
        processing_status,
        video_id,
        str(filepath),
        sanitized,
    )

    return VideoUploadResponse(
        success=True,
        message=f"Video uploaded ({size_mb:.1f} MB) and queued for processing",
        video_id=video_id,
        filename=sanitized,
        processing_started=True,
    )


@router.get("/videos/{video_id}/status")
async def video_status(video_id: int, request: Request) -> dict:
    db = SessionLocal()
    try:
        video = get_video_by_id(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        processing_status = request.app.state.processing_status
        if video_id in processing_status:
            status = processing_status[video_id]
        elif video.processed == 1:
            chunks = get_chunks_by_video(db, video_id)
            status = {
                "status": "completed",
                "step": "completed",
                "progress": 100,
                "message": "Processed",
                "num_chunks": len(chunks),
            }
        else:
            status = {
                "status": "pending",
                "step": "pending",
                "progress": 0,
                "message": "Not processed yet",
            }
        return {
            "video_id": video_id,
            "filename": video.filename,
            "title": video.title,
            **status,
        }
    finally:
        db.close()


@router.get("/videos", response_model=VideoListResponse)
async def list_videos() -> VideoListResponse:
    db = SessionLocal()
    try:
        videos = get_all_videos(db)
        items = []
        for v in videos:
            chunks = get_chunks_by_video(db, v.id)
            items.append(
                VideoInfo(
                    id=v.id,
                    filename=v.filename,
                    title=v.title,
                    duration=v.duration,
                    upload_date=v.upload_date,
                    processed=(v.processed == 1),
                    num_chunks=len(chunks) if chunks else None,
                )
            )
        return VideoListResponse(total=len(items), videos=items)
    finally:
        db.close()


@router.get("/videos/{video_id}")
async def video_details(video_id: int) -> dict:
    db = SessionLocal()
    try:
        video = get_video_by_id(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        chunks = get_chunks_by_video(db, video_id)
        return {
            "id": video.id,
            "filename": video.filename,
            "title": video.title,
            "duration": video.duration,
            "upload_date": video.upload_date.isoformat(),
            "processed": (video.processed == 1),
            "transcript": video.transcript,
            "num_chunks": len(chunks),
            "chunks": [
                {
                    "id": c.id,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "start_time": c.start_time,
                    "end_time": c.end_time,
                }
                for c in chunks
            ],
        }
    finally:
        db.close()


@router.delete("/videos/{video_id}")
async def delete_video(video_id: int, request: Request) -> dict:
    db = SessionLocal()
    try:
        video = get_video_by_id(db, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        delete_chunks_by_video_id(video_id)
        ok = db_delete_video(db, video_id)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to delete video")
        path = VIDEOS_DIR / video.filename
        if path.exists():
            os.remove(path)
        request.app.state.processing_status.pop(video_id, None)
        return {"success": True, "message": f"Video {video_id} deleted"}
    finally:
        db.close()
