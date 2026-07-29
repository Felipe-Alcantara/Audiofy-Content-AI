"""Síntese de TTS em paralelo: ordem final, cache, erro e abort sob concorrência.

Complementa test_pipeline_resume.py, que cobre o comportamento sequencial
(concorrência 1) do mesmo `_synthesize_turns`. Aqui o foco é o que muda quando
vários trechos são sintetizados ao mesmo tempo: a lista final de segmentos
precisa continuar na ordem original dos turnos independentemente da ordem de
conclusão, trechos em cache não podem entrar no executor, um erro real
propaga sem travar a geração, e um abort pedido por outra thread encerra tudo.
"""

import json
import sys
import tempfile
import threading
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.artifacts import segment_audio_filename  # noqa: E402
from audiofy.pipeline import _synthesize_turns  # noqa: E402
from audiofy.presenters import Presenter  # noqa: E402
from audiofy.providers.openrouter import OpenRouterError, SpeechResult  # noqa: E402
from audiofy.runtime.status import GenerationAborted, GenerationTracker  # noqa: E402


def _settings(tts_max_concurrency: int = 4, max_attempts: int = 3) -> SimpleNamespace:
    return SimpleNamespace(
        presenters=[Presenter("ana", "Kore", "natural")],
        tts_model="vendor/tts",
        tts_format="pcm",
        tts_sample_rate=24_000,
        tts_retry_attempts=max_attempts,
        tts_retry_base_seconds=0,
        tts_retry_max_seconds=0,
        language="pt-BR",
        tts_max_concurrency=tts_max_concurrency,
    )


def _valid_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = b"\x00\x00" * 300
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24_000)
        audio.writeframes(pcm)


def _segment_path(directory: Path, index: int, total: int) -> Path:
    return (
        directory
        / "segments"
        / segment_audio_filename(
            "conteudo", directory.name, "adaptation", index, total, "ana", "wav"
        )
    )


def _turns(quantidade: int) -> list[dict]:
    return [{"speaker": "ana", "text": f"trecho {n}"} for n in range(1, quantidade + 1)]


class ConcorrenciaUmEquivaleASequencialTest(unittest.TestCase):
    """tts_max_concurrency=1 precisa produzir o mesmo resultado do loop sequencial:
    é o caso de regressão mais simples e a rede de segurança se algo no
    ThreadPoolExecutor se comportar de forma inesperada."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_concorrencia_um_gera_todos_os_segmentos_na_ordem(
        self, text_to_speech, _generation_cost
    ):
        text_to_speech.side_effect = [
            SpeechResult(b"\x00\x00" * 300, f"gen-{n}") for n in range(1, 4)
        ]

        paths = _synthesize_turns(
            _settings(tts_max_concurrency=1), self.directory, _turns(3), self.tracker
        )

        self.assertEqual(len(paths), 3)
        for index, path in enumerate(paths, 1):
            self.assertIn(f"chunk-{index:03d}", path.name)
        manifest = json.loads((self.directory / "segments.json").read_text(encoding="utf-8"))
        self.assertEqual(set(manifest["segments"]), {path.name for path in paths})


class OrdemFinalPreservadaTest(unittest.TestCase):
    """A lista `paths` devolvida precisa continuar na ordem 1..N mesmo quando os
    trechos terminam fora de ordem — é o que garante que `_assemble` concatene
    o áudio na ordem certa do roteiro."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_trecho_3_termina_antes_do_1_mas_ordem_final_e_1_2_3(
        self, text_to_speech, _generation_cost
    ):
        # O trecho 1 só devolve depois que o trecho 3 sinaliza que terminou;
        # com concorrência >= 3, os três são disparados ao mesmo tempo, então
        # isso força uma conclusão fora de ordem de verdade (não só um mock
        # sequencial disfarçado).
        trecho_3_pronto = threading.Event()

        def tts(settings, text, voice, instructions="", language=""):
            indice = int(text.split()[-1])
            if indice == 1 and not trecho_3_pronto.wait(timeout=5):
                raise AssertionError("trecho 3 não sinalizou a tempo")
            resultado = SpeechResult(b"\x00\x00" * 300, f"gen-{indice}")
            if indice == 3:
                trecho_3_pronto.set()
            return resultado

        text_to_speech.side_effect = tts

        paths = _synthesize_turns(
            _settings(tts_max_concurrency=3), self.directory, _turns(3), self.tracker
        )

        self.assertEqual(len(paths), 3)
        for index, path in enumerate(paths, 1):
            self.assertIn(f"chunk-{index:03d}", path.name, "ordem final precisa ser 1, 2, 3")


