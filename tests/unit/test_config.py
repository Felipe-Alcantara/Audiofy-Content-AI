"""Procedência e atualização segura da configuração de ambiente."""

import os
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy import config  # noqa: E402


class DotenvEnvironmentTest(unittest.TestCase):
    def test_load_dotenv_registra_apenas_chaves_que_nao_vieram_do_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            dotenv = Path(directory) / ".env"
            dotenv.write_text("DO_ARQUIVO=novo\nDO_SHELL=arquivo\n", encoding="utf-8")
            with patch.dict(os.environ, {"DO_SHELL": "shell"}, clear=True):
                loaded = config._load_dotenv(dotenv)

                self.assertEqual(loaded, frozenset({"DO_ARQUIVO"}))
                self.assertEqual(os.environ["DO_ARQUIVO"], "novo")
                self.assertEqual(os.environ["DO_SHELL"], "shell")

    def test_desktop_atualiza_valor_do_dotenv_e_mantem_chave_do_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            dotenv = Path(directory) / ".env"
            dotenv.write_text("OPENROUTER_API_KEY=chave-atual\n", encoding="utf-8")
            environment = {
                "OPENROUTER_API_KEY": "chave-antiga",
                "CHAVE_DO_SHELL": "preservada",
            }
            with (
                patch.dict(os.environ, environment, clear=True),
                patch.object(config, "DOTENV_LOADED_KEYS", frozenset({"OPENROUTER_API_KEY"})),
            ):
                result = config.desktop_environment(dotenv)

            self.assertEqual(result["OPENROUTER_API_KEY"], "chave-atual")
            self.assertEqual(result["CHAVE_DO_SHELL"], "preservada")
            self.assertEqual(result[config.DOTENV_PROVENANCE_ENV], "OPENROUTER_API_KEY")

    def test_desktop_do_app_prioriza_dotenv_atual(self):
        with tempfile.TemporaryDirectory() as directory:
            dotenv = Path(directory) / ".env"
            dotenv.write_text("OPENROUTER_API_KEY=chave-atual\n", encoding="utf-8")
            with (
                patch.dict(os.environ, {"OPENROUTER_API_KEY": "chave-antiga"}, clear=True),
                patch.object(config, "DOTENV_LOADED_KEYS", frozenset()),
            ):
                result = config.desktop_environment(dotenv, prefer_dotenv=True)

            self.assertEqual(result["OPENROUTER_API_KEY"], "chave-atual")
            self.assertEqual(result[config.DOTENV_PROVENANCE_ENV], "OPENROUTER_API_KEY")

    def test_origem_distingue_dotenv_de_shell(self):
        store = Mock()
        store.prefers_named.return_value = False
        store.active_name.return_value = None
        with (
            patch.dict(os.environ, {"OPENROUTER_API_KEY": "chave"}, clear=True),
            patch.object(config, "DOTENV_LOADED_KEYS", frozenset({"OPENROUTER_API_KEY"})),
            patch.object(config, "key_store", return_value=store),
        ):
            self.assertEqual(config.api_key_source(), ".env")

        with (
            patch.dict(os.environ, {"OPENROUTER_API_KEY": "chave"}, clear=True),
            patch.object(config, "DOTENV_LOADED_KEYS", frozenset()),
            patch.object(config, "key_store", return_value=store),
        ):
            self.assertEqual(config.api_key_source(), "ambiente")

    def test_chave_nomeada_explicitamente_selecionada_supera_ambiente(self):
        store = Mock()
        store.prefers_named.return_value = True
        store.active_key.return_value = "chave-nomeada"
        store.active_name.return_value = "trabalho"
        with (
            patch.dict(os.environ, {"OPENROUTER_API_KEY": "chave-ambiente"}, clear=True),
            patch.object(config, "key_store", return_value=store),
        ):
            self.assertEqual(config.api_key_source(), "trabalho")

    def test_candidatas_respeitam_ordem_do_cofre_depois_da_atual(self):
        @dataclass
        class FakeSettings:
            api_key: str

        named = [
            Mock(name="primeira", key="chave-1"),
            Mock(name="segunda", key="chave-2"),
        ]
        named[0].name = "primeira"
        named[1].name = "segunda"
        store = Mock()
        store.list_keys.return_value = named
        with (
            patch.object(config, "key_store", return_value=store),
            patch.object(config, "_dotenv_values", return_value={}),
        ):
            candidates = config.api_key_candidates(FakeSettings("chave-atual"), "ativa")

        self.assertEqual(
            [label for label, _settings in candidates], ["ativa", "primeira", "segunda"]
        )


if __name__ == "__main__":
    unittest.main()


