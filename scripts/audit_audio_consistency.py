#!/usr/bin/env python3
"""Mede a consistência sonora entre e dentro dos trechos de um episódio.

A auditoria que roda no pipeline (``audiofy.audio_audit``) procura silêncio:
ela responde "faltou áudio?". Este utilitário responde outra pergunta, a que
os ouvintes fazem — "por que parece que troca de voz no meio?" — medindo três
grandezas que o ouvido percebe e que nenhum teste automatizado enxerga:

* **brilho** (centro espectral): cai quando a voz fica abafada;
* **volume** (RMS dos quadros com fala): cai quando o trecho "some";
* **velocidade** (palavras por minuto): sobe quando o trecho acelera.

O achado que motivou o script: a voz do modelo decai *dentro* de uma mesma
geração. Em trechos de 4.000 caracteres o brilho caía de ~1.150 Hz no início
para ~520-690 Hz no fim e voltava ao normal no trecho seguinte — o contraste é
o que se ouve como inconsistência. Por isso o relatório separa a variação
*entre* trechos da variação *dentro* de cada um.

Uso:
    python scripts/audit_audio_consistency.py data/episodes/<episódio>
    python scripts/audit_audio_consistency.py <episódio> --limite-queda 25

Sai com código 1 quando a queda de brilho dentro de um trecho passa do limite,
o que permite usar o script como porta de qualidade ao mudar o tamanho de
trecho ou a direção vocal.

Depende de NumPy e FFmpeg. O NumPy não é dependência do Audiofy: instale-o no
ambiente onde for rodar a auditoria (``pip install numpy``).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import numpy as np
except ModuleNotFoundError:  # pragma: no cover - depende do ambiente
    print(
        "Este utilitário precisa do NumPy para a análise espectral.\n"
        "Instale-o no ambiente da auditoria: pip install numpy",
        file=sys.stderr,
    )
    raise SystemExit(2) from None

TAXA_ANALISE = 24_000
TAMANHO_FFT = 2_048
#: Quadros abaixo deste nível são silêncio ou respiração: o brilho deles é
#: ruído e distorceria a mediana do trecho.
PISO_DE_FALA_DBFS = -45.0
JANELA_PADRAO_S = 15.0
LIMITE_QUEDA_PADRAO = 25.0
FFMPEG_TIMEOUT = 600


@dataclass(frozen=True)
class Medida:
    """Brilho e volume de um bloco de áudio, medidos só nos quadros com fala."""

    brilho_hz: float
    volume_dbfs: float


def decodificar(caminho: Path) -> np.ndarray:
    """PCM mono float do arquivo, via FFmpeg, sem depender de codec em Python."""
    resultado = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(caminho),
            "-ac",
            "1",
            "-ar",
            str(TAXA_ANALISE),
            "-f",
            "s16le",
            "-",
        ],
        capture_output=True,
        check=True,
        timeout=FFMPEG_TIMEOUT,
    )
    return np.frombuffer(resultado.stdout, dtype="<i2").astype(np.float64) / 32768.0


def medir(bloco: np.ndarray) -> Medida | None:
    """Mede um bloco, ou ``None`` quando não há fala suficiente nele."""
    if bloco.size < TAMANHO_FFT * 2:
        return None
    quadros = bloco[: bloco.size // TAMANHO_FFT * TAMANHO_FFT]
    quadros = quadros.reshape(-1, TAMANHO_FFT) * np.hanning(TAMANHO_FFT)
    espectro = np.abs(np.fft.rfft(quadros, axis=1))
    frequencias = np.fft.rfftfreq(TAMANHO_FFT, 1 / TAXA_ANALISE)

    rms = np.sqrt((quadros**2).mean(axis=1)) + 1e-12
    fala = rms >= max(np.percentile(rms, 60), 10 ** (PISO_DE_FALA_DBFS / 20))
    if fala.sum() < 3:
        return None

    energia = espectro[fala].sum(axis=1) + 1e-12
    centro = (espectro[fala] * frequencias).sum(axis=1) / energia
    return Medida(
        brilho_hz=float(np.median(centro)),
        volume_dbfs=float(20 * np.log10(rms[fala].mean())),
    )


def segmentos_do_episodio(pasta: Path) -> list[tuple[Path, dict]]:
    """Segmentos em ordem de reprodução, com o texto que cada um deveria falar."""
    manifesto = pasta / "segments.json"
    if not manifesto.is_file():
        raise SystemExit(f"Sem manifesto de segmentos em {pasta} — o episódio foi gerado?")
    entradas = json.loads(manifesto.read_text(encoding="utf-8")).get("segments", {})
    achados = []
    for nome, entrada in sorted(entradas.items(), key=lambda kv: kv[1].get("chunk_index", 0)):
        caminho = pasta / "segments" / nome
        if caminho.is_file():
            achados.append((caminho, entrada))
    if not achados:
        raise SystemExit(f"Nenhum arquivo de segmento encontrado em {pasta / 'segments'}.")
    return achados


def relatar_entre_trechos(segmentos: list[tuple[Path, dict]]) -> None:
    """Como cada trecho soa em relação aos outros."""
    print(f"{'#':>3} {'duração':>8} {'brilho':>9} {'volume':>8} {'palavras/min':>13}")
    brilhos, volumes, ritmos = [], [], []
    for caminho, entrada in segmentos:
        sinal = decodificar(caminho)
        duracao = sinal.size / TAXA_ANALISE
        medida = medir(sinal)
        if medida is None:
            print(f"{entrada.get('chunk_index'):>3} {duracao:>7.1f}s   (sem fala medível)")
            continue
        palavras = len(str(entrada.get("text", "")).split())
        wpm = palavras / (duracao / 60) if duracao else 0.0
        brilhos.append(medida.brilho_hz)
        volumes.append(medida.volume_dbfs)
        ritmos.append(wpm)
        print(
            f"{entrada.get('chunk_index'):>3} {duracao:>7.1f}s {medida.brilho_hz:>8.0f}Hz "
            f"{medida.volume_dbfs:>7.1f}dB {wpm:>13.0f}"
        )

    for valores, rotulo, unidade in (
        (brilhos, "brilho", "Hz"),
        (volumes, "volume", "dB"),
        (ritmos, "velocidade", "palavras/min"),
    ):
        if len(valores) > 1:
            print(
                f"  {rotulo}: {min(valores):.0f} a {max(valores):.0f} {unidade} "
                f"(amplitude {max(valores) - min(valores):.0f})"
            )


def relatar_dentro_do_trecho(
    segmentos: list[tuple[Path, dict]], janela_s: float, limite_queda: float
) -> int:
    """Como cada trecho se degrada do próprio início ao próprio fim."""
    print(f"\nDentro de cada trecho, a cada {janela_s:.0f}s (brilho em Hz):")
    piores: list[tuple[int, float]] = []
    curvas: list[list[float]] = []
    for caminho, entrada in segmentos:
        sinal = decodificar(caminho)
        passo = int(janela_s * TAXA_ANALISE)
        if sinal.size < passo * 2:
            continue
        curva = []
        for inicio in range(0, sinal.size - passo + 1, passo):
            medida = medir(sinal[inicio : inicio + passo])
            if medida:
                curva.append(medida.brilho_hz)
        if len(curva) < 2:
            continue
        curvas.append(curva)
        queda = (1 - curva[-1] / curva[0]) * 100
        piores.append((entrada.get("chunk_index", 0), queda))
        amostra = " ".join(f"{v:>5.0f}" for v in curva[:8])
        print(f"{entrada.get('chunk_index'):>3} {amostra}   queda {queda:>5.1f}%")

    if curvas:
        maior = max(len(c) for c in curvas)
        media = [float(np.mean([c[i] for c in curvas if len(c) > i])) for i in range(maior)]
        print("\nCurva média de decaimento (o que decide o tamanho do trecho):")
        for i, valor in enumerate(media):
            segundos = (i + 1) * janela_s
            print(
                f"  {segundos:>5.0f}s  {valor:>6.0f} Hz  "
                f"queda {(1 - valor / media[0]) * 100:>5.1f}%"
            )

    estourados = [(indice, queda) for indice, queda in piores if queda > limite_queda]
    if estourados:
        print(
            f"\n✖ {len(estourados)} trecho(s) passam do limite de {limite_queda:.0f}% "
            "de perda de brilho — o ouvinte percebe isso como troca de voz:"
        )
        for indice, queda in estourados:
            print(f"  trecho {indice}: {queda:.1f}%")
        return 1
    print(f"\n✔ Nenhum trecho passa do limite de {limite_queda:.0f}% de perda de brilho.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("episodio", type=Path, help="pasta do episódio em data/episodes/")
    parser.add_argument(
        "--janela",
        type=float,
        default=JANELA_PADRAO_S,
        help="tamanho da janela de análise dentro do trecho, em segundos",
    )
    parser.add_argument(
        "--limite-queda",
        type=float,
        default=LIMITE_QUEDA_PADRAO,
        help="perda de brilho tolerada dentro de um trecho, em %%",
    )
    argumentos = parser.parse_args()

    pasta = argumentos.episodio
    if not pasta.is_dir():
        raise SystemExit(f"Pasta de episódio inexistente: {pasta}")

    segmentos = segmentos_do_episodio(pasta)
    print(f"Episódio: {pasta.name} — {len(segmentos)} segmento(s)\n")
    relatar_entre_trechos(segmentos)
    return relatar_dentro_do_trecho(segmentos, argumentos.janela, argumentos.limite_queda)


if __name__ == "__main__":
    raise SystemExit(main())
