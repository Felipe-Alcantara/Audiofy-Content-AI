"""Catálogo unificado de vozes por modelo TTS e classificação por tier de custo.

Centraliza o mapeamento modelo TTS → vozes disponíveis para que o frontend,
a TUI e a validação do pipeline usem a mesma fonte de verdade. GEMINI_VOICES
e KOKORO_VOICES continuam em ``openrouter.py`` (compatibilidade); este módulo
os importa e re-exporta via ``TTS_VOICE_CATALOGS``.
"""

from __future__ import annotations

from dataclasses import dataclass

from .providers.openrouter import (
    CSM_VOICES,
    DEEPGRAM_VOICES,
    GEMINI_VOICES,
    GROK_VOICES,
    KOKORO_VOICES,
    MAI_VOICE_VOICES,
    MINIMAX_VOICES,
    ORPHEUS_VOICES,
    QWEN_TTS_FLASH_VOICES,
    QWEN_TTS_PLUS_VOICES,
    VOXTRAL_VOICES,
    ZONOS_VOICES,
)

# ── Catálogo de vozes por modelo TTS ──────────────────────────────────────────
# Modelos com catálogo conhecido → dict {nome_voz: descrição}.
# Modelos sem catálogo (voice cloning por referência de áudio, sem vozes
# preset nomeadas) → dict vazio (frontend mostra input de texto livre).

TTS_VOICE_CATALOGS: dict[str, dict[str, str]] = {
    "google/gemini-3.1-flash-tts-preview": GEMINI_VOICES,
    "hexgrad/kokoro-82m": KOKORO_VOICES,
    "canopylabs/orpheus-3b-0.1-ft": ORPHEUS_VOICES,
    "deepgram/aura-2": DEEPGRAM_VOICES,
    "microsoft/mai-voice-2": MAI_VOICE_VOICES,
    "microsoft/mai-voice-2-flash": MAI_VOICE_VOICES,
    "minimax/speech-2.8-hd": MINIMAX_VOICES,
    "minimax/speech-2.8-turbo": MINIMAX_VOICES,
    "mistralai/voxtral-mini-tts-2603": VOXTRAL_VOICES,
    "sesame/csm-1b": CSM_VOICES,
    "x-ai/grok-voice-tts-1.0": GROK_VOICES,
    "zyphra/zonos-v0.1-hybrid": ZONOS_VOICES,
    "zyphra/zonos-v0.1-transformer": ZONOS_VOICES,
    "qwen/qwen-audio-3.0-tts-flash": QWEN_TTS_FLASH_VOICES,
    "qwen/qwen-audio-3.0-tts-plus": QWEN_TTS_PLUS_VOICES,
}

# ── Perfil medido de cada voz ─────────────────────────────────────────────────
# O catálogo diz o nome da voz e um rótulo de tom, mas nome não descreve som:
# medindo, `Fenrir` e `Alnilam` não são vozes masculinas, apesar de soarem
# assim no nome. Quem escolhe pelo nome só descobre o erro depois de pagar por
# um episódio inteiro.
#
# Estes números vêm de `scripts/measure_voices.py`: a mesma frase sintetizada
# três vezes por voz, medindo tom fundamental (autocorrelação), brilho (mesma
# métrica da auditoria de qualidade) e velocidade de leitura.
#
# A faixa entre `pitch_min_hz` e `pitch_max_hz` não é imprecisão do medidor: é
# a voz que muda de uma geração para outra. `Charon` mediu 146, 159 e 174 Hz;
# `Sulafat`, 224, 224 e 226. Publicar só a mediana esconderia essa diferença de
# quem precisa escolher uma voz confiável para uma apresentação.


@dataclass(frozen=True)
class VoiceProfile:
    """Como a voz soa de fato, medido em três gerações."""

    pitch_hz: int
    pitch_min_hz: int
    pitch_max_hz: int
    brightness_hz: int
    chars_per_second: float


#: Fronteiras de rótulo. A variação típica entre gerações é de ~17 Hz, então
#: vozes perto da fronteira recebem "intermediária" — é mais honesto do que
#: afirmar um lado que a próxima geração pode desmentir.
PITCH_LOW_HZ = 160
PITCH_HIGH_HZ = 190