class ForceLanguageSettingsWiringTest(unittest.TestCase):
    def test_settings_recebe_a_escolha_do_perfil(self):
        """Sem isso, marcar a caixa no perfil não teria efeito na síntese."""
        from audiofy.config import Settings

        self.assertFalse(Settings().force_language)
        self.assertTrue(Settings(force_language=True).force_language)


class TtsMaxConcurrencySettingsTest(unittest.TestCase):
    """AUDIOFY_TTS_MAX_CONCURRENCY controla quantos trechos são sintetizados em
    paralelo; sem isso, a síntese paralela não teria como ser ajustada/desligada
    por quem usa uma chave de tier baixo no OpenRouter."""

    def setUp(self):
        self._original = os.environ.pop("AUDIOFY_TTS_MAX_CONCURRENCY", None)

    def tearDown(self):
        if self._original is None:
            os.environ.pop("AUDIOFY_TTS_MAX_CONCURRENCY", None)
        else:
            os.environ["AUDIOFY_TTS_MAX_CONCURRENCY"] = self._original

    def test_padrao_sem_variavel_de_ambiente(self):
        from audiofy.config import Settings

        self.assertEqual(Settings().tts_max_concurrency, 4)

    def test_variavel_de_ambiente_sobrepoe_o_padrao(self):
        from audiofy.config import Settings

        os.environ["AUDIOFY_TTS_MAX_CONCURRENCY"] = "8"
        self.assertEqual(Settings().tts_max_concurrency, 8)

    def test_fora_do_intervalo_permitido_levanta_erro(self):
        from audiofy.config import Settings

        os.environ["AUDIOFY_TTS_MAX_CONCURRENCY"] = "0"
        with self.assertRaises(ValueError):
            Settings()

        os.environ["AUDIOFY_TTS_MAX_CONCURRENCY"] = "17"
        with self.assertRaises(ValueError):
            Settings()


class VoiceStabilitySettingsTest(unittest.TestCase):
    """A estabilidade da voz é resolvida em três níveis: episódio > env > perfil.

    O campo é texto (e não booleano) de propósito: `Settings.__post_init__` só
    preenche campos vazios com o padrão do perfil, então um `False` explícito
    vindo do episódio seria silenciosamente trocado pelo valor do perfil.
    """

    def setUp(self):
        self._original = os.environ.pop("AUDIOFY_VOICE_STABILITY", None)

    def tearDown(self):
        if self._original is None:
            os.environ.pop("AUDIOFY_VOICE_STABILITY", None)
        else:
            os.environ["AUDIOFY_VOICE_STABILITY"] = self._original

    def test_padrao_e_natural_e_nao_muda_o_pipeline_atual(self):
        """Perfil sem a opção marcada mantém o comportamento histórico.

        O perfil é fixado no teste de propósito: ler o perfil ativo da máquina
        faria o resultado depender de quem rodou a suíte por último.
        """
        from audiofy.config import Settings
        from audiofy.profiles import Profile

        padrao = Profile(
            name="padrao",
            text_model="vendor/text",
            audit_model="vendor/audit",
            tts_model="vendor/tts",
            presenters_spec="narrador:Kore",
        )
        with patch("audiofy.config.profile_store") as store:
            store.return_value.active.return_value = padrao
            settings = Settings()

        self.assertEqual(settings.voice_stability, "natural")
        self.assertFalse(settings.stable_voice)

    def test_perfil_com_voz_estavel_chega_ao_settings(self):
        from audiofy.config import Settings
        from audiofy.profiles import Profile

        perfil = Profile(
            name="estavel",
            text_model="vendor/text",
            audit_model="vendor/audit",
            tts_model="vendor/tts",
            presenters_spec="narrador:Kore",
            stable_voice=True,
        )
        with patch("audiofy.config.profile_store") as store:
            store.return_value.active.return_value = perfil
            settings = Settings()

        self.assertEqual(settings.voice_stability, "estavel")
        self.assertTrue(settings.stable_voice)

    def test_escolha_do_episodio_vence_o_perfil_nos_dois_sentidos(self):
        from audiofy.config import Settings
        from audiofy.profiles import Profile

        perfil = Profile(
            name="estavel",
            text_model="vendor/text",
            audit_model="vendor/audit",
            tts_model="vendor/tts",
            presenters_spec="narrador:Kore",
            stable_voice=True,
        )
        with patch("audiofy.config.profile_store") as store:
            store.return_value.active.return_value = perfil
            self.assertFalse(Settings(voice_stability="natural").stable_voice)
        self.assertTrue(Settings(voice_stability="estavel").stable_voice)

    def test_variavel_de_ambiente_sobrepoe_o_perfil(self):
        from audiofy.config import Settings

        os.environ["AUDIOFY_VOICE_STABILITY"] = "estavel"
        self.assertTrue(Settings().stable_voice)

    def test_valor_desconhecido_e_recusado(self):
        from audiofy.config import Settings

        with self.assertRaises(ValueError):
            Settings(voice_stability="muito-estavel")