class CacheHitNaoEntraNoExecutorTest(unittest.TestCase):
    """Um trecho já sintetizado (fingerprint bate com o manifesto) não pode gerar
    chamada de rede nem ocupar um worker, mesmo com concorrência ativada."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_trecho_em_cache_no_meio_do_lote_nao_dispara_chamada(
        self, text_to_speech, _generation_cost
    ):
        segments = self.directory / "segments"
        segments.mkdir()
        pronto = _segment_path(self.directory, 2, 3)
        _valid_wav(pronto)
        text_to_speech.side_effect = [
            SpeechResult(b"\x00\x00" * 300, "gen-1"),
            SpeechResult(b"\x00\x00" * 300, "gen-3"),
        ]

        paths = _synthesize_turns(
            _settings(tts_max_concurrency=3), self.directory, _turns(3), self.tracker
        )

        self.assertEqual(text_to_speech.call_count, 2, "o trecho em cache não deve chamar o TTS")
        self.assertEqual(len(paths), 3)
        self.assertEqual(paths[1], pronto)


class ErroRealPropagaSobConcorrenciaTest(unittest.TestCase):
    """Um erro não recuperável (não é vazio de áudio, não é retryable) precisa
    propagar como antes, mesmo com outros trechos ainda em voo. Não afirma que
    os trechos pendentes são cancelados (difícil de tornar determinístico em
    teste) — só que a geração nunca "engole" o erro nem trava esperando os
    outros workers."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_erro_permanente_em_um_trecho_derruba_a_geracao(self, text_to_speech):
        liberar_pendentes = threading.Event()

        def tts(settings, text, voice, instructions="", language=""):
            indice = int(text.split()[-1])
            if indice == 1:
                raise OpenRouterError("chave inválida", retryable=False)
            # Os demais ficam presos até o timeout para dar tempo do erro do
            # trecho 1 derrubar a geração antes deles "terminarem".
            liberar_pendentes.wait(timeout=0.3)
            return SpeechResult(b"\x00\x00" * 300, f"gen-{indice}")

        text_to_speech.side_effect = tts

        with self.assertRaisesRegex(OpenRouterError, "chave inválida"):
            _synthesize_turns(
                _settings(tts_max_concurrency=2), self.directory, _turns(5), self.tracker
            )


class GenerationAbortedPropagaSobConcorrenciaTest(unittest.TestCase):
    """Um abort pedido durante a síntese paralela precisa interromper a geração
    inteira, como já acontece no loop sequencial de hoje."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_abort_no_meio_do_lote_interrompe_a_geracao(self, text_to_speech, _generation_cost):
        text_to_speech.return_value = SpeechResult(b"\x00\x00" * 300, "gen-x")
        chamadas = {"n": 0}
        lock = threading.Lock()
        original_checkpoint = self.tracker.checkpoint

        def checkpoint_que_aborta_na_segunda_chamada():
            with lock:
                chamadas["n"] += 1
                n = chamadas["n"]
            if n >= 2:
                raise GenerationAborted("abort simulado em outra thread")
            return original_checkpoint()

        with patch.object(
            self.tracker, "checkpoint", side_effect=checkpoint_que_aborta_na_segunda_chamada
        ):
            with self.assertRaises(GenerationAborted):
                _synthesize_turns(
                    _settings(tts_max_concurrency=4), self.directory, _turns(6), self.tracker
                )


class TrechoMudoSobConcorrenciaTest(unittest.TestCase):
    """Um trecho sem áudio (mesmo após o resgate) ainda deve virar skip sem
    derrubar as outras threads, igual ao comportamento sequencial."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_trecho_mudo_e_pulado_sem_afetar_os_demais(self, text_to_speech, _generation_cost):
        vazio = OpenRouterError("TTS retornou resposta vazia ou curta demais.", retryable=True)

        def tts(settings, text, voice, instructions="", language=""):
            indice = int(text.split()[-1])
            if indice == 2:
                # original e resgate: os dois voltam vazios.
                raise vazio
            return SpeechResult(b"\x00\x00" * 300, f"gen-{indice}")

        text_to_speech.side_effect = tts

        paths = _synthesize_turns(
            _settings(tts_max_concurrency=3), self.directory, _turns(3), self.tracker
        )

        self.assertEqual(len(paths), 2, "o trecho mudo não entra na montagem")
        self.assertTrue(all(path.is_file() for path in paths))
        self.assertEqual(GenerationTracker.load(self.directory)["state"], "rodando")


class RotacaoDeChaveConcorrenteTest(unittest.TestCase):
    """Duas threads descobrindo a mesma chave esgotada ao mesmo tempo não podem
    corromper `exhausted_keys` nem derrubar a geração."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self._tmp.name)
        self.tracker = GenerationTracker(self.directory, "episodio")
        self.addCleanup(self._tmp.cleanup)

    @patch("audiofy.pipeline.api_key_candidates")
    @patch("audiofy.pipeline.openrouter.generation_cost_usd", return_value=0.01)
    @patch("audiofy.pipeline.openrouter.text_to_speech")
    def test_duas_falas_descobrem_a_mesma_chave_esgotada_ao_mesmo_tempo(
        self, text_to_speech, _generation_cost, candidates
    ):
        esgotada = _settings(tts_max_concurrency=2)
        esgotada.api_key = "sk-or-esgotada"
        boa = _settings(tts_max_concurrency=2)
        boa.api_key = "sk-or-boa"
        candidates.return_value = [("esgotada", esgotada), ("boa", boa)]

        chegaram_juntas = threading.Barrier(2)

        def tts(settings, text, voice, instructions="", language=""):
            if settings.api_key == "sk-or-esgotada":
                chegaram_juntas.wait(timeout=5)
                raise OpenRouterError("Insufficient credits", status_code=402)
            indice = int(text.split()[-1])
            return SpeechResult(b"\x00\x00" * 300, f"gen-{indice}")

        text_to_speech.side_effect = tts

        paths = _synthesize_turns(esgotada, self.directory, _turns(2), self.tracker)

        self.assertEqual(len(paths), 2)
        # As duas falas tentam a esgotada (1x cada) e depois a boa (1x cada) = 4.
        self.assertEqual(text_to_speech.call_count, 4)
        usadas = [call.args[0].api_key for call in text_to_speech.call_args_list]
        self.assertEqual(usadas.count("sk-or-esgotada"), 2)
        self.assertEqual(usadas.count("sk-or-boa"), 2)


if __name__ == "__main__":
    unittest.main()
