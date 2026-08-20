#!/usr/bin/env python3
"""Mede as vozes de um modelo TTS e imprime a tabela para o catálogo.

O catálogo do Audiofy lista o nome das vozes e um rótulo de tom, mas nome não
diz nada sobre como a voz soa — medindo, ``Fenrir`` e ``Alnilam`` são femininas
apesar do nome, e ``Orus`` variou entre 145 e 194 Hz em datas diferentes.
Escolher voz pelo nome custa uma geração inteira para descobrir o erro no fim.

Este utilitário sintetiza a mesma frase com cada voz e mede:

* **tom fundamental (F0)**: separa voz grave de aguda, que é o que as pessoas
  querem dizer quando pedem "uma voz masculina";
* **brilho**: quão clara ou abafada a voz é, na mesma métrica que a auditoria
  de qualidade usa;
* **velocidade**: caracteres por segundo, que dimensiona quanto texto cabe em
  um vídeo de duração alvo.

A saída é a tabela pronta para colar em ``src/audiofy/voices.py``. Rodar isto
custa uma fração de centavo por voz e o resultado é dado permanente: as vozes
não mudam de timbre entre execuções.

Uso:
    python scripts/measure_voices.py --modelo google/gemini-3.1-flash-tts-preview
    python scripts/measure_voices.py --vozes Umbriel,Charon --chave "Nome da chave"

Depende de NumPy (só para a detecção de tom) e de crédito no provedor.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import wave
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

try:
    import numpy as np
except ModuleNotFoundError:  # pragma: no cover - depende do ambiente
    print(
        "Este utilitário precisa do NumPy para estimar o tom da voz.\n"
        "Instale-o no ambiente de manutenção: pip install numpy",
        file=sys.stderr,
    )
    raise SystemExit(2) from None

from audiofy.audio_quality import medir_segmento  # noqa: E402
from audiofy.config import Settings, key_store  # noqa: E402
from audiofy.narration import stable_direction  # noqa: E402
from audiofy.providers import openrouter  # noqa: E402
from audiofy.voices import voices_for_model  # noqa: E402

#: Frase de referência: prosa comum, sem número nem sigla, para a medida não
#: depender de como o modelo lê um caso especial.
FRASE = (
    "A escola é a unidade central do sistema. É ela que organiza turmas, professores e "
    "matérias, e é a partir dela que cada jornada ganha sentido."
)
TAXA = 24_000
#: Faixa de tom da fala humana: fora dela o pico da autocorrelação é ruído.
F0_MINIMO_HZ = 60
F0_MAXIMO_HZ = 400
#: Fronteiras de rótulo. Escolhidas na faixa onde vozes medidas se separam sem
#: ambiguidade; entre elas, o rótulo é honesto ao dizer "intermediária".
LIMITE_GRAVE_HZ = 160
LIMITE_AGUDA_HZ = 190


def estimar_f0(sinal: np.ndarray) -> float:
    """Tom fundamental por autocorrelação, medido só nos quadros com fala."""
    tamanho = int(0.04 * TAXA)
    quadros = sinal[: len(sinal) // tamanho * tamanho].reshape(-1, tamanho)
    energia = np.sqrt((quadros**2).mean(axis=1))
    com_fala = quadros[energia > max(np.percentile(energia, 70), 1e-3)]
    minimo, maximo = int(TAXA / F0_MAXIMO_HZ), int(TAXA / F0_MINIMO_HZ)
    picos = []
    for quadro in com_fala[:400]:
        centrado = quadro - quadro.mean()
        correlacao = np.correlate(centrado, centrado, "full")[tamanho - 1 :]
        if correlacao[0] <= 0:
            continue
        faixa = correlacao[minimo:maximo]
        if faixa.size and faixa.max() > 0.3 * correlacao[0]:
            picos.append(TAXA / (minimo + int(faixa.argmax())))
    return float(np.median(picos)) if picos else 0.0


def rotular(f0_hz: float) -> str:
    if not f0_hz:
        return "indefinida"
    if f0_hz < LIMITE_GRAVE_HZ:
        return "grave"
    if f0_hz < LIMITE_AGUDA_HZ:
        return "intermediaria"
    return "aguda"


def gravar_wav(destino: Path, pcm: bytes) -> None:
    with wave.open(str(destino), "wb") as arquivo:
        arquivo.setnchannels(1)
        arquivo.setsampwidth(2)
        arquivo.setframerate(TAXA)
        arquivo.writeframes(pcm)


def decodificar(destino: Path) -> np.ndarray:
    bruto = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(destino),
            "-ac",
            "1",
            "-ar",
            str(TAXA),
            "-f",
            "s16le",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(bruto, dtype="<i2").astype(np.float64) / 32768.0


def medir_voz(settings: Settings, voz: str, saida: Path) -> dict | None:
    """Sintetiza a frase de referência e devolve as medidas da voz."""
    try:
        fala = openrouter.text_to_speech(settings, FRASE, voz, stable_direction("", "pt-BR"))
    except openrouter.OpenRouterError as erro:
        print(f"  {voz}: recusada pelo provedor — {str(erro)[:70]}", file=sys.stderr)
        return None
    destino = saida / f"{voz}.wav"
    gravar_wav(destino, fala.audio)
    medida = medir_segmento(destino)
    f0 = estimar_f0(decodificar(destino))
    return {
        "voz": voz,
        "f0_hz": round(f0),
        "brilho_hz": round(medida.brightness_hz or 0),
        "caracteres_por_segundo": round(len(FRASE) / medida.duration_seconds, 1)
        if medida.duration_seconds
        else 0.0,
        "rotulo": rotular(f0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--modelo", default="google/gemini-3.1-flash-tts-preview")
    parser.add_argument("--vozes", default="", help="lista separada por vírgula; padrão: todas")
    parser.add_argument("--chave", default="", help="nome da chave no cofre a usar")
    parser.add_argument("--saida", type=Path, default=None, help="pasta para as amostras")
    argumentos = parser.parse_args()

    catalogo = voices_for_model(argumentos.modelo)
    if not catalogo:
        raise SystemExit(f"Modelo sem catálogo de vozes conhecido: {argumentos.modelo}")
    escolhidas = (
        [voz.strip() for voz in argumentos.vozes.split(",") if voz.strip()]
        if argumentos.vozes
        else sorted(catalogo)
    )
    desconhecidas = [voz for voz in escolhidas if voz not in catalogo]
    if desconhecidas:
        raise SystemExit(f"Vozes fora do catálogo do modelo: {', '.join(desconhecidas)}")

    api_key = key_store().get(argumentos.chave).key if argumentos.chave else ""
    settings = Settings(tts_model=argumentos.modelo, **({"api_key": api_key} if api_key else {}))
    saida = argumentos.saida or Path.home() / "audiofy-amostras-de-voz"
    saida.mkdir(parents=True, exist_ok=True)

    print(f"Medindo {len(escolhidas)} voz(es) de {argumentos.modelo}; amostras em {saida}\n")
    print(f"{'voz':<16} {'tom':>7} {'rótulo':<15} {'brilho':>9} {'car/s':>7}")
    medidas = []
    for voz in escolhidas:
        medida = medir_voz(settings, voz, saida)
        if not medida:
            continue
        medidas.append(medida)
        print(
            f"{medida['voz']:<16} {medida['f0_hz']:>6}Hz {medida['rotulo']:<15} "
            f"{medida['brilho_hz']:>8}Hz {medida['caracteres_por_segundo']:>7}"
        )
        time.sleep(1.0)

    print("\nTabela para src/audiofy/voices.py:\n")
    for medida in sorted(medidas, key=lambda m: m["f0_hz"]):
        print(
            f'    "{medida["voz"]}": VoiceProfile({medida["f0_hz"]}, '
            f"{medida['brilho_hz']}, {medida['caracteres_por_segundo']}),"
        )
    print(f"\n{len(medidas)} voz(es) medidas.")
    (saida / "medidas.json").write_text(
        json.dumps(medidas, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
