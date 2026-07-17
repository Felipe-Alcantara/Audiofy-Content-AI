"""Testes do diagnóstico compartilhado de ambiente."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.setup import SetupCheck, apply_setup, setup_report  # noqa: E402


class SetupReportTest(unittest.TestCase):
    @patch("audiofy.setup.inspect_setup")
    def test_opcional_ausente_nao_bloqueia_ambiente(self, inspect_setup):
        inspect_setup.return_value = [
            SetupCheck("required", "Obrigatório", True, True, ""),
            SetupCheck("optional", "Opcional", False, False, ""),
        ]
        self.assertTrue(setup_report()["ready"])

    @patch("audiofy.setup.inspect_setup")
    def test_obrigatorio_ausente_bloqueia_ambiente(self, inspect_setup):
        inspect_setup.return_value = [
            SetupCheck("required", "Obrigatório", False, True, "corrija"),
        ]
        self.assertFalse(setup_report()["ready"])

    @patch("audiofy.setup.inspect_setup")
    def test_apply_cria_env_sem_instalar_o_que_ja_existe(self, inspect_setup):
        checks = [
            SetupCheck("requests", "requests", True, True, ""),
            SetupCheck("questionary", "questionary", True, True, ""),
            SetupCheck("rich", "rich", True, True, ""),
            SetupCheck("akita-articles", "akita", True, True, ""),
        ]
        inspect_setup.return_value = checks
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".env.example").write_text("OPENROUTER_API_KEY=\n", encoding="utf-8")
            with patch("audiofy.setup.PROJECT_ROOT", root):
                result = apply_setup()
            self.assertTrue((root / ".env").is_file())
        self.assertEqual(result["actions"][0]["name"], ".env")


if __name__ == "__main__":
    unittest.main()
