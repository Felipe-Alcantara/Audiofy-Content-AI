"""Adaptador OpenRouter: chat JSON com custo por chamada, TTS, catálogo e uso da conta.

Custo em tempo real:
- chat: a resposta traz `usage.cost` exato em US$;
- TTS: o cabeçalho `X-Generation-Id` liga o áudio binário ao custo individual consultado
  em `/generation`, sem misturar consumo de outras chaves da conta.
"""

from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass
from typing import Any

import requests

from ..config import OPENROUTER_BASE_URL, Settings

_HEADERS_EXTRA = {
    "HTTP-Referer": "https://github.com/Felipe-Alcantara/Audiofy-Content-AI",
    "X-Title": "Audiofy Content AI",
}

_MAX_RETRIES = 3
_TIMEOUT = 300

# Vozes do Gemini TTS (documentação oficial do modelo), com o caráter descrito
# pelo provedor. A lista é referência para configuração; a API não a expõe.
# Não há uma voz por idioma: a mesma voz fala qualquer um dos 24+ idiomas
# suportados pelo modelo, detectado a partir do texto de entrada — por isso
# a tag é "(multilíngue)" e não um código de idioma fixo.
# Fonte: https://ai.google.dev/gemini-api/docs/speech-generation
GEMINI_VOICES: dict[str, str] = {
    "Zephyr": "brilhante (multilíngue)",
    "Puck": "animada (multilíngue)",
    "Charon": "informativa (multilíngue)",
    "Kore": "firme (multilíngue)",
    "Fenrir": "empolgada (multilíngue)",
    "Leda": "jovem (multilíngue)",
    "Orus": "firme (multilíngue)",
    "Aoede": "leve (multilíngue)",
    "Callirrhoe": "tranquila (multilíngue)",
    "Autonoe": "brilhante (multilíngue)",
    "Enceladus": "sussurrada (multilíngue)",
    "Iapetus": "clara (multilíngue)",
    "Umbriel": "tranquila (multilíngue)",
    "Algieba": "suave (multilíngue)",
    "Despina": "suave (multilíngue)",
    "Erinome": "clara (multilíngue)",
    "Algenib": "rouca (multilíngue)",
    "Rasalgethi": "informativa (multilíngue)",
    "Laomedeia": "animada (multilíngue)",
    "Achernar": "macia (multilíngue)",
    "Alnilam": "firme (multilíngue)",
    "Schedar": "uniforme (multilíngue)",
    "Gacrux": "madura (multilíngue)",
    "Pulcherrima": "expressiva (multilíngue)",
    "Achird": "amigável (multilíngue)",
    "Zubenelgenubi": "casual (multilíngue)",
    "Vindemiatrix": "gentil (multilíngue)",
    "Sadachbia": "vivaz (multilíngue)",
    "Sadaltager": "erudita (multilíngue)",
    "Sulafat": "calorosa (multilíngue)",
}

