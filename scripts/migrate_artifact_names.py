#!/usr/bin/env python3
"""Migra artefatos legados para nomes autoexplicativos, sem chamadas de rede."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from audiofy.artifact_migration import (  # noqa: E402
    infer_source_key,
    migrate_episode_artifacts,
)
from audiofy.config import EPISODES_DIR  # noqa: E402
from audiofy.sources import get_source  # noqa: E402


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _local_item(directory: Path, source_key: str):
    """Consulta somente a fonte já pronta; nunca sincroniza nem acessa a rede."""
    source = get_source(source_key)
    if not source.is_ready():
        return None
    item_id = str(
        _read_json(directory / "status.json").get("episode_id") or directory.name.replace("__", "/")
    )
    try:
        return source.get_item(item_id)
    except LookupError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=EPISODES_DIR)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="efetiva os renames; sem esta opção, apenas lista o escopo",
    )
    args = parser.parse_args()
    if not args.root.is_dir():
        parser.error(f"Diretório de episódios inexistente: {args.root}")
    directories = sorted(path for path in args.root.iterdir() if path.is_dir())
    if not args.apply:
        for directory in directories:
            print(f"• {directory.name}")
        print(f"\n{len(directories)} episódio(s) seriam avaliados; use --apply para migrar.")
        return 0
    for directory in directories:
        metrics = _read_json(directory / "metrics.json")
        source_key = infer_source_key(directory, metrics)
        result = migrate_episode_artifacts(
            directory,
            item=_local_item(directory, source_key),
            source_key=source_key,
        )
        source = result["source_file"] or "fonte local indisponível"
        print(
            f"✔ {result['episode_id']}: {result['renamed_chunks']} chunk(s), "
            f"{result['final_audio'] or 'sem áudio completo'}, {source}"
        )
    print(f"\n{len(directories)} episódio(s) migrado(s) sem regenerar áudio.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
