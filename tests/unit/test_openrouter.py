"""Classificação de falhas do adaptador OpenRouter para retry seguro."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.providers.openrouter import (  # noqa: E402
    OpenRouterError,
    SpeechResult,
    _request,
    check_api_key,
    current_key_limit,
    generation_cost_usd,
    text_to_speech,
)


class OpenRouterRetryClassificationTest(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(require_api_key=lambda: "chave-de-teste")

    @patch("audiofy.providers.openrouter.time.sleep")
    @patch("audiofy.providers.openrouter.requests.request")
    def test_400_generico_do_provedor_tts_e_retomavel(self, request, _sleep):
        response = Mock(status_code=400, text='{"error":{"message":"Provider returned 400"}}')
        request.return_value = response

        with self.assertRaises(OpenRouterError) as raised:
            _request(self.settings, "POST", "/audio/speech", {"input": "fala"})

        self.assertTrue(raised.exception.retryable)
        self.assertEqual(raised.exception.status_code, 400)
        request.assert_called_once()

    @patch("audiofy.providers.openrouter.requests.request")
    def test_erro_de_autenticacao_nao_e_repetido(self, request):
        request.return_value = Mock(status_code=401, text="unauthorized")

        with self.assertRaises(OpenRouterError) as raised:
            _request(self.settings, "GET", "/credits")

        self.assertFalse(raised.exception.retryable)
        self.assertEqual(raised.exception.status_code, 401)
        request.assert_called_once()


class OpenRouterKeyLimitTest(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(require_api_key=lambda: "chave-de-teste")

    @patch("audiofy.providers.openrouter._request")
    def test_consulta_limite_da_chave_em_vez_do_saldo_global(self, request):
        request.return_value.json.return_value = {
            "data": {
                "label": "sk-or-v1-594...81d",
                "usage": 0.624287,
                "usage_monthly": 0.624287,
                "limit": 5,
                "limit_remaining": 4.375713,
                "limit_reset": None,
            }
        }

        limit = current_key_limit(self.settings)

        self.assertEqual(limit.label, "sk-or-v1-594...81d")
        self.assertEqual(limit.limit, 5.0)
        self.assertAlmostEqual(limit.remaining, 4.375713)
        request.assert_called_once_with(self.settings, "GET", "/key")

    @patch("audiofy.providers.openrouter.current_key_limit")
    def test_diagnostico_identifica_chave_e_saldo_do_limite(self, key_limit):
        key_limit.return_value = SimpleNamespace(
            label="sk-or-v1-594...81d",
            limit=5.0,
            remaining=4.375713,
            usage_monthly=0.624287,
            reset=None,
        )

        valid, detail = check_api_key(self.settings)

        self.assertTrue(valid)
        self.assertIn("sk-or-v1-594...81d", detail)
        self.assertIn("restante US$ 4.38", detail)
        self.assertIn("uso mensal US$ 0.62", detail)

    @patch("audiofy.providers.openrouter.current_key_limit")
    def test_limite_esgotado_nao_e_considerado_disponivel(self, key_limit):
        key_limit.return_value = SimpleNamespace(
            label="sk-or-v1-antiga...40e",
            limit=1.0,
            remaining=0.0,
            usage_monthly=1.02,
            reset="monthly",
        )

        valid, detail = check_api_key(self.settings)

        self.assertFalse(valid)
        self.assertIn("limite esgotado", detail)


class OpenRouterSpeechAccountingTest(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            require_api_key=lambda: "chave-de-teste",
            tts_model="vendor/tts",
            tts_format="pcm",
        )

    @patch("audiofy.providers.openrouter._request")
    def test_tts_preserva_identificador_da_geracao(self, request):
        request.return_value = Mock(
            content=b"x" * 600,
            text="",
            headers={
                "Content-Type": "audio/pcm",
                "X-Generation-Id": "gen-123",
            },
        )

        result = text_to_speech(self.settings, "olá", "Kore")

        self.assertEqual(result, SpeechResult(audio=b"x" * 600, generation_id="gen-123"))

    @patch("audiofy.providers.openrouter._request")
    def test_forcar_idioma_vai_no_payload_do_modelo_que_suporta(self, request):
        request.return_value = Mock(
            content=b"x" * 600, text="", headers={"Content-Type": "audio/pcm"}
        )
        settings = SimpleNamespace(
            require_api_key=lambda: "chave-de-teste",
            tts_model="minimax/speech-2.8-turbo",
            tts_format="mp3",
        )

        text_to_speech(settings, "olá", "Wise_Woman", language="pt-BR")

        payload = request.call_args[0][3]
        self.assertEqual(payload["language_boost"], "Portuguese")

    @patch("audiofy.providers.openrouter._request")
    def test_modelo_sem_suporte_nao_recebe_parametro_de_idioma(self, request):
        request.return_value = Mock(
            content=b"x" * 600, text="", headers={"Content-Type": "audio/pcm"}
        )
        # O provedor aceita parâmetro desconhecido com HTTP 200 e o ignora em
        # silêncio, então mandar onde não há suporte só criaria falsa confiança.
        settings = SimpleNamespace(
            require_api_key=lambda: "chave-de-teste",
            tts_model="hexgrad/kokoro-82m",
            tts_format="mp3",
        )

        text_to_speech(settings, "olá", "pf_dora", language="pt-BR")

        self.assertNotIn("language_boost", request.call_args[0][3])

    @patch("audiofy.providers.openrouter._request")
    def test_custo_da_geracao_vem_do_total_cost(self, request):
        request.return_value.json.return_value = {"data": {"total_cost": 0.012345}}

        self.assertEqual(generation_cost_usd(self.settings, "gen-123"), 0.012345)
        request.assert_called_once_with(self.settings, "GET", "/generation?id=gen-123")

    @patch("audiofy.providers.openrouter._request")
    def test_custo_invalido_da_geracao_e_rejeitado(self, request):
        request.return_value.json.return_value = {"data": {"total_cost": "nan"}}

        with self.assertRaisesRegex(OpenRouterError, "custo inválido"):
            generation_cost_usd(self.settings, "gen-123")


class SegmentFingerprintLanguageTest(unittest.TestCase):
    def test_trocar_idioma_invalida_o_audio_em_cache(self):
        """O idioma forçado muda o áudio, então precisa entrar no fingerprint.

        Sem isso, trocar o idioma reaproveitaria segmentos sintetizados com o
        idioma anterior — o episódio sairia com o áudio errado, em silêncio.
        """
        from audiofy.pipeline import _segment_fingerprint

        base = {
            "tts_model": "minimax/speech-2.8-turbo",
            "tts_format": "mp3",
            "tts_sample_rate": 24000,
            "force_language": True,
        }
        pt = SimpleNamespace(**base, language="pt-BR")
        en = SimpleNamespace(**base, language="en")

        self.assertNotEqual(
            _segment_fingerprint(pt, "olá", "Wise_Woman", "direção"),
            _segment_fingerprint(en, "olá", "Wise_Woman", "direção"),
        )

    def test_ligar_a_opcao_invalida_o_audio_gerado_sem_ela(self):
        """Marcar a caixa muda o áudio, então não pode reusar o anterior."""
        from audiofy.pipeline import _segment_fingerprint

        base = {
            "tts_model": "minimax/speech-2.8-turbo",
            "tts_format": "mp3",
            "tts_sample_rate": 24000,
            "language": "pt-BR",
        }
        desligado = SimpleNamespace(**base, force_language=False)
        ligado = SimpleNamespace(**base, force_language=True)

        self.assertNotEqual(
            _segment_fingerprint(desligado, "olá", "Wise_Woman", "direção"),
            _segment_fingerprint(ligado, "olá", "Wise_Woman", "direção"),
        )


class ForceLanguageSettingsTest(unittest.TestCase):
    @patch("audiofy.providers.openrouter._request")
    def test_idioma_so_vai_no_payload_quando_o_perfil_pede(self, request):
        """A opção é opt-in: sem ela, o comportamento atual é preservado."""
        request.return_value = Mock(
            content=b"x" * 600, text="", headers={"Content-Type": "audio/pcm"}
        )
        settings = SimpleNamespace(
            require_api_key=lambda: "chave-de-teste",
            tts_model="minimax/speech-2.8-turbo",
            tts_format="mp3",
        )

        text_to_speech(settings, "olá", "Wise_Woman", language="")

        self.assertNotIn("language_boost", request.call_args[0][3])


if __name__ == "__main__":
    unittest.main()