# Vozes do Kokoro 82M (modelo leve e ultra-econômico) — catálogo completo:
# as 54 vozes que o OpenRouter aceita, confirmadas pelo ``supported_voices``
# de GET /models?output_modalities=speech.
# O prefixo do ID codifica idioma e gênero: a/b = inglês americano/britânico,
# e = espanhol, f = francês, h = hindi, i = italiano, j = japonês,
# p = português, z = chinês; a 2ª letra é f (feminina) ou m (masculina).
KOKORO_VOICES: dict[str, str] = {
    # PT-BR
    "pf_dora": "feminina (pt-BR)",
    "pm_alex": "masculina (pt-BR)",
    "pm_santa": "masculina festiva (pt-BR)",
    # EN — americano (femininas)
    "af_heart": "brilhante (en)",
    "af_alloy": "neutra (en)",
    "af_aoede": "leve (en)",
    "af_bella": "suave (en)",
    "af_jessica": "clara (en)",
    "af_kore": "firme (en)",
    "af_nicole": "macia (en)",
    "af_nova": "animada (en)",
    "af_river": "tranquila (en)",
    "af_sarah": "calorosa (en)",
    "af_sky": "jovem (en)",
    # EN — americano (masculinas)
    "am_adam": "firme (en)",
    "am_echo": "ressonante (en)",
    "am_eric": "clara (en)",
    "am_fenrir": "empolgada (en)",
    "am_liam": "madura (en)",
    "am_michael": "neutra (en)",
    "am_onyx": "profunda (en)",
    "am_puck": "animada (en)",
    "am_santa": "masculina festiva (en)",
    # EN — britânico
    "bf_alice": "feminina (en-GB)",
    "bf_emma": "suave (en-GB)",
    "bf_isabella": "feminina (en-GB)",
    "bf_lily": "feminina, jovem (en-GB)",
    "bm_daniel": "clara (en-GB)",
    "bm_fable": "masculina, narrativa (en-GB)",
    "bm_george": "madura (en-GB)",
    "bm_lewis": "masculina (en-GB)",
    # Espanhol
    "ef_dora": "feminina (es)",
    "em_alex": "masculina (es)",
    "em_santa": "masculina festiva (es)",
    # Francês
    "ff_siwis": "feminina (fr-FR)",
    # Hindi
    "hf_alpha": "feminina (hi)",
    "hf_beta": "feminina (hi)",
    "hm_omega": "masculina (hi)",
    "hm_psi": "masculina (hi)",
    # Italiano
    "if_sara": "feminina (it)",
    "im_nicola": "masculina (it)",
    # Japonês
    "jf_alpha": "feminina (ja)",
    "jf_gongitsune": "feminina, narrativa (ja)",
    "jf_nezumi": "feminina, suave (ja)",
    "jf_tebukuro": "feminina, narrativa (ja)",
    "jm_kumo": "masculina (ja)",
    # Chinês (mandarim)
    "zf_xiaobei": "feminina (zh-CN)",
    "zf_xiaoni": "feminina (zh-CN)",
    "zf_xiaoxiao": "feminina (zh-CN)",
    "zf_xiaoyi": "feminina (zh-CN)",
    "zm_yunjian": "masculina (zh-CN)",
    "zm_yunxi": "masculina (zh-CN)",
    "zm_yunxia": "masculina (zh-CN)",
    "zm_yunyang": "masculina (zh-CN)",
}

# Vozes do Orpheus 3B (Canopy Labs) — finetune de produção, só inglês.
# Fonte: https://github.com/canopyai/Orpheus-TTS
ORPHEUS_VOICES: dict[str, str] = {
    "tara": "voz recomendada, mais realista (en)",
    "leah": "feminina (en)",
    "jess": "feminina (en)",
    "leo": "masculina (en)",
    "dan": "masculina (en)",
    "mia": "feminina (en)",
    "zac": "masculina (en)",
}

