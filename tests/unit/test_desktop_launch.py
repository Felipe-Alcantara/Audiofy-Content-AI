"""Testes do lançamento do app desktop pela porta de entrada."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import start_app  # noqa: E402


class DesktopLaunchTest(unittest.TestCase):
    def _launch(self, platform: str) -> dict:
        """Executa do_desktop com dependências simuladas e retorna a chamada do Popen."""
        calls = {}

        def popen(command, **kwargs):
            calls["command"] = command
            calls["kwargs"] = kwargs

        with (
            patch.object(start_app.shutil, "which", return_value="C:/nodejs/npm.cmd"),
            patch.object(start_app.subprocess, "Popen", side_effect=popen),
            patch.object(start_app.subprocess, "DETACHED_PROCESS", 8, create=True),
            patch.object(start_app.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, create=True),
            patch.object(start_app.sys, "platform", platform),
            patch.object(Path, "is_dir", return_value=True),
        ):
            start_app.do_desktop()
        return calls

    def test_usa_caminho_completo_do_npm(self):
        calls = self._launch("win32")
        self.assertEqual(calls["command"][0], "C:/nodejs/npm.cmd")

    def test_windows_desanexa_sem_start_new_session(self):
        calls = self._launch("win32")
        self.assertNotIn("start_new_session", calls["kwargs"])
        self.assertIn("creationflags", calls["kwargs"])

    def test_posix_mantem_start_new_session(self):
        calls = self._launch("linux")
        self.assertTrue(calls["kwargs"]["start_new_session"])

    def test_exporta_interpretador_para_o_electron(self):
        calls = self._launch("win32")
        self.assertEqual(calls["kwargs"]["env"]["AUDIOFY_PYTHON"], sys.executable)


if __name__ == "__main__":
    unittest.main()