VOICE_PROFILES: dict[str, VoiceProfile] = {
    "Algenib": VoiceProfile(133, 131, 141, 1870, 13.0),
    "Sadaltager": VoiceProfile(139, 130, 159, 1670, 13.1),
    "Umbriel": VoiceProfile(142, 135, 143, 1674, 13.2),
    "Enceladus": VoiceProfile(144, 139, 149, 1523, 12.5),
    "Gacrux": VoiceProfile(146, 137, 159, 1684, 13.4),
    "Algieba": VoiceProfile(147, 135, 152, 1862, 12.9),
    "Puck": VoiceProfile(150, 144, 157, 1913, 13.5),
    "Iapetus": VoiceProfile(152, 150, 161, 1618, 12.7),
    "Pulcherrima": VoiceProfile(152, 150, 155, 1582, 13.3),
    "Sadachbia": VoiceProfile(154, 145, 156, 1692, 13.3),
    "Schedar": VoiceProfile(157, 133, 176, 2706, 13.2),
    "Alnilam": VoiceProfile(158, 152, 164, 1490, 14.2),
    "Rasalgethi": VoiceProfile(158, 146, 164, 1536, 12.7),
    "Charon": VoiceProfile(159, 146, 174, 1550, 13.7),
    "Achird": VoiceProfile(161, 149, 180, 1600, 13.6),
    "Zubenelgenubi": VoiceProfile(168, 154, 182, 1338, 12.8),
    "Orus": VoiceProfile(173, 166, 194, 1572, 12.9),
    "Fenrir": VoiceProfile(183, 180, 190, 1739, 13.4),
    "Laomedeia": VoiceProfile(193, 185, 214, 1349, 13.2),
    "Aoede": VoiceProfile(200, 189, 202, 1706, 13.3),
    "Despina": VoiceProfile(200, 198, 220, 1596, 13.1),
    "Kore": VoiceProfile(203, 194, 218, 1700, 13.2),
    "Zephyr": VoiceProfile(204, 198, 211, 1640, 13.0),
    "Vindemiatrix": VoiceProfile(209, 195, 222, 1667, 13.2),
    "Callirrhoe": VoiceProfile(211, 205, 222, 1480, 13.4),
    "Erinome": VoiceProfile(212, 212, 230, 1462, 13.0),
    "Autonoe": VoiceProfile(216, 212, 216, 1633, 13.2),
    "Achernar": VoiceProfile(219, 202, 222, 1933, 13.2),
    "Leda": VoiceProfile(224, 220, 226, 1754, 13.5),
    "Sulafat": VoiceProfile(224, 224, 226, 1928, 13.4),
}


def voice_profile(voice: str) -> VoiceProfile | None:
    """Perfil medido da voz, ou ``None`` quando ela ainda não foi medida."""
    return VOICE_PROFILES.get(voice)


def pitch_label(profile: VoiceProfile | None) -> str:
    """Rótulo de tom a partir da medição, não do nome da voz."""
    if profile is None:
        return "sem medição"
    if profile.pitch_hz < PITCH_LOW_HZ:
        return "grave"
    if profile.pitch_hz < PITCH_HIGH_HZ:
        return "intermediária"
    return "aguda"


def voice_summary(voice: str) -> str:
    """Resumo para o seletor: rótulo, tom medido e velocidade de leitura."""
    profile = voice_profile(voice)
    if profile is None:
        return ""
    return (
        f"{pitch_label(profile)} · {profile.pitch_hz} Hz "
        f"({profile.pitch_min_hz}-{profile.pitch_max_hz}) · "
        f"{profile.chars_per_second:.1f} car/s"
    )


# ── Tiers de custo/qualidade ──────────────────────────────────────────────────
# O custo efetivo por milhão de caracteres considera tanto tokens de entrada
# quanto de saída. Para modelos que cobram apenas entrada, o valor é direto;
# para o Gemini TTS (entrada + saída de áudio), o custo efetivo é ~48× maior
# que o input isolado porque a saída domina o custo.

_TIER_ULTRA = "ultra-economico"
_TIER_ECO = "economico"
_TIER_STD = "padrao"
_TIER_PREMIUM = "premium"

TTS_TIERS: dict[str, dict[str, object]] = {
    "hexgrad/kokoro-82m": {
        "tier": _TIER_ULTRA,
        "label": "Ultra-econômico",
        "effective_cost_per_m_chars": 0.62,
    },
    "canopylabs/orpheus-3b-0.1-ft": {
        "tier": _TIER_ECO,
        "label": "Econômico",
        "effective_cost_per_m_chars": 7.0,
    },
    "sesame/csm-1b": {
        "tier": _TIER_ECO,
        "label": "Econômico",
        "effective_cost_per_m_chars": 7.0,
    },
    "zyphra/zonos-v0.1-hybrid": {
        "tier": _TIER_ECO,
        "label": "Econômico",
        "effective_cost_per_m_chars": 7.0,
    },
    "zyphra/zonos-v0.1-transformer": {
        "tier": _TIER_ECO,
        "label": "Econômico",
        "effective_cost_per_m_chars": 7.0,
    },
    "x-ai/grok-voice-tts-1.0": {
        "tier": _TIER_STD,
        "label": "Padrão",
        "effective_cost_per_m_chars": 15.0,
    },
    "mistralai/voxtral-mini-tts-2603": {
        "tier": _TIER_STD,
        "label": "Padrão",
        "effective_cost_per_m_chars": 16.0,
    },
    "microsoft/mai-voice-2": {
        "tier": _TIER_STD,
        "label": "Padrão",
        "effective_cost_per_m_chars": 22.0,
    },
    "deepgram/aura-2": {
        "tier": _TIER_STD,
        "label": "Padrão",
        "effective_cost_per_m_chars": 30.0,
    },
    "google/gemini-3.1-flash-tts-preview": {
        "tier": _TIER_PREMIUM,
        "label": "Premium",
        "effective_cost_per_m_chars": 48.0,
    },
    "minimax/speech-2.8-turbo": {
        "tier": _TIER_PREMIUM,
        "label": "Premium",
        "effective_cost_per_m_chars": 60.0,
    },
    "minimax/speech-2.8-hd": {
        "tier": _TIER_PREMIUM,
        "label": "Premium",
        "effective_cost_per_m_chars": 100.0,
    },
}

