"""Contrato entre o catálogo estático de vozes e o que o OpenRouter serve de fato.

O catálogo em ``audiofy.voices`` alimenta os seletores do frontend. Se ele
listar uma voz que o OpenRouter não aceita, o usuário escolhe uma opção que
falha só na hora de gerar o áudio — por isso o catálogo não pode ser mais
permissivo que a API.

A fixture ``openrouter_supported_voices.json`` é um snapshot do campo
``supported_voices`` de ``GET /models?output_modalities=speech``, capturado em
2026-07-28. Ela é a fonte de verdade destes testes; para atualizá-la, rode a
API ao vivo de novo e regrave o arquivo.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.voices import TTS_VOICE_CATALOGS  # noqa: E402

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "openrouter_supported_voices.json"
LIVE_VOICES: dict[str, list[str]] = json.loads(_FIXTURE.read_text(encoding="utf-8"))

# Modelos que o OpenRouter expõe sem nenhuma voz nomeada (``supported_voices``
# nulo). Não são catalogáveis: o frontend precisa cair no input de texto livre.
MODELS_WITHOUT_VOICE_CATALOG = {
    "minimax/speech-2.8-hd",
    "minimax/speech-2.8-turbo",
}


class VoiceCatalogContractTest(unittest.TestCase):
    def test_catalogo_nao_oferece_voz_que_a_api_nao_aceita(self):
        """Nenhum modelo pode listar voz ausente do ``supported_voices``."""
        invented: dict[str, list[str]] = {}
        for model_id, catalog in TTS_VOICE_CATALOGS.items():
            live = set(LIVE_VOICES.get(model_id, []))
            extra = sorted(set(catalog) - live)
            if extra:
                invented[model_id] = extra

        self.assertEqual(
            invented,
            {},
            "vozes catalogadas que o OpenRouter não aceita (falhariam ao gerar áudio)",
        )

    def test_catalogo_cobre_todas_as_vozes_que_a_api_oferece(self):
        """Nenhuma voz real pode ficar de fora do seletor."""
        missing: dict[str, list[str]] = {}
        for model_id, voices in LIVE_VOICES.items():
            if not voices:
                continue
            catalog = TTS_VOICE_CATALOGS.get(model_id, {})
            absent = sorted(set(voices) - set(catalog))
            if absent:
                missing[model_id] = absent

        self.assertEqual(missing, {}, "vozes reais do OpenRouter ausentes do catálogo")

    def test_modelos_sem_vozes_nomeadas_ficam_com_catalogo_vazio(self):
        """MiniMax não publica vozes pelo OpenRouter — catálogo vazio, não inventado."""
        for model_id in MODELS_WITHOUT_VOICE_CATALOG:
            self.assertEqual(
                TTS_VOICE_CATALOGS.get(model_id),
                {},
                f"{model_id} deve cair no input de texto livre",
            )

    def test_toda_voz_tem_descricao_nao_vazia(self):
        """Descrição vazia deixa o seletor sem idioma/tom para mostrar."""
        undescribed: dict[str, list[str]] = {}
        for model_id, catalog in TTS_VOICE_CATALOGS.items():
            blank = sorted(voice for voice, style in catalog.items() if not style.strip())
            if blank:
                undescribed[model_id] = blank

        self.assertEqual(undescribed, {}, "vozes sem descrição de idioma/tom")


if __name__ == "__main__":
    unittest.main()
