"""Marcações de tempo e alvo de duração para quem monta vídeo com a narração.

Quem edita um vídeo precisa de duas coisas que o MP3 sozinho não dá:

* **onde cada trecho começa**, para trocar o slide na hora certa sem procurar
  a posição de ouvido;
* **quanto texto cabe** na duração que o vídeo precisa ter, antes de gerar e
  descobrir que o áudio ficou 60% mais longo do que o combinado.

Os tempos saem da duração real de cada segmento, medida no arquivo — a mesma
premissa da montagem, que concatena os segmentos sem silêncio extra.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from pathlib import Path

#: Título de capítulo maior que isto vira parede de texto no player.
MAX_CHAPTER_TITLE = 70


def _timestamp(seconds: float, *, milliseconds: bool) -> str:
    """Tempo no formato ``HH:MM:SS,mmm`` (SRT) ou ``HH:MM:SS`` (capítulos)."""
    total = max(0.0, float(seconds))
    horas, resto = divmod(int(total), 3600)
    minutos, segundos = divmod(resto, 60)
    if not milliseconds:
        return f"{horas:02d}:{minutos:02d}:{segundos:02d}"
    milis = int(round((total - int(total)) * 1000))
    if milis == 1000:  # arredondamento para cima não pode virar ",1000"
        segundos, milis = segundos + 1, 0
    return f"{horas:02d}:{minutos:02d}:{segundos:02d},{milis:03d}"


def _ordenados(chunks: Iterable[dict]) -> list[dict]:
    lista = sorted(chunks, key=lambda chunk: chunk.get("chunk_index") or 0)
    if any(chunk.get("duration_seconds") is None for chunk in lista):
        raise ValueError(
            "Um dos trechos está sem duração medida; sem isso as marcações "
            "sairiam deslocadas do áudio."
        )
    return lista


def _uma_linha(texto: str) -> str:
    return " ".join(str(texto or "").split())


def srt_text(chunks: Iterable[dict]) -> str:
    """Legendas com o texto de cada trecho, no formato que editores aceitam."""
    linhas: list[str] = []
    relogio = 0.0
    for posicao, chunk in enumerate(_ordenados(chunks), 1):
        duracao = float(chunk["duration_seconds"])
        inicio, fim = relogio, relogio + duracao
        relogio = fim
        linhas.extend(
            [
                str(posicao),
                f"{_timestamp(inicio, milliseconds=True)} --> {_timestamp(fim, milliseconds=True)}",
                _uma_linha(chunk.get("text", "")),
                "",
            ]
        )
    return "\n".join(linhas)


def chapters_text(chunks: Iterable[dict]) -> str:
    """Capítulos ``HH:MM:SS título``, o formato que players e editores leem."""
    linhas: list[str] = []
    relogio = 0.0
    for chunk in _ordenados(chunks):
        titulo = _uma_linha(chunk.get("text", ""))
        if len(titulo) > MAX_CHAPTER_TITLE:
            titulo = titulo[: MAX_CHAPTER_TITLE - 1].rstrip() + "…"
        linhas.append(f"{_timestamp(relogio, milliseconds=False)} {titulo}")
        relogio += float(chunk["duration_seconds"])
    return "\n".join(linhas)


def export_markers(
    directory: Path, chunks: Sequence[dict], base_name: str = "narracao"
) -> list[Path]:
    """Grava legendas e capítulos na pasta do episódio e devolve os caminhos."""
    escritos: list[Path] = []
    for sufixo, conteudo in (
        ("-marcacoes.srt", srt_text(chunks)),
        ("-capitulos.txt", chapters_text(chunks)),
    ):
        destino = directory / f"{base_name}{sufixo}"
        destino.write_text(conteudo, encoding="utf-8")
        escritos.append(destino)
    return escritos


def text_that_fits(words: int, target_minutes: float, speaking_rate_wpm: float) -> dict:
    """Quanto texto cabe na duração alvo, e quanto sobra para cortar.

    A taxa de leitura vem do histórico real de episódios do mesmo modelo e voz,
    não de uma média de mercado: foi medindo o próprio áudio que descobrimos
    que a locução sai a ~147 palavras por minuto neste modelo.
    """
    if target_minutes <= 0:
        raise ValueError("A duração alvo precisa ser maior que zero.")
    if speaking_rate_wpm <= 0:
        raise ValueError("A taxa de leitura precisa ser maior que zero.")
    cabem = int(target_minutes * speaking_rate_wpm)
    sobra = max(0, int(words) - cabem)
    return {
        "fits_words": cabem,
        "cut_words": sobra,
        "cut_ratio": (sobra / words) if words and sobra else 0.0,
        "current_minutes": (words / speaking_rate_wpm) if speaking_rate_wpm else 0.0,
        "target_minutes": target_minutes,
    }
