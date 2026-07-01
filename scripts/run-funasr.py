#!/usr/bin/env python3
"""Run SenseVoiceSmall behind a JSON-only process contract."""

from __future__ import annotations

import argparse
import contextlib
import importlib.metadata
import json
import re
import sys
import wave
from pathlib import Path
from typing import Any


TAG_PATTERN = re.compile(r"<\|[^|>]+\|>")

# SenseVoiceSmall has no sentence_info (that requires a punc_model + paraformer-style
# token timestamps). Real sentence boundaries are recovered from output_timestamp's
# word-level timestamps instead, by splitting on speech pauses.
SEGMENT_PAUSE_MS = 600


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run local FunASR transcription")
    parser.add_argument("--audio")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--model", default="iic/SenseVoiceSmall")
    parser.add_argument("--vad-model", default="fsmn-vad")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--preload", action="store_true")
    return parser.parse_args()


def audio_duration(audio_path: Path) -> float | None:
    try:
        with wave.open(str(audio_path), "rb") as audio_file:
            rate = audio_file.getframerate()
            return audio_file.getnframes() / rate if rate else None
    except (wave.Error, OSError):
        return None


def clean_text(value: Any, postprocess) -> str:
    text = str(value or "")
    try:
        text = postprocess(text)
    except Exception:
        pass
    return TAG_PATTERN.sub("", text).strip()


def milliseconds_to_seconds(value: Any) -> float:
    try:
        return max(0.0, float(value) / 1000.0)
    except (TypeError, ValueError):
        return 0.0


def sentence_segments(results: list[dict[str, Any]], postprocess) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for result in results:
        sentences = result.get("sentence_info")
        if not isinstance(sentences, list):
            continue
        for sentence in sentences:
            if not isinstance(sentence, dict):
                continue
            text = clean_text(sentence.get("text"), postprocess)
            if not text:
                continue
            start = milliseconds_to_seconds(sentence.get("start"))
            end = max(start, milliseconds_to_seconds(sentence.get("end")))
            segments.append(
                {
                    "index": len(segments),
                    "start": start,
                    "end": end,
                    "speaker": None,
                    "text": text,
                    "words": [],
                }
            )
    return segments


def join_words(words: list[str]) -> str:
    parts: list[str] = []
    previous = ""
    for word in words:
        if previous and previous[-1:].isascii() and previous[-1:].isalnum() and word[:1].isascii() and word[:1].isalnum():
            parts.append(" ")
        parts.append(word)
        previous = word
    return "".join(parts)


def sentence_segments_from_words(
    words: list[str],
    timestamps: list[list[float]],
    postprocess,
    max_segment_ms: float,
) -> list[dict[str, Any]]:
    groups: list[list[tuple[str, float, float]]] = []
    group: list[tuple[str, float, float]] = []
    for word, point in zip(words, timestamps):
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        start, end = float(point[0]), float(point[1])
        if group:
            gap = start - group[-1][2]
            duration = end - group[0][1]
            if gap > SEGMENT_PAUSE_MS or duration > max_segment_ms:
                groups.append(group)
                group = []
        group.append((word, start, end))
    if group:
        groups.append(group)

    segments: list[dict[str, Any]] = []
    for group in groups:
        text = clean_text(join_words([item[0] for item in group]), postprocess)
        if not text:
            continue
        segments.append(
            {
                "index": len(segments),
                "start": group[0][1] / 1000.0,
                "end": group[-1][2] / 1000.0,
                "speaker": None,
                "text": text,
                "words": [],
            }
        )
    return segments


def load_model(args: argparse.Namespace):
    with contextlib.redirect_stdout(sys.stderr):
        from funasr import AutoModel
        from funasr.utils.postprocess_utils import rich_transcription_postprocess

        model = AutoModel(
            model=args.model,
            vad_model=args.vad_model or None,
            device=args.device,
            disable_update=True,
        )
    return model, rich_transcription_postprocess


def main() -> int:
    args = parse_args()
    model, postprocess = load_model(args)
    version = importlib.metadata.version("funasr")

    if args.preload:
        print(
            json.dumps(
                {
                    "ready": True,
                    "model": args.model,
                    "vadModel": args.vad_model,
                    "device": args.device,
                    "funasrVersion": version,
                },
                ensure_ascii=False,
            )
        )
        return 0

    if not args.audio:
        raise ValueError("--audio is required unless --preload is used")
    audio_path = Path(args.audio).expanduser().resolve()
    if not audio_path.is_file():
        raise FileNotFoundError(f"audio file does not exist: {audio_path.name}")

    merge_length_s = 15
    with contextlib.redirect_stdout(sys.stderr):
        generated = model.generate(
            input=str(audio_path),
            cache={},
            language=args.language,
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=merge_length_s,
            output_timestamp=True,
        )

    results = [item for item in generated if isinstance(item, dict)]
    text_parts = [clean_text(item.get("text"), postprocess) for item in results]
    text = "\n".join(part for part in text_parts if part).strip()
    duration = audio_duration(audio_path)

    segments = sentence_segments(results, postprocess)
    if not segments:
        words: list[str] = []
        timestamps: list[list[float]] = []
        for result in results:
            item_words = result.get("words")
            item_timestamps = result.get("timestamp")
            if (
                isinstance(item_words, list)
                and isinstance(item_timestamps, list)
                and len(item_words) == len(item_timestamps)
            ):
                words.extend(item_words)
                timestamps.extend(item_timestamps)
        if words:
            segments = sentence_segments_from_words(
                words, timestamps, postprocess, max_segment_ms=merge_length_s * 1000
            )

    if not segments and text:
        segments = [
            {
                "index": 0,
                "start": 0,
                "end": duration or 0,
                "speaker": None,
                "text": text,
                "words": [],
            }
        ]

    print(
        json.dumps(
            {
                "text": text,
                "language": "zh-CN" if args.language == "zh" else args.language,
                "duration": duration,
                "segments": segments,
                "raw": {
                    "model": args.model,
                    "vadModel": args.vad_model,
                    "device": args.device,
                    "funasrVersion": version,
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FunASR error: {error}", file=sys.stderr)
        raise SystemExit(1)
