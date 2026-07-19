"""Migra nomes genéricos sem alterar o conteúdo binário dos artefatos."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .artifacts import (
    ARTIFACT_SCHEMA_VERSION,
    LEGACY_FINAL_AUDIO,
    final_audio_filename,
    resolve_final_audio,
    segment_audio_filename,
    write_source_document,
)
from .sources.base import ContentItem

_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}
_LEGACY_CHUNK_INDEX = re.compile(r"^(\d+)_")
_DESCRIPTIVE_CHUNK_INDEX = re.compile(r"__chunk-(\d+)-de-\d+__")


def _read_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} precisa conter um objeto JSON.")
    return data


def _save_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _turns(directory: Path) -> tuple[str, list[dict]]:
    for filename, mode in (("narration-script.json", "verbatim"), ("script.json", "adaptation")):
        document = _read_json(directory / filename)
        turns = document.get("turns")
        if isinstance(turns, list):
            return mode, [turn for turn in turns if isinstance(turn, dict)]
    return "adaptation", []


def _chunk_index(filename: str, fallback: int) -> int:
    match = _LEGACY_CHUNK_INDEX.match(filename) or _DESCRIPTIVE_CHUNK_INDEX.search(filename)
    return int(match.group(1)) if match else fallback


def _concat_line(path: Path) -> str:
    text = path.resolve().as_posix().replace("'", r"'\''")
    return f"file '{text}'\n"


def infer_source_key(directory: Path, metrics: dict | None = None) -> str:
    recorded = str((metrics or {}).get("source_key") or "").strip()
    if recorded:
        return recorded
    return "akita" if "__" in directory.name else "custom"


def migrate_episode_artifacts(
    directory: Path,
    *,
    item: ContentItem | None = None,
    source_key: str | None = None,
) -> dict:
    """Renomeia final/chunks e sincroniza manifestos; nunca sobrescreve um arquivo existente."""
    metrics_path = directory / "metrics.json"
    metrics = _read_json(metrics_path)
    status = _read_json(directory / "status.json")
    episode_id = str(status.get("episode_id") or directory.name.replace("__", "/"))
    source_key = source_key or infer_source_key(directory, metrics)
    artifact_mode, turns = _turns(directory)
    generation_mode = str(metrics.get("generation_mode") or artifact_mode)

    segments_directory = directory / "segments"
    segment_paths = (
        sorted(
            path
            for path in segments_directory.iterdir()
            if path.is_file() and path.suffix.lower() in _AUDIO_EXTENSIONS
        )
        if segments_directory.is_dir()
        else []
    )
    total = len(turns) or len(segment_paths)
    renamed: dict[str, str] = {}
    ordered_segments: list[tuple[int, Path, str]] = []
    for fallback, path in enumerate(segment_paths, start=1):
        index = _chunk_index(path.name, fallback)
        turn = turns[index - 1] if 0 < index <= len(turns) else {}
        legacy_speaker = path.stem.partition("_")[2] or "sem-voz"
        speaker = str(turn.get("speaker") or legacy_speaker)
        target = path.with_name(
            segment_audio_filename(
                source_key,
                episode_id,
                generation_mode,
                index,
                total,
                speaker,
                path.suffix,
            )
        )
        if target != path:
            if target.exists():
                raise FileExistsError(f"Migração não sobrescreveu {target.name}.")
            path.replace(target)
            renamed[path.name] = target.name
        ordered_segments.append((index, target, speaker))

    manifest_path = directory / "segments.json"
    manifest = _read_json(manifest_path)
    entries = manifest.get("segments")
    if not isinstance(entries, dict):
        entries = {}
    for index, path, speaker in ordered_segments:
        previous_name = next((old for old, new in renamed.items() if new == path.name), path.name)
        entry = entries.pop(previous_name, entries.get(path.name, {}))
        entry = entry if isinstance(entry, dict) else {}
        entry.update(
            {
                "bytes": path.stat().st_size,
                "kind": "chunk",
                "chunk_index": index,
                "chunk_total": total,
                "speaker": speaker,
            }
        )
        entries[path.name] = entry
    manifest.update(
        {
            "version": ARTIFACT_SCHEMA_VERSION,
            "source_key": source_key,
            "episode_id": episode_id,
            "generation_mode": generation_mode,
            "segments": entries,
        }
    )
    if ordered_segments:
        _save_json(manifest_path, manifest)
        (directory / "segments.txt").write_text(
            "".join(_concat_line(path) for _, path, _ in sorted(ordered_segments)),
            encoding="utf-8",
        )

    audit_path = directory / "audio-audit.json"
    audit = _read_json(audit_path)
    if isinstance(audit.get("segments"), list):
        for finding in audit["segments"]:
            if isinstance(finding, dict) and finding.get("file") in renamed:
                finding["file"] = renamed[finding["file"]]
        _save_json(audit_path, audit)

    legacy_final = directory / LEGACY_FINAL_AUDIO
    target_final = directory / final_audio_filename(source_key, episode_id, generation_mode)
    if legacy_final.is_file() and target_final != legacy_final:
        if target_final.exists():
            raise FileExistsError(f"Migração não sobrescreveu {target_final.name}.")
        legacy_final.replace(target_final)
    final_audio = resolve_final_audio(directory, target_final.name)

    source_file = write_source_document(directory, item, source_key) if item else None
    if metrics:
        metrics.update(
            {
                "source_key": source_key,
                "source_file": source_file.name if source_file else metrics.get("source_file", ""),
                "final_audio_file": final_audio.name if final_audio else "",
                "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            }
        )
        _save_json(metrics_path, metrics)
    return {
        "episode_id": episode_id,
        "source_key": source_key,
        "generation_mode": generation_mode,
        "final_audio": final_audio.name if final_audio else None,
        "source_file": source_file.name if source_file else None,
        "renamed_chunks": len(renamed),
        "chunks": total,
    }