# Vozes do Deepgram Aura-2 — catálogo oficial completo (9 idiomas, sem pt-BR).
# Fonte: https://developers.deepgram.com/docs/tts-models
DEEPGRAM_VOICES: dict[str, str] = {
    "aura-2-thalia-en": "feminina, clara, confiante (en-us)",
    "aura-2-andromeda-en": "feminina, casual, expressiva (en-us)",
    "aura-2-helena-en": "feminina, carinhosa, natural (en-us)",
    "aura-2-apollo-en": "masculina, confiante, confortável (en-us)",
    "aura-2-arcas-en": "masculina, natural, suave (en-us)",
    "aura-2-aries-en": "masculina, calorosa, enérgica (en-us)",
    "aura-2-amalthea-en": "feminina, envolvente, natural (en-ph)",
    "aura-2-asteria-en": "feminina, clara, confiante (en-us)",
    "aura-2-athena-en": "feminina, calma, suave (en-us)",
    "aura-2-atlas-en": "masculina, entusiasmada, confiante (en-us)",
    "aura-2-aurora-en": "feminina, alegre, expressiva (en-us)",
    "aura-2-callista-en": "feminina, clara, enérgica (en-us)",
    "aura-2-cora-en": "feminina, suave, melódica (en-us)",
    "aura-2-cordelia-en": "feminina, acessível, calorosa (en-us)",
    "aura-2-delia-en": "feminina, casual, amigável (en-us)",
    "aura-2-draco-en": "masculina, calorosa, barítono (en-gb)",
    "aura-2-electra-en": "feminina, profissional, envolvente (en-us)",
    "aura-2-harmonia-en": "feminina, empática, clara (en-us)",
    "aura-2-hera-en": "feminina, suave, calorosa (en-us)",
    "aura-2-hermes-en": "masculina, expressiva, envolvente (en-us)",
    "aura-2-hyperion-en": "masculina, carinhosa, calorosa (en-au)",
    "aura-2-iris-en": "feminina, alegre, positiva (en-us)",
    "aura-2-janus-en": "feminina, sotaque sulista, suave (en-us)",
    "aura-2-juno-en": "feminina, natural, envolvente (en-us)",
    "aura-2-jupiter-en": "masculina, expressiva, barítono (en-us)",
    "aura-2-luna-en": "feminina, amigável, natural (en-us)",
    "aura-2-mars-en": "masculina, suave, barítono (en-us)",
    "aura-2-minerva-en": "feminina, positiva, amigável (en-us)",
    "aura-2-neptune-en": "masculina, profissional, paciente (en-us)",
    "aura-2-odysseus-en": "masculina, calma, profissional (en-us)",
    "aura-2-ophelia-en": "feminina, expressiva, entusiasmada (en-us)",
    "aura-2-orion-en": "masculina, acessível, calma (en-us)",
    "aura-2-orpheus-en": "masculina, profissional, confiante (en-us)",
    "aura-2-pandora-en": "feminina, suave, calma (en-gb)",
    "aura-2-phoebe-en": "feminina, enérgica, calorosa (en-us)",
    "aura-2-pluto-en": "masculina, suave, barítono (en-us)",
    "aura-2-saturn-en": "masculina, culta, barítono (en-us)",
    "aura-2-selene-en": "feminina, expressiva, enérgica (en-us)",
    "aura-2-theia-en": "feminina, expressiva, sincera (en-au)",
    "aura-2-vesta-en": "feminina, natural, paciente (en-us)",
    "aura-2-zeus-en": "masculina, profunda, confiável (en-us)",
    "aura-2-sirio-es": "masculina, calma, barítono (es-mx)",
    "aura-2-nestor-es": "masculina, calma, profissional (es-es)",
    "aura-2-carina-es": "feminina, profissional, enérgica (es-es)",
    "aura-2-celeste-es": "feminina, clara, enérgica (es-co)",
    "aura-2-alvaro-es": "masculina, calma, culta (es-es)",
    "aura-2-diana-es": "feminina, profissional, confiante (es-es)",
    "aura-2-aquila-es": "masculina, expressiva, entusiasmada (es-419)",
    "aura-2-selena-es": "feminina, acessível, casual (es-419)",
    "aura-2-estrella-es": "feminina, acessível, natural (es-mx)",
    "aura-2-javier-es": "masculina, acessível, profissional (es-mx)",
    "aura-2-agustina-es": "feminina, calma, clara (es-es)",
    "aura-2-antonia-es": "feminina, acessível, entusiasmada (es-ar)",
    "aura-2-gloria-es": "feminina, casual, clara (es-co)",
    "aura-2-luciano-es": "masculina, carismática, alegre (es-mx)",
    "aura-2-olivia-es": "feminina, sussurrada, calma (es-mx)",
    "aura-2-silvia-es": "feminina, carismática, clara (es-es)",
    "aura-2-valerio-es": "masculina, profunda, culta (es-mx)",
    "aura-2-beatrix-nl": "feminina, alegre, calorosa (nl-nl)",
    "aura-2-daphne-nl": "feminina, calma, clara (nl-nl)",
    "aura-2-cornelia-nl": "feminina, acessível, amigável (nl-nl)",
    "aura-2-sander-nl": "masculina, calma, profunda (nl-nl)",
    "aura-2-hestia-nl": "feminina, acessível, carinhosa (nl-nl)",
    "aura-2-lars-nl": "masculina, sussurrada, casual (nl-nl)",
    "aura-2-roman-nl": "masculina, calma, profunda (nl-nl)",
    "aura-2-rhea-nl": "feminina, carinhosa, calorosa (nl-nl)",
    "aura-2-leda-nl": "feminina, carinhosa, empática (nl-nl)",
    "aura-2-agathe-fr": "feminina, carismática, alegre (fr-fr)",
    "aura-2-hector-fr": "masculina, confiante, empática (fr-fr)",
    "aura-2-elara-de": "feminina, calma, confiável (de-de)",
    "aura-2-aurelia-de": "feminina, acessível, casual (de-de)",
    "aura-2-lara-de": "feminina, carinhosa, alegre (de-de)",
    "aura-2-julius-de": "masculina, casual, alegre (de-de)",
    "aura-2-fabian-de": "masculina, confiante, culta (de-de)",
    "aura-2-kara-de": "feminina, carinhosa, empática (de-de)",
    "aura-2-viktoria-de": "feminina, carismática, alegre (de-de)",
    "aura-2-melia-it": "feminina, clara, amigável (it-it)",
    "aura-2-elio-it": "masculina, calma, profissional (it-it)",
    "aura-2-flavio-it": "masculina, confiante, profunda (it-it)",
    "aura-2-maia-it": "feminina, carinhosa, enérgica (it-it)",
    "aura-2-cinzia-it": "feminina, acessível, calorosa (it-it)",
    "aura-2-cesare-it": "masculina, clara, empática (it-it)",
    "aura-2-livia-it": "feminina, acessível, alegre (it-it)",
    "aura-2-dionisio-it": "masculina, confiante, envolvente (it-it)",
    "aura-2-demetra-it": "feminina, calma, paciente (it-it)",
    "aura-2-uzume-ja": "feminina, acessível, clara (ja-jp)",
    "aura-2-ebisu-ja": "masculina, calma, profunda (ja-jp)",
    "aura-2-fujin-ja": "masculina, calma, confiante (ja-jp)",
    "aura-2-izanami-ja": "feminina, acessível, clara (ja-jp)",
    "aura-2-ama-ja": "feminina, casual, confiante (ja-jp)",
}

