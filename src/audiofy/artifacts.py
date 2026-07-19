"""Nomes e resolução compatível dos artefatos auditáveis de um episódio."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from .sources.base import ContentItem

ARTIFACT_SCHEMA_VERSION = 2
LEGACY_FINAL_AUDIO = "episode.mp3"
_DESCRIPTIVE_FINAL_PATTERN = "fonte-*__episodio-*__modo-*__audio-completo.mp3"
_MODE_LABELS = {"adaptation": "podcast-adaptado", "verbatim": "leitura-fiel"}


def artifact_slug(value: str, *, fallback: str, max_length: int) -> str:
    """Produz componente portável, legível e com tamanho limitado para um nome de arquivo."""
    normalized = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug[:max_length].rstrip("-") or fallback


def artifact_prefix(source_key: str, item_id: str, generation_mode: str) -> str:
    source = artifact_slug(source_key, fallback="desconhecida", max_length=24)
    episode = artifact_slug(item_id.replace("/", "-"), fallback="sem-id", max_length=72)
    mode = _MODE_LABELS.get(
        generation_mode, artifact_slug(generation_mode, fallback="desconhecido", max_length=24)
    )
    return f"fonte-{source}__episodio-{episode}__modo-{mode}"


def final_audio_filename(source_key: str, item_id: str, generation_mode: str) -> str:
    return f"{artifact_prefix(source_key, item_id, generation_mode)}__audio-completo.mp3"


def source_document_filename(source_key: str, item_id: str) -> str:
    source = artifact_slug(source_key, fallback="desconhecida", max_length=24)
    episode = artifact_slug(item_id.replace("/", "-"), fallback="sem-id", max_length=72)
    return f"fonte-{source}__episodio-{episode}__fonte-original-completa.md"


def write_source_document(directory: Path, item: ContentItem, source_key: str) -> Path:
    """Preserva a entrada completa com identidade explícita e escrita atômica."""
    target = directory / source_document_filename(source_key, item.item_id)
    temporary = target.with_suffix(f"{target.suffix}.tmp")
    # Espaços/tabs no fim de linha não carregam conteúdo falado e quebram a
    # validação de whitespace quando o artefato auditável é versionado.
    source_text = re.sub(r"[ \t]+(?=\r?$)", "", item.text, flags=re.MULTILINE)
    temporary.write_text(
        f"# {item.title}\n\n"
        f"Fonte de conteúdo: `{source_key}`\n\n"
        f"URL de origem: {item.url or 'conteúdo colado/local'}\n\n"
        f"Data da fonte: {item.published_at or 'não informada'}\n\n"
        f"Atribuição: {item.attribution}\n\n"
        "---\n\n" + source_text,
        encoding="utf-8",
    )
    temporary.replace(target)
    return target


def segment_audio_filename(
    source_key: str,
    item_id: str,
    generation_mode: str,
    index: int,
    total: int,
    speaker: str,
    extension: str,
) -> str:
    voice = artifact_slug(speaker, fallback="sem-voz", max_length=24)
    suffix = artifact_slug(extension.lstrip("."), fallback="wav", max_length=8)
    width = max(3, len(str(total)))
    return (
        f"{artifact_prefix(source_key, item_id, generation_mode)}"
        f"__chunk-{index:0{width}d}-de-{total:0{width}d}__voz-{voice}.{suffix}"
    )


def resolve_final_audio(directory: Path, recorded_filename: str | None = None) -> Path | None:
    """Resolve o MP3 novo e mantém leitura de ``episode.mp3`` para acervos legados."""
    if recorded_filename:
        candidate = directory / recorded_filename
        if (
            Path(recorded_filename).name == recorded_filename
            and candidate.suffix.lower() == ".mp3"
            and candidate.is_file()
        ):
            return candidate
    descriptive = [path for path in directory.glob(_DESCRIPTIVE_FINAL_PATTERN) if path.is_file()]
    if descriptive:
        return max(descriptive, key=lambda path: path.stat().st_mtime)
    legacy = directory / LEGACY_FINAL_AUDIO
    return legacy if legacy.is_file() else None