# ── Ambiguidade de idioma ─────────────────────────────────────────────────────
# Modelos cujas vozes não são amarradas a um idioma: eles detectam o idioma
# pelo texto de entrada. Para o português isso é um problema prático — a
# detecção trata "português" como uma coisa só e tende ao europeu, chegando a
# alternar de variante no meio da leitura. Quem escolhe a voz precisa saber
# disso antes de gerar o áudio (e pagar por ele).
#
# Modelos com voz por idioma (Kokoro, Deepgram, MAI-Voice-2…) não entram aqui:
# neles ``pf_dora`` é pt-BR e nada mais.

LANGUAGE_AMBIGUOUS_MODELS: frozenset[str] = frozenset(
    {
        "x-ai/grok-voice-tts-1.0",
        "google/gemini-3.1-flash-tts-preview",
        "minimax/speech-2.8-hd",
        "minimax/speech-2.8-turbo",
        "qwen/qwen-audio-3.0-tts-flash",
        "qwen/qwen-audio-3.0-tts-plus",
    }
)

# Modelos que aceitam forçar o idioma no payload, em vez de deixar o modelo
# adivinhar. Só entram aqui os casos em que o efeito foi confirmado ao vivo:
# enviar valores diferentes de ``language_boost`` produz áudios diferentes.
#
# O Grok ficou de fora de propósito. O parâmetro é aceito sem erro, mas o
# modelo não é determinístico nem com ``seed`` fixo, então não foi possível
# distinguir o efeito do parâmetro da variação natural entre execuções —
# oferecer a opção prometeria uma garantia que não temos.
#
# Atenção: o provedor não valida o valor. Um ``language_boost`` desconhecido
# é aceito com HTTP 200 e tratado como automático, falhando em silêncio; por
# isso o valor enviado vem sempre da tabela abaixo, nunca do texto do usuário.

LANGUAGE_FORCING_MODELS: frozenset[str] = frozenset(
    {
        "minimax/speech-2.8-hd",
        "minimax/speech-2.8-turbo",
    }
)

# Nome do idioma como o provedor espera receber em ``language_boost``.
_LANGUAGE_BOOST_NAMES: dict[str, str] = {
    "pt-BR": "Portuguese",
    "pt-PT": "Portuguese",
    "en": "English",
    "en-US": "English",
    "es": "Spanish",
}


def supports_language_forcing(tts_model_id: str) -> bool:
    """Indica se o modelo aceita forçar o idioma em vez de detectá-lo."""
    return tts_model_id in LANGUAGE_FORCING_MODELS


def is_language_ambiguous(tts_model_id: str) -> bool:
    """Indica se o modelo detecta o idioma e pode variar a variante regional."""
    return tts_model_id in LANGUAGE_AMBIGUOUS_MODELS


def language_boost_value(tts_model_id: str, language: str) -> str | None:
    """Valor de ``language_boost`` para o modelo, ou ``None`` se não se aplica."""
    if tts_model_id not in LANGUAGE_FORCING_MODELS:
        return None
    return _LANGUAGE_BOOST_NAMES.get(language)


# ── Mapa agregado para busca rápida ──────────────────────────────────────────

ALL_KNOWN_VOICES: dict[str, str] = {}
for _catalog in TTS_VOICE_CATALOGS.values():
    ALL_KNOWN_VOICES.update(_catalog)


def voices_for_model(tts_model_id: str) -> dict[str, str] | None:
    """Catálogo de vozes do modelo, ou ``None`` se não há catálogo conhecido."""
    return TTS_VOICE_CATALOGS.get(tts_model_id)


def is_known_voice(voice: str) -> bool:
    """Verifica se a voz existe em qualquer catálogo registrado."""
    return voice in ALL_KNOWN_VOICES


def voice_style(voice: str) -> str:
    """Descrição de estilo da voz em qualquer catálogo, ou string vazia."""
    return ALL_KNOWN_VOICES.get(voice, "")
