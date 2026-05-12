"""Filename, validation, and formatting helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

INVALID_FILENAME_CHARS = '<>:"/\\|?*'


def sanitize_filename(filename: str) -> str:
    for char in INVALID_FILENAME_CHARS:
        filename = filename.replace(char, "_")
    return filename.strip(". ")


def extract_title_from_filename(filename: str) -> str:
    return Path(filename).stem.replace("_", " ").replace("-", " ").title()


def validate_video_extension(filename: str, allowed: Iterable[str]) -> bool:
    return Path(filename).suffix.lower() in {ext.lower() for ext in allowed}


def get_file_size_mb(filepath: Path) -> float:
    return filepath.stat().st_size / (1024 * 1024)


def format_timestamp(seconds: float | int | str) -> str:
    """Format seconds as HH:MM:SS or MM:SS."""
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        return "00:00"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"
