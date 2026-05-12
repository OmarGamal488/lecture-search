"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    filename = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    duration = Column(Float, nullable=False, default=0.0)
    transcript = Column(Text, nullable=True)
    upload_date = Column(DateTime, default=_utcnow)
    processed = Column(Integer, default=0)

    chunks = relationship(
        "TranscriptChunk",
        back_populates="video",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Video id={self.id} title={self.title!r}>"


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    video_id = Column(
        Integer,
        ForeignKey("videos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    embedding_id = Column(String, nullable=True)

    video = relationship("Video", back_populates="chunks")

    def __repr__(self) -> str:
        return (
            f"<Chunk video_id={self.video_id} index={self.chunk_index} "
            f"{self.start_time}s-{self.end_time}s>"
        )