# Vozes do Microsoft MAI-Voice-2 (compartilhadas com a variante -flash).
# Catálogo completo do que o OpenRouter aceita: apenas estas 4 vozes constam
# do ``supported_voices`` da API. A doc da Microsoft lista dezenas de outras
# (inclusive pt-BR), mas elas são do Azure Speech direto — pelo OpenRouter
# retornam erro de voz inválida, então não podem ser oferecidas aqui.
# Fonte: supported_voices de GET /models?output_modalities=speech
MAI_VOICE_VOICES: dict[str, str] = {
    "en-US-Harper:MAI-Voice-2": "feminina (en-US)",
    "es-MX-Valeria:MAI-Voice-2": "feminina (es-MX)",
    "fr-FR-Soleil:MAI-Voice-2": "feminina (fr-FR)",
    "de-DE-Klaus:MAI-Voice-2": "masculina (de-DE)",
}

# MiniMax Speech 2.8 (hd e turbo) — sem catálogo de vozes pelo OpenRouter:
# ``supported_voices`` vem nulo na API. O MiniMax tem 300+ vozes no serviço
# próprio dele, mas os IDs não são expostos aqui e não são adivinháveis, então
# o catálogo fica vazio de propósito e o frontend cai no input de texto livre
# (quem souber um voice_id válido do MiniMax pode digitá-lo).
# Fonte: supported_voices de GET /models?output_modalities=speech
MINIMAX_VOICES: dict[str, str] = {}

