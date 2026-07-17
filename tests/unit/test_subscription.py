"""Testes do provedor de texto por assinatura (CLIs locais)."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.providers.subscription import (  # noqa: E402
    SUBSCRIPTION_CLIS,
    available_clis,
    configured_model,
    get_cli,
)


class RegistryTest(unittest.TestCase):
    def test_clis_conhecidas(self):
        keys = [c.key for c in SUBSCRIPTION_CLIS]
        self.assertIn("claude-code", keys)
        self.assertIn("gemini-cli", keys)
        self.assertIn("codex", keys)

    def test_get_cli(self):
        cli = get_cli("claude-code")
        self.assertEqual(cli.binary, "claude")

    def test_get_cli_desconhecida(self):
        with self.assertRaises(LookupError):
            get_cli("nao-existe")

    def test_available_retorna_subconjunto(self):
        available = {c.key for c in available_clis()}
        self.assertTrue(available.issubset({c.key for c in SUBSCRIPTION_CLIS}))

    def test_comando_inclui_binario(self):
        for cli in SUBSCRIPTION_CLIS:
            command = cli.command("sistema", )
            self.assertEqual(command[0], cli.binary)

    def test_detecta_modelo_global_do_codex(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "config.toml"
            config.write_text(
                'model = "gpt-5.6-sol"\n[profiles.outro]\nmodel = "ignorado"\n',
                encoding="utf-8",
            )
            with patch.dict("os.environ", {"CODEX_HOME": tmp}):
                self.assertEqual(configured_model("codex"), "gpt-5.6-sol")

    def test_nao_confunde_modelo_de_perfil_com_global(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "config.toml"
            config.write_text('[profiles.outro]\nmodel = "nao-efetivo"\n', encoding="utf-8")
            with patch.dict("os.environ", {"CODEX_HOME": tmp}):
                self.assertIsNone(configured_model("codex"))


class ProfileCompatTest(unittest.TestCase):
    def test_perfil_antigo_sem_text_provider_carrega(self):
        from audiofy.profiles import Profile
        old = {"name": "meu", "text_model": "a/b", "audit_model": "a/c",
               "tts_model": "a/d", "presenters_spec": "n:V", "description": ""}
        profile = Profile(**old)
        self.assertEqual(profile.text_provider, "openrouter")

    def test_perfil_assinatura_embutido(self):
        from audiofy.profiles import BUILTIN_PROFILES
        assinatura = next(p for p in BUILTIN_PROFILES if p.name == "assinatura")
        self.assertNotEqual(assinatura.text_provider, "openrouter")


if __name__ == "__main__":
    unittest.main()
