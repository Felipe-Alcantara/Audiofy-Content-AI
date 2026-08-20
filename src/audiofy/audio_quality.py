"""Auditoria de qualidade sonora dos trechos: volume, brilho e decaimento.

A auditoria de :mod:`audiofy.audio_audit` responde "faltou áudio?" procurando
silêncio. Este módulo responde a outra pergunta, a que os ouvintes fazem —
"por que parece que troca de voz no meio?" — medindo o que o ouvido percebe e
nenhum teste automatizado enxerga:

* **volume**: um trecho mais baixo que os vizinhos soa como se a voz sumisse;
* **brilho** (centro espectral): quando cai, a voz soa abafada;
* **queda de brilho dentro do trecho**: a voz do modelo decai ao longo de uma
  mesma geração e volta ao normal na geração seguinte — é esse contraste, e não
  o valor absoluto, que se ouve como troca de voz.

Os limiares são **relativos ao próprio episódio**. Brilho absoluto muda com a
voz: uma voz grave é naturalmente mais escura que uma aguda, e um limite fixo
reprovaria a voz inteira em vez do trecho defeituoso.

Tudo é medido com FFmpeg, já exigido pelo projeto — nenhuma dependência nova.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable, Sequence
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from pathlib import Path

from .media import media_duration_seconds
from .runtime.process import run_tool

QUALITY_FILE = "audio-quality.json"

#: Abaixo deste nível o quadro é silêncio ou respiração: o brilho dele é ruído
#: e distorceria a mediana do trecho.
SPEECH_FLOOR_DBFS = -45.0
#: Queda de brilho tolerada do início ao fim de um trecho.
#:
#: Calibrado comparando dois episódios reais com esta mesma métrica (mediana do
#: primeiro terço contra a do último):
#:
#:     trechos de 450 caracteres (aprovado na escuta): mediana 3%, p90 14%,
#:         máximo 20% — nenhum dos 40 trechos passa de 25%
#:     trechos de 2.400 caracteres (reprovado):        mediana 18%, p90 37%,
#:         máximo 48% — 5 dos 12 trechos passam de 25%
#:
#: O limiar cai no vale entre as duas distribuições: não marca nada no episódio
#: bom e marca quase metade do ruim.
BRIGHTNESS_DROP_LIMIT = 0.25
#: Distância tolerada, em dB, entre o trecho e a mediana do episódio.
LEVEL_TOLERANCE_DB = 4.0
#: Distância tolerada de brilho em relação à mediana do episódio.
BRIGHTNESS_TOLERANCE = 0.25
#: Com poucos trechos não há mediana confiável: comparar geraria falso positivo.
MIN_SEGMENTS_FOR_COMPARISON = 3
_PROBE_TIMEOUT_SECONDS = 300

ISSUE_LABELS = {
    "queda_de_brilho": "a voz perde brilho do começo ao fim do trecho",
    "voz_abafada": "o trecho é mais abafado que o resto do episódio",
    "volume_baixo": "o trecho é mais baixo que o resto do episódio",
}


@dataclass(frozen=True)
class SegmentQuality:
    """Medida de um trecho, com os problemas que ele apresenta.

    ``level_dbfs`` e ``brightness_hz`` são ``None`` quando o trecho não tem
    fala medível — declarar ausência é melhor do que inventar zero.
    """

    file: str
    chunk_index: int
    duration_seconds: float
    level_dbfs: float | None
    brightness_hz: float | None
    brightness_drop: float | None
    issues: tuple[str, ...] = ()
    severity: str = "ok"


def _mediana(valores: Sequence[float]) -> float:
    ordenados = sorted(valores)
    meio = len(ordenados) // 2
    if len(ordenados) % 2:
        return ordenados[meio]
    return (ordenados[meio - 1] + ordenados[meio]) / 2


def _quadros(path: Path) -> list[tuple[float, float]]:
    """Nível e centro espectral de cada quadro, via FFmpeg.

    O filtro ``astats`` dá a energia e o ``aspectralstats`` dá o brilho; os dois
    na mesma cadeia mantêm os valores alinhados quadro a quadro, o que é o que
    permite descartar o brilho dos quadros de silêncio.
    """
    resultado = run_tool(
        "ffprobe",
        [
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"amovie={_escapar(path)},astats=metadata=1:reset=1,aspectralstats=measure=centroid",
            "-show_entries",
            "frame_tags=lavfi.astats.Overall.RMS_level,lavfi.aspectralstats.1.centroid",
            "-of",
            "csv=p=0",
        ],
        timeout=_PROBE_TIMEOUT_SECONDS,
    )
    quadros: list[tuple[float, float]] = []
    for linha in (resultado.stdout or "").splitlines():
        partes = linha.strip().split(",")
        if len(partes) < 2:
            continue
        try:
            nivel, centro = float(partes[0]), float(partes[1])
        except ValueError:
            continue  # "-inf" em silêncio absoluto, "nan" em quadro degenerado
        if nivel != nivel or centro != centro:  # NaN
            continue
        quadros.append((nivel, centro))
    return quadros


def _escapar(path: Path) -> str:
    """Escapa o caminho para o parser de filtros do FFmpeg (`amovie=`)."""
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def medir_segmento(path: Path) -> SegmentQuality:
    """Mede volume, brilho e queda de brilho de um trecho."""
    quadros = _quadros(path)
    fala = [(nivel, centro) for nivel, centro in quadros if nivel >= SPEECH_FLOOR_DBFS]
    duracao = media_duration_seconds(path) if path.is_file() else 0.0
    if len(fala) < 6:
        return SegmentQuality(
            file=path.name,
            chunk_index=0,
            duration_seconds=duracao,
            level_dbfs=None,
            brightness_hz=None,
            brightness_drop=None,
        )

    niveis = [nivel for nivel, _ in fala]
    brilhos = [centro for _, centro in fala]
    # Terços do trecho: a queda é uma rampa, então comparar as pontas mede o
    # que o ouvinte percebe entre o começo e o fim da mesma geração.
    terco = max(1, len(brilhos) // 3)
    inicio, fim = _mediana(brilhos[:terco]), _mediana(brilhos[-terco:])
    queda = (inicio - fim) / inicio if inicio > 0 else None
    return SegmentQuality(
        file=path.name,
        chunk_index=0,
        duration_seconds=duracao,
        level_dbfs=sum(niveis) / len(niveis),
        brightness_hz=_mediana(brilhos),
        brightness_drop=queda,
    )


def avaliar_episodio(
    medidas: Sequence[SegmentQuality],
) -> tuple[list[SegmentQuality], dict]:
    """Marca os trechos que destoam do próprio episódio ou decaem por dentro."""
    brilhos = [m.brightness_hz for m in medidas if m.brightness_hz]
    niveis = [m.level_dbfs for m in medidas if m.level_dbfs is not None]
    comparavel = len(medidas) >= MIN_SEGMENTS_FOR_COMPARISON
    brilho_mediano = _mediana(brilhos) if brilhos and comparavel else None
    nivel_mediano = _mediana(niveis) if niveis and comparavel else None

    avaliadas: list[SegmentQuality] = []
    for medida in medidas:
        problemas: list[str] = []
        if medida.brightness_drop is not None and medida.brightness_drop > BRIGHTNESS_DROP_LIMIT:
            problemas.append("queda_de_brilho")
        if (
            brilho_mediano
            and medida.brightness_hz
            and medida.brightness_hz < brilho_mediano * (1 - BRIGHTNESS_TOLERANCE)
        ):
            problemas.append("voz_abafada")
        if (
            nivel_mediano is not None
            and medida.level_dbfs is not None
            and medida.level_dbfs < nivel_mediano - LEVEL_TOLERANCE_DB
        ):
            problemas.append("volume_baixo")
        avaliadas.append(
            replace(
                medida,
                issues=tuple(problemas),
                severity="atencao" if problemas else "ok",
            )
        )

    com_problema = [m for m in avaliadas if m.issues]
    resumo = {
        "total": len(avaliadas),
        "com_problema": len(com_problema),
        "brilho_mediano_hz": round(brilho_mediano, 1) if brilho_mediano else None,
        "nivel_mediano_dbfs": round(nivel_mediano, 1) if nivel_mediano is not None else None,
        "trechos_com_problema": [m.chunk_index for m in com_problema],
    }
    return avaliadas, resumo


def audit_quality(
    directory: Path,
    segments: Iterable[Path],
    on_progress: Callable[[int], None] | None = None,
) -> dict:
    """Mede todos os trechos, avalia e grava o relatório no diretório do episódio."""
    caminhos = list(segments)
    medidas: list[SegmentQuality] = []
    for posicao, caminho in enumerate(caminhos, 1):
        medida = medir_segmento(caminho)
        medidas.append(replace(medida, chunk_index=posicao))
        if on_progress:
            on_progress(posicao)

    avaliadas, resumo = avaliar_episodio(medidas)
    relatorio = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "limits": {
            "brightness_drop": BRIGHTNESS_DROP_LIMIT,
            "level_tolerance_db": LEVEL_TOLERANCE_DB,
            "brightness_tolerance": BRIGHTNESS_TOLERANCE,
        },
        "summary": resumo,
        "segments": [asdict(m) for m in avaliadas],
    }
    write_quality_report(directory, relatorio)
    return relatorio


def write_quality_report(directory: Path, relatorio: dict) -> Path:
    destino = directory / QUALITY_FILE
    temporario = destino.with_suffix(destino.suffix + ".tmp")
    temporario.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
    temporario.replace(destino)
    return destino


def read_quality_report(directory: Path) -> dict | None:
    caminho = directory / QUALITY_FILE
    if not caminho.is_file():
        return None
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def descrever(medida: SegmentQuality) -> str:
    """Frase curta para log e interface, em vez de despejar o código do problema."""
    if not medida.issues:
        return "ok"
    return "; ".join(ISSUE_LABELS.get(problema, problema) for problema in medida.issues)