# Voxtral Mini TTS (Mistral) — vozes reais confirmadas ao vivo pela API do
# OpenRouter (4 locutores × variações de emoção, sem português apesar da
# doc de marketing citar 9 idiomas suportados no modelo).
# Fonte: supported_voices retornado por GET /models?output_modalities=speech
VOXTRAL_VOICES: dict[str, str] = {
    "en_paul_sad": "masculina, triste (en-us)",
    "en_paul_neutral": "masculina, neutra (en-us)",
    "en_paul_happy": "masculina, feliz (en-us)",
    "en_paul_frustrated": "masculina, frustrada (en-us)",
    "en_paul_excited": "masculina, animada (en-us)",
    "en_paul_confident": "masculina, confiante (en-us)",
    "en_paul_cheerful": "masculina, alegre (en-us)",
    "en_paul_angry": "masculina, irritada (en-us)",
    "gb_oliver_neutral": "masculina, neutra (en-gb)",
    "gb_oliver_sad": "masculina, triste (en-gb)",
    "gb_oliver_excited": "masculina, animada (en-gb)",
    "gb_oliver_curious": "masculina, curiosa (en-gb)",
    "gb_oliver_confident": "masculina, confiante (en-gb)",
    "gb_oliver_cheerful": "masculina, alegre (en-gb)",
    "gb_oliver_angry": "masculina, irritada (en-gb)",
    "gb_jane_sarcasm": "feminina, sarcástica (en-gb)",
    "gb_jane_confused": "feminina, confusa (en-gb)",
    "gb_jane_shameful": "feminina, envergonhada (en-gb)",
    "gb_jane_sad": "feminina, triste (en-gb)",
    "gb_jane_neutral": "feminina, neutra (en-gb)",
    "gb_jane_jealousy": "feminina, ciumenta (en-gb)",
    "gb_jane_frustrated": "feminina, frustrada (en-gb)",
    "gb_jane_curious": "feminina, curiosa (en-gb)",
    "gb_jane_confident": "feminina, confiante (en-gb)",
    "fr_marie_sad": "feminina, triste (fr-fr)",
    "fr_marie_neutral": "feminina, neutra (fr-fr)",
    "fr_marie_happy": "feminina, feliz (fr-fr)",
    "fr_marie_excited": "feminina, animada (fr-fr)",
    "fr_marie_curious": "feminina, curiosa (fr-fr)",
    "fr_marie_angry": "feminina, irritada (fr-fr)",
}

# Grok Voice TTS (xAI) — 5 vozes built-in, detecção automática de idioma
# entre 20+ idiomas (voz não é amarrada a um idioma fixo).
# Fonte: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
GROK_VOICES: dict[str, str] = {
    "eve": "voz padrão (multilíngue, detecção automática)",
    "ara": "tom alternativo (multilíngue, detecção automática)",
    "rex": "tom alternativo (multilíngue, detecção automática)",
    "sal": "tom alternativo (multilíngue, detecção automática)",
    "leo": "tom alternativo (multilíngue, detecção automática)",
}

# CSM-1B (Sesame) — vozes preset reais confirmadas ao vivo pela API do
# OpenRouter (o modelo aberto em si só faz voice cloning por contexto de
# áudio, mas o provedor expõe estes presets fixos). Treinado
# majoritariamente em inglês; sem suporte a português documentado.
# Fonte: supported_voices retornado por GET /models?output_modalities=speech
CSM_VOICES: dict[str, str] = {
    "conversational_a": "conversacional (en)",
    "conversational_b": "conversacional (en)",
    "read_speech_a": "leitura (en)",
    "read_speech_b": "leitura (en)",
    "read_speech_c": "leitura (en)",
    "read_speech_d": "leitura (en)",
    "none": "sem preset — usa a voz padrão do modelo",
}

# Zonos v0.1 (Zyphra, hybrid e transformer) — vozes preset reais confirmadas
# ao vivo pela API do OpenRouter (o modelo aberto em si faz clonagem por
# speaker-embedding, mas o provedor expõe estes presets fixos).
# Fonte: supported_voices retornado por GET /models?output_modalities=speech
ZONOS_VOICES: dict[str, str] = {
    "american_female": "feminina (en-us)",
    "american_male": "masculina (en-us)",
    "british_female": "feminina (en-gb)",
    "british_male": "masculina (en-gb)",
    "random": "sorteada a cada geração (idioma variável)",
}

# Qwen-Audio-TTS Flash (Alibaba Cloud Model Studio) — vozes bilíngues
# mandarim/inglês, exceto loongjohn (só inglês).
# Fonte: https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list
QWEN_TTS_FLASH_VOICES: dict[str, str] = {
    "loongjohn": "masculina (en)",
    "longanhuan_v3.6": "feminina (zh+en)",
}

# Qwen-Audio-TTS Plus (Alibaba Cloud Model Studio) — vozes bilíngues
# mandarim/inglês.
# Fonte: https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list
QWEN_TTS_PLUS_VOICES: dict[str, str] = {
    "longanlingxin": "feminina (zh+en)",
    "longanlufeng": "masculina (zh+en)",
}


