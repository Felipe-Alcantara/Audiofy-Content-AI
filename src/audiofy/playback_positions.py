"""Persistência da posição de reprodução de cada episódio, por arquivo.

Escrita atômica em disco (arquivo temporário + replace), diferente de
localStorage do Electron: o Chromium não garante que localStorage seja
fisicamente sincronizado no momento do setItem — fechar a janela
abruptamente pode perder o dado ainda não commitado. Path.replace() no
POSIX é atômico no nível do sistema de arquivos, garantido pelo kernel.
"""

from __future__ import annotations

import json
from pathlib import Path

MAX_ENTRIES = 200


class PlaybackPositions:
    def __init__(self, path: Path) -> None:
        self.path = path

    def _load(self) -> dict[str, float]:
        if not self.path.is_file():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            return {}
        if not isinstance(data, dict):
            return {}
        return {
            key: value
            for key, value in data.items()
            if isinstance(key, str) and isinstance(value, (int, float))
        }

    def read(self, source: str) -> float | None:
        return self._load().get(source)

    def save(self, source: str, seconds: float) -> None:
        positions = self._load()
        positions[source] = seconds
        if len(positions) > MAX_ENTRIES:
            # Sem teto, o arquivo cresceria para sempre ao longo de meses de
            # uso — mantém só as entradas mais recentes (a que acabou de
            # ser gravada sempre entra, por vir por último no dict).
            positions = dict(list(positions.items())[-MAX_ENTRIES:])
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(positions, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)