class DiretoriosPorAmbienteTest(unittest.TestCase):
    def test_sem_variavel_vale_o_clone(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                config._dir_from_env("AUDIOFY_DATA_DIR", config.PROJECT_ROOT / "data"),
                config.PROJECT_ROOT / "data",
            )

    def test_variavel_vazia_ou_so_espacos_conta_como_ausente(self):
        with patch.dict(os.environ, {"AUDIOFY_DATA_DIR": "  "}):
            self.assertEqual(
                config._dir_from_env("AUDIOFY_DATA_DIR", Path("padrao")), Path("padrao")
            )

    def test_variavel_vira_caminho_absoluto(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"AUDIOFY_STATE_DIR": directory}):
                self.assertEqual(
                    config._dir_from_env("AUDIOFY_STATE_DIR", Path("padrao")),
                    Path(directory).resolve(),
                )

    def test_modulo_importado_com_a_variavel_grava_dentro_dela(self):
        # DATA_DIR e STATE_DIR são fixados na importação; só um processo novo prova o desvio.
        import subprocess

        with tempfile.TemporaryDirectory() as directory:
            dados, estado = Path(directory, "dados"), Path(directory, "estado")
            ambiente = {
                **os.environ,
                "AUDIOFY_DATA_DIR": str(dados),
                "AUDIOFY_STATE_DIR": str(estado),
                "PYTHONPATH": str(Path(config.__file__).parents[1]),
                "PYTHONUTF8": "1",
            }
            saida = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "from audiofy import config as c; "
                    "print(c.EPISODES_DIR); print(c.key_store().path); print(c.DATA_DIR)",
                ],
                env=ambiente,
                capture_output=True,
                text=True,
                check=True,
            ).stdout.split("\n")
            self.assertEqual(Path(saida[0]), dados.resolve() / "episodes")
            self.assertEqual(Path(saida[1]), estado.resolve() / "keys.json")


class ChaveUnicaTest(unittest.TestCase):
    """O servidor de agente só usa a chave que o app entregou: sem cofre, .env nem fila."""

    def _settings(self, chave):
        from audiofy.config import Settings

        return Settings(api_key=chave)

    def test_fila_de_chaves_so_tem_a_atual(self):
        settings = self._settings("sk-or-v1-atual")
        with (
            patch.dict(os.environ, {config.SINGLE_KEY_ENV: "1"}),
            patch.object(
                config, "_dotenv_values", return_value={"OPENROUTER_API_KEY": "sk-or-v1-env"}
            ),
            patch.object(config, "key_store") as cofre,
        ):
            cofre.return_value.list_keys.return_value = [
                Mock(name="reserva", key="sk-or-v1-reserva")
            ]
            candidatas = config.api_key_candidates(settings, current_label="agente")
        self.assertEqual(
            [(rotulo, c.api_key) for rotulo, c in candidatas], [("agente", "sk-or-v1-atual")]
        )

    def test_sem_o_modo_a_fila_continua_com_as_reservas(self):
        settings = self._settings("sk-or-v1-atual")
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                config, "_dotenv_values", return_value={"OPENROUTER_API_KEY": "sk-or-v1-env"}
            ),
            patch.object(config, "key_store") as cofre,
        ):
            cofre.return_value.list_keys.return_value = []
            candidatas = config.api_key_candidates(settings)
        self.assertEqual([c.api_key for _, c in candidatas], ["sk-or-v1-atual", "sk-or-v1-env"])

    def test_chave_vem_so_do_ambiente_mesmo_com_cofre_nomeado_ativo(self):
        with (
            patch.dict(
                os.environ, {config.SINGLE_KEY_ENV: "1", "OPENROUTER_API_KEY": "sk-or-v1-app"}
            ),
            patch.object(config, "key_store") as cofre,
        ):
            cofre.return_value.resolve.return_value = "sk-or-v1-do-cofre"
            cofre.return_value.prefers_named.return_value = True
            self.assertEqual(config._default_settings()["api_key"], "sk-or-v1-app")
            self.assertEqual(config.api_key_source(), "ambiente")

    def test_sem_chave_no_ambiente_nao_ha_chave(self):
        with (
            patch.dict(os.environ, {config.SINGLE_KEY_ENV: "1"}, clear=True),
            patch.object(config, "key_store") as cofre,
        ):
            cofre.return_value.resolve.return_value = "sk-or-v1-do-cofre"
            self.assertEqual(config._default_settings()["api_key"], "")
            self.assertIsNone(config.api_key_source())