class OpenRouterError(RuntimeError):
    """Falha controlada da integração, classificada para retry seguro."""

    def __init__(
        self, message: str, *, retryable: bool = False, status_code: int | None = None
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


@dataclass(frozen=True)
class ChatResult:
    data: Any  # JSON decodificado da resposta do modelo
    cost_usd: float
    prompt_tokens: int
    completion_tokens: int


@dataclass(frozen=True)
class SpeechResult:
    audio: bytes
    generation_id: str | None


def _request(
    settings: Settings, method: str, endpoint: str, payload: dict[str, Any] | None = None
) -> requests.Response:
    headers = {"Authorization": f"Bearer {settings.require_api_key()}", **_HEADERS_EXTRA}
    last_error: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.request(
                method,
                f"{OPENROUTER_BASE_URL}{endpoint}",
                json=payload,
                headers=headers,
                timeout=_TIMEOUT,
            )
            if response.status_code in (408, 425, 429, 500, 502, 503, 504):
                raise OpenRouterError(
                    f"HTTP {response.status_code} (transitório)",
                    retryable=True,
                    status_code=response.status_code,
                )
            if response.status_code != 200:
                # Não logar o corpo integral: pode ecoar conteúdo ou detalhes do provedor.
                provider_rejected = (
                    endpoint == "/audio/speech"
                    and response.status_code == 400
                    and "Provider returned 400" in response.text
                )
                raise OpenRouterError(
                    f"HTTP {response.status_code} em {endpoint}: {response.text[:300]}",
                    retryable=provider_rejected,
                    status_code=response.status_code,
                )
            return response
        except requests.RequestException as error:
            last_error = error
            # No TTS, o pipeline controla a tentativa por fala e a expõe no status.
            if endpoint == "/audio/speech":
                raise OpenRouterError(
                    f"Falha de rede em {endpoint}: {error}", retryable=True
                ) from error
        except OpenRouterError as error:
            last_error = error
            if not error.retryable or endpoint == "/audio/speech":
                raise
        if attempt < _MAX_RETRIES:
            time.sleep(2**attempt)
    raise OpenRouterError(
        f"Falha após {_MAX_RETRIES} tentativas em {endpoint}: {last_error}",
        retryable=True,
        status_code=getattr(last_error, "status_code", None),
    )


def _extract_json(text: str) -> Any:
    """Aceita JSON puro ou cercado por ```json ... ```."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=0)
    return json.loads(text[start:])


def chat_json(settings: Settings, model: str, system: str, user: str) -> ChatResult:
    """Chat que exige resposta JSON; retorna o dado decodificado e o custo exato."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
        "usage": {"include": True},
    }
    body = _request(settings, "POST", "/chat/completions", payload).json()
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    try:
        data = _extract_json(content)
    except (json.JSONDecodeError, ValueError) as error:
        raise OpenRouterError(f"Modelo {model} não retornou JSON válido: {error}") from error
    return ChatResult(
        data=data,
        cost_usd=float(usage.get("cost", 0.0) or 0.0),
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
    )


def text_to_speech(
    settings: Settings, text: str, voice: str, instructions: str = ""
) -> SpeechResult:
    """Sintetiza uma fala e preserva o ID necessário para auditar seu custo."""
    payload: dict[str, Any] = {
        "model": settings.tts_model,
        "input": text,
        "voice": voice,
        "response_format": settings.tts_format,
    }
    if instructions:
        payload["instructions"] = instructions
    response = _request(settings, "POST", "/audio/speech", payload)
    content_type = response.headers.get("Content-Type", "")
    if "json" in content_type:
        raise OpenRouterError(
            f"TTS retornou JSON em vez de áudio: {response.text[:300]}", retryable=True
        )
    if len(response.content) < 512:
        raise OpenRouterError("TTS retornou resposta vazia ou curta demais.", retryable=True)
    return SpeechResult(
        audio=response.content,
        generation_id=response.headers.get("X-Generation-Id") or None,
    )


