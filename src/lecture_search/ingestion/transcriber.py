"""Whisper-based speech-to-text transcription."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import whisper

from lecture_search.config import WHISPER_DEVICE, WHISPER_MODEL


class Transcriber:
    """Transcribe audio files to text using OpenAI Whisper."""

    def __init__(
        self,
        model_name: str = WHISPER_MODEL,
        device: str = WHISPER_DEVICE,
    ) -> None:
        self.model_name = model_name
        self.device = device
        print(f"[INIT] Loading Whisper '{model_name}' on {device}...")
        self.model = whisper.load_model(model_name, device=device)
        print("[OK] Whisper model loaded")

    def transcribe(
        self,
        audio_path: str | Path,
        language: Optional[str] = None,
        task: str = "transcribe",
        verbose: bool = False,
    ) -> Optional[dict]:
        path = Path(audio_path)
        if not path.exists():
            print(f"[ERROR] Audio file not found: {path}")
            return None

        options: dict = {"task": task, "verbose": verbose}
        if language:
            options["language"] = language

        try:
            result = self.model.transcribe(str(path), **options)
        except Exception as exc:
            print(f"[ERROR] Transcription failed: {exc}")
            return None

        print(
            f"[OK] Transcribed (lang={result.get('language', '?')}, "
            f"segments={len(result.get('segments', []))})"
        )
        return result
