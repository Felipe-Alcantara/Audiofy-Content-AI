"""Testes do lançamento do app desktop pela porta de entrada."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import start_app  # noqa: E402

_WHICH = {"npm": "C:/nodejs/npm.cmd", "node": "C:/nodejs/node.exe"}


class NpmCommandTest(unittest.TestCase):
    def test_windows_prefere_node_com_npm_cli(self):
        with (
            patch.object(start_app.shutil, "which", side_effect=_WHICH.get),
            patch.object(start_app.sys, "platform", "win32"),
            patch.object(Path, "is_file", return_value=True),
        ):
            command = start_app._npm_command()
        self.assertEqual(command[0], "C:/nodejs/node.exe")
        self.assertTrue(command[1].endswith("npm-cli.js"))

    def test_windows_sem_npm_cli_usa_caminho_completo_do_npm(self):
        with (
            patch.object(start_app.shutil, "which", side_effect=_WHICH.get),
            patch.object(start_app.sys, "platform", "win32"),
            patch.object(Path, "is_file", return_value=False),
        ):
            self.assertEqual(start_app._npm_command(), ["C:/nodejs/npm.cmd"])

    def test_posix_usa_npm_do_path(self):
        with (
            patch.object(start_app.shutil, "which", side_effect={"npm": "/usr/bin/npm"}.get),
            patch.object(start_app.sys, "platform", "linux"),
        ):
            self.assertEqual(start_app._npm_command(), ["/usr/bin/npm"])


class DesktopLaunchTest(unittest.TestCase):
    def _launch(self, platform: str, electron: Path | None) -> dict:
        """Executa do_desktop com dependências simuladas e retorna a chamada do Popen."""
        calls = {}

        def popen(command, **kwargs):
            calls["command"] = command
            calls["kwargs"] = kwargs

        with (
            patch.object(start_app, "_npm_command", return_value=["C:/nodejs/npm.cmd"]),
            patch.object(start_app, "_electron_executable", return_value=electron),
            patch.object(start_app.subprocess, "Popen", side_effect=popen),
            patch.object(start_app.subprocess, "DETACHED_PROCESS", 8, create=True),
            patch.object(start_app.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, create=True),
            patch.object(start_app.sys, "platform", platform),
            patch.object(Path, "is_dir", return_value=True),
        ):
            start_app.do_desktop()
        return calls

    def test_prefere_o_binario_real_do_electron(self):
        calls = self._launch("win32", Path("C:/app/electron.exe"))
        self.assertEqual(calls["command"], [str(Path("C:/app/electron.exe")), "."])

    def test_sem_binario_usa_npm_start(self):
        calls = self._launch("win32", None)
        self.assertEqual(calls["command"], ["C:/nodejs/npm.cmd", "start"])

    def test_windows_desanexa_sem_start_new_session(self):
        calls = self._launch("win32", None)
        self.assertNotIn("start_new_session", calls["kwargs"])
        self.assertIn("creationflags", calls["kwargs"])

    def test_posix_mantem_start_new_session(self):
        calls = self._launch("linux", None)
        self.assertTrue(calls["kwargs"]["start_new_session"])

    def test_exporta_interpretador_para_o_electron(self):
        calls = self._launch("win32", None)
        self.assertEqual(calls["kwargs"]["env"]["AUDIOFY_PYTHON"], sys.executable)


class ElectronExecutableTest(unittest.TestCase):
    def test_le_o_binario_de_path_txt(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            package = Path(tmp) / "node_modules" / "electron"
            (package / "dist").mkdir(parents=True)
            (package / "path.txt").write_text("electron\n", encoding="utf-8")
            (package / "dist" / "electron").write_text("", encoding="utf-8")
            found = start_app._electron_executable(Path(tmp))
            self.assertEqual(found, package / "dist" / "electron")

    def test_sem_path_txt_retorna_none(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(start_app._electron_executable(Path(tmp)))


if __name__ == "__main__":
    unittest.main()