def generation_cost_usd(settings: Settings, generation_id: str) -> float:
    """Retorna o custo faturado de uma geração individual."""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", generation_id or ""):
        raise ValueError("generation_id inválido")
    endpoint = f"/generation?id={generation_id}"
    last_error: OpenRouterError | None = None
    # O registro pode aparecer alguns instantes depois do stream binário do TTS.
    for attempt in range(4):
        try:
            body = _request(settings, "GET", endpoint).json()
            data = body.get("data") or {}
            if not isinstance(data, dict):
                raise OpenRouterError("A geração retornou metadados inválidos.")
            value = data.get("total_cost", data.get("usage"))
            if value is None:
                raise OpenRouterError("A geração não informou custo.")
            cost = float(value)
            if not math.isfinite(cost) or cost < 0:
                raise OpenRouterError("A geração informou custo inválido.")
            return cost
        except OpenRouterError as error:
            last_error = error
            if error.status_code != 404 or attempt == 3:
                raise
            time.sleep(0.5 * (attempt + 1))
    raise last_error or OpenRouterError("Custo da geração indisponível.")


def account_usage_usd(settings: Settings) -> float:
    """Uso acumulado da conta em US$ (endpoint /credits)."""
    body = _request(settings, "GET", "/credits").json()
    return float(body.get("data", {}).get("total_usage", 0.0) or 0.0)


@dataclass(frozen=True)
class AccountBalance:
    total_credits: float
    total_usage: float

    @property
    def remaining(self) -> float:
        return self.total_credits - self.total_usage


def account_balance(settings: Settings) -> AccountBalance:
    """Créditos comprados, uso acumulado e saldo restante da conta."""
    data = _request(settings, "GET", "/credits").json().get("data", {})
    return AccountBalance(
        total_credits=float(data.get("total_credits", 0.0) or 0.0),
        total_usage=float(data.get("total_usage", 0.0) or 0.0),
    )


@dataclass(frozen=True)
class KeyLimit:
    """Uso e limite próprios da chave que autenticou a requisição."""

    label: str
    usage: float
    usage_monthly: float
    limit: float | None
    remaining: float | None
    reset: str | None


def current_key_limit(settings: Settings) -> KeyLimit:
    """Consulta o limite da chave ativa, que é independente do saldo da conta."""
    data = _request(settings, "GET", "/key").json().get("data", {})

    def optional_float(name: str) -> float | None:
        value = data.get(name)
        return None if value is None else float(value)

    return KeyLimit(
        label=str(data.get("label", "") or ""),
        usage=float(data.get("usage", 0.0) or 0.0),
        usage_monthly=float(data.get("usage_monthly", 0.0) or 0.0),
        limit=optional_float("limit"),
        remaining=optional_float("limit_remaining"),
        reset=data.get("limit_reset"),
    )


def check_api_key(settings: Settings) -> tuple[bool, str]:
    """Valida a chave contra a API; retorna (ok, motivo/resumo)."""
    try:
        key = current_key_limit(settings)
        label = f" {key.label}" if key.label else ""
        if key.limit is None:
            detail = "sem limite próprio"
        elif key.remaining is None:
            detail = f"limite US$ {key.limit:.2f}"
        else:
            detail = f"limite US$ {key.limit:.2f}, restante US$ {key.remaining:.2f}"
        reset = f", renovação {key.reset}" if key.reset else ""
        available = key.remaining is None or key.remaining > 0
        availability = "válida" if available else "válida, mas com limite esgotado"
        return available, (
            f"chave{label} {availability} — {detail} "
            f"(uso mensal US$ {key.usage_monthly:.2f}{reset})"
        )
    except (OpenRouterError, RuntimeError) as error:
        return False, str(error)


def check_api_key_value(api_key: str) -> tuple[bool, str]:
    """Verifica uma chave específica sem alterar a seleção persistida nem expor seu valor."""
    if not api_key:
        return False, "nenhuma chave disponível nessa origem"
    return check_api_key(Settings(api_key=api_key))


def list_tts_models(settings: Settings) -> list[dict[str, Any]]:
    """Modelos com saída de áudio disponíveis no catálogo do OpenRouter."""
    # O catálogo distingue modelos que sintetizam fala (``speech``) de modelos
    # multimodais/musicais que apenas declaram saída ``audio``.
    body = _request(settings, "GET", "/models?output_modalities=speech").json()
    models = []
    for model in body.get("data", []):
        pricing = model.get("pricing", {})
        models.append(
            {
                "id": model.get("id", ""),
                "name": model.get("name", ""),
                "prompt_price": pricing.get("prompt", ""),
                "completion_price": pricing.get("completion", ""),
                "supported_voices": model.get("supported_voices") or [],
            }
        )
    return sorted(models, key=lambda m: m["id"])
