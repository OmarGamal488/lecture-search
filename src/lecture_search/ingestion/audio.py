"""FFmpeg-based audio extraction and duration probing."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional


class AudioExtractor:
    """Extract audio from video files using FFmpeg."""

    def __init__(self, sample_rate: int = 16000) -> None:
        self.sample_rate = sample_rate
        self._check_ffmpeg()
        print(f"[INIT] AudioExtractor ready (sample_rate={sample_rate})")

    def _check_ffmpeg(self) -> None:
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                print("[WARNING] FFmpeg returned non-zero on version probe")
        except FileNotFoundError as exc:
            raise RuntimeError("FFmpeg is required but not installed") from exc

    def extract_audio(
        self,
        video_path: str | Path,
        output_path: str | Path,
        format: str = "wav",
    ) -> bool:
        video = Path(video_path)
        output = Path(output_path)

        if not video.exists():
            print(f"[ERROR] Video file not found: {video}")
            return False

        output.parent.mkdir(parents=True, exist_ok=True)
        print(f"[EXTRACT] {video.name} -> {output.name}")

        cmd = [
            "ffmpeg",
            "-i", str(video),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", str(self.sample_rate),
            "-ac", "1",
            "-y",
            str(output),
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600
            )
        except subprocess.TimeoutExpired:
            print("[ERROR] Audio extraction timed out")
            return False

        if result.returncode != 0:
            print(f"[ERROR] FFmpeg failed: {result.stderr[:500]}")
            return False

        if not output.exists():
            print("[ERROR] Output file was not created")
            return False

        size_mb = output.stat().st_size / (1024 * 1024)
        print(f"[OK] Audio extracted: {output.name} ({size_mb:.2f} MB)")
        return True

    def get_video_duration(self, video_path: str | Path) -> Optional[float]:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=10
            )
        except Exception as exc:
            print(f"[ERROR] ffprobe failed: {exc}")
            return None

        if result.returncode != 0:
            print(f"[ERROR] ffprobe returned non-zero: {result.stderr[:200]}")
            return None

        try:
            return float(result.stdout.strip())
        except ValueError:
            return None
