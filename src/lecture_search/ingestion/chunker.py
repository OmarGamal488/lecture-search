"""Time-based transcript chunking."""

from __future__ import annotations

from typing import Dict, List


class TextChunker:
    """Group Whisper segments into fixed-duration chunks with overlap."""

    def __init__(self, chunk_duration: int = 60, overlap: int = 5) -> None:
        self.chunk_duration = chunk_duration
        self.overlap = overlap
        print(
            f"[INIT] TextChunker ready (duration={chunk_duration}s, overlap={overlap}s)"
        )

    def chunk_by_time(self, segments: List[Dict]) -> List[Dict]:
        if not segments:
            return []

        chunks: List[Dict] = []
        current = {
            "text": "",
            "start_time": segments[0]["start"],
            "end_time": segments[0]["start"],
            "segments": [],
        }

        for segment in segments:
            potential_end = segment["end"]
            duration = potential_end - current["start_time"]

            if duration > self.chunk_duration and current["text"]:
                chunks.append(current.copy())
                overlap_start = max(
                    current["start_time"],
                    segment["start"] - self.overlap,
                )
                current = {
                    "text": segment["text"].strip(),
                    "start_time": overlap_start,
                    "end_time": segment["end"],
                    "segments": [segment],
                }
            else:
                if current["text"]:
                    current["text"] += " " + segment["text"].strip()
                else:
                    current["text"] = segment["text"].strip()
                current["end_time"] = segment["end"]
                current["segments"].append(segment)

        if current["text"]:
            chunks.append(current)

        print(f"[OK] Built {len(chunks)} chunks from {len(segments)} segments")
        return chunks
