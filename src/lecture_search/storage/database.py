"""Database engine, session factory, and CRUD helpers."""

from __future__ import annotations

from typing import Iterable, List, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from lecture_search.config import SQLALCHEMY_URL, SQLITE_PATH
from lecture_search.storage.models import Base, TranscriptChunk, Video

engine = create_engine(
    SQLALCHEMY_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    print("[OK] Database tables ready")


def get_db() -> Iterable[Session]:
    """FastAPI dependency for a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---- Video CRUD ---------------------------------------------------------


def add_video(
    db: Session,
    filename: str,
    title: str,
    duration: float,
    transcript: Optional[str] = None,
) -> Optional[Video]:
    existing = get_video_by_filename(db, filename)
    if existing:
        return existing
    try:
        video = Video(
            filename=filename,
            title=title,
            duration=duration,
            transcript=transcript,
        )
        db.add(video)
        db.commit()
        db.refresh(video)
        return video
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] add_video failed: {exc}")
        return None


def get_video_by_id(db: Session, video_id: int) -> Optional[Video]:
    return db.query(Video).filter(Video.id == video_id).first()


def get_video_by_filename(db: Session, filename: str) -> Optional[Video]:
    return db.query(Video).filter(Video.filename == filename).first()


def get_all_videos(db: Session) -> List[Video]:
    return db.query(Video).order_by(Video.upload_date.desc()).all()


def update_video_transcript(db: Session, video_id: int, transcript: str) -> bool:
    video = get_video_by_id(db, video_id)
    if not video:
        return False
    video.transcript = transcript
    video.processed = 1
    db.commit()
    return True


def mark_video_processed(db: Session, video_id: int) -> bool:
    video = get_video_by_id(db, video_id)
    if not video:
        return False
    video.processed = 1
    db.commit()
    return True


def delete_video(db: Session, video_id: int) -> bool:
    try:
        video = get_video_by_id(db, video_id)
        if not video:
            return False
        db.delete(video)
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] delete_video failed: {exc}")
        return False


# ---- Chunk CRUD ---------------------------------------------------------


def add_transcript_chunk(
    db: Session,
    video_id: int,
    chunk_index: int,
    text: str,
    start_time: float,
    end_time: float,
    embedding_id: Optional[str] = None,
) -> Optional[TranscriptChunk]:
    try:
        chunk = TranscriptChunk(
            video_id=video_id,
            chunk_index=chunk_index,
            text=text,
            start_time=start_time,
            end_time=end_time,
            embedding_id=embedding_id,
        )
        db.add(chunk)
        db.commit()
        db.refresh(chunk)
        return chunk
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] add_transcript_chunk failed: {exc}")
        return None


def get_chunks_by_video(db: Session, video_id: int) -> List[TranscriptChunk]:
    return (
        db.query(TranscriptChunk)
        .filter(TranscriptChunk.video_id == video_id)
        .order_by(TranscriptChunk.chunk_index)
        .all()
    )


def delete_chunks_by_video(db: Session, video_id: int) -> int:
    try:
        count = (
            db.query(TranscriptChunk)
            .filter(TranscriptChunk.video_id == video_id)
            .delete()
        )
        db.commit()
        return count
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] delete_chunks_by_video failed: {exc}")
        return 0


# ---- Stats --------------------------------------------------------------


def get_database_size_mb() -> float:
    try:
        if SQLITE_PATH.exists():
            return round(SQLITE_PATH.stat().st_size / (1024 * 1024), 2)
        return 0.0
    except Exception:
        return 0.0


def get_database_stats(db: Session) -> dict:
    total_videos = db.query(Video).count()
    processed_videos = db.query(Video).filter(Video.processed == 1).count()
    total_chunks = db.query(TranscriptChunk).count()
    return {
        "total_videos": total_videos,
        "processed_videos": processed_videos,
        "unprocessed_videos": total_videos - processed_videos,
        "total_chunks": total_chunks,
        "database_size_mb": get_database_size_mb(),
    }
