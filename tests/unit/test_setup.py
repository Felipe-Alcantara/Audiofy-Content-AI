"""Testes do diagnóstico compartilhado de ambiente."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.setup import (  # noqa: E402
    SetupCheck,
    _download,
    _install_system,
    apply_setup,
    ensure_tesseract_languages,
    inspect_setup,
    setup_report,
    tesseract_command,
    user_tessdata_dir,
)


class SetupReportTest(unittest.TestCase):
    @patch("audiofy.setup.shutil.which")
    def test_node_e_npm_sao_diagnosticados_sem_bloquear_a_cli(self, which):
        which.return_value = None

        checks = {check.key: check for check in inspect_setup()}

        self.assertFalse(checks["node"].ok)
        self.assertFalse(checks["node"].required)
        self.assertFalse(checks["npm"].ok)
        self.assertFalse(checks["npm"].required)

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

    @patch("audiofy.setup._install_system")
    @patch("audiofy.setup.inspect_setup")
    def test_apply_instala_git_e_ffmpeg_ausentes(self, inspect_setup, install_system):
        inspect_setup.return_value = [
            SetupCheck("git", "Git", False, True, ""),
            SetupCheck("ffmpeg", "FFmpeg", False, True, ""),
            SetupCheck("akita-articles", "akita", True, True, ""),
        ]
        install_system.side_effect = lambda tool: {"name": tool, "ok": True, "detail": ""}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".env.example").write_text("OPENROUTER_API_KEY=\n", encoding="utf-8")
            with patch("audiofy.setup.PROJECT_ROOT", root):
                result = apply_setup()
        self.assertEqual([a["name"] for a in result["actions"][:2]], ["git", "ffmpeg"])

    @patch("audiofy.setup._install")
    @patch("audiofy.setup.inspect_setup")
    def test_dependencias_ausentes_usam_arquivo_fixado(self, inspect_setup, install):
        inspect_setup.return_value = [
            SetupCheck("requests", "requests", False, True, ""),
            SetupCheck("questionary", "questionary", True, True, ""),
            SetupCheck("rich", "rich", True, True, ""),
            SetupCheck("akita-articles", "akita", True, True, ""),
        ]
        install.return_value = {"name": "dependências Python", "ok": True, "detail": ""}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".env.example").write_text("OPENROUTER_API_KEY=\n", encoding="utf-8")
            (root / "requirements.txt").write_text("requests==2.34.2\n", encoding="utf-8")
            with patch("audiofy.setup.PROJECT_ROOT", root):
                apply_setup()

        install.assert_called_once_with("dependências Python", "-r", str(root / "requirements.txt"))

    @patch("audiofy.setup._run")
    @patch("audiofy.setup.npm_command", return_value=["npm"])
    @patch("audiofy.setup.inspect_setup")
    def test_setup_instala_desktop_pelo_lockfile(self, inspect_setup, _npm, run):
        inspect_setup.return_value = [
            SetupCheck("npm", "npm", True, False, ""),
            SetupCheck("electron-deps", "Electron", False, False, ""),
        ]
        run.return_value = (True, "instalação concluída")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            electron = root / "electron"
            electron.mkdir()
            (electron / "package-lock.json").write_text("{}", encoding="utf-8")
            (root / ".env.example").write_text("OPENROUTER_API_KEY=\n", encoding="utf-8")
            with patch("audiofy.setup.PROJECT_ROOT", root):
                result = apply_setup()

        run.assert_called_once_with(
            ["npm", "ci", "--no-fund", "--no-audit"],
            cwd=electron,
        )
        self.assertTrue(result["actions"][0]["ok"])

    @patch("audiofy.setup._run")
    def test_pip_bloqueado_tenta_break_system_packages(self, run):
        from audiofy.setup import _install

        run.side_effect = [
            (False, "error: externally-managed-environment"),
            (True, "instalação concluída"),
        ]
        result = _install("pacotes", "rich")
        self.assertTrue(result["ok"])
        self.assertIn("--break-system-packages", run.call_args_list[1].args[0])

    @patch("audiofy.setup._install_private_tesseract")
    @patch("audiofy.setup.tesseract_command", return_value=None)
    @patch("audiofy.setup._run", return_value=(False, "sudo: uma senha é necessária"))
    @patch("audiofy.setup.shutil.which")
    def test_tesseract_cai_para_instalacao_local_sem_senha(
        self, which, _run, _command, install_private
    ):
        which.side_effect = lambda name: f"/usr/bin/{name}" if name == "apt-get" else None
        install_private.return_value = (True, "instalado sem sudo")

        result = _install_system("tesseract")

        self.assertTrue(result["ok"])
        self.assertIn("local", result["detail"])
        install_private.assert_called_once_with()

    @patch("audiofy.setup.configure_tesseract")
    @patch("audiofy.setup.tesseract_command", return_value=r"C:\Program Files\tesseract.exe")
    @patch("audiofy.setup._run")
    def test_tesseract_fora_do_path_dispensa_instalacao(self, run, _command, configure):
        result = _install_system("tesseract")

        self.assertTrue(result["ok"])
        self.assertIn("já instalado", result["detail"])
        run.assert_not_called()
        configure.assert_called_once_with()


class TesseractLocationTest(unittest.TestCase):
    """O Tesseract costuma existir fora do PATH; achá-lo evita reinstalar."""

    @patch("audiofy.setup.shutil.which", return_value="/usr/bin/tesseract")
    def test_prefere_o_executavel_do_path(self, _which):
        self.assertEqual(tesseract_command(), "/usr/bin/tesseract")

    @patch("audiofy.setup.shutil.which", return_value=None)
    def test_encontra_instalacao_conhecida_fora_do_path(self, _which):
        with tempfile.TemporaryDirectory() as tmp:
            instalado = Path(tmp) / "tesseract.exe"
            instalado.touch()
            with patch("audiofy.setup._TESSERACT_KNOWN_PATHS", {sys.platform: (str(instalado),)}):
                self.assertEqual(tesseract_command(), str(instalado))

    @patch("audiofy.setup._TESSERACT_KNOWN_PATHS", {})
    @patch("audiofy.setup._TESSERACT_UNIX_PATHS", ())
    @patch("audiofy.setup._private_tesseract_binaries", return_value=())
    @patch("audiofy.setup.shutil.which", return_value=None)
    def test_ausencia_total_e_reportada(self, _which, _private):
        self.assertIsNone(tesseract_command())


class DownloadTest(unittest.TestCase):
    def test_recusa_origem_que_nao_seja_https(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "por.traineddata"

            ok, detail = _download("file:///etc/passwd", destino)

            self.assertFalse(ok)
            self.assertIn("apenas HTTPS", detail)
            self.assertFalse(destino.exists())

    def test_download_interrompido_nao_deixa_arquivo_parcial(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "por.traineddata"
            with patch("urllib.request.urlopen", side_effect=TimeoutError("sem rede")):
                ok, _ = _download("https://exemplo.invalido/por.traineddata", destino)

            self.assertFalse(ok)
            self.assertFalse(destino.exists())
            self.assertEqual(list(Path(tmp).glob("*.part")), [])


class TesseractLanguagesTest(unittest.TestCase):
    """Os idiomas vão para um tessdata do usuário: o do sistema exige admin."""

    @patch("audiofy.setup.tesseract_command", return_value=None)
    def test_sem_tesseract_nao_baixa_idiomas(self, _command):
        ok, detail = ensure_tesseract_languages()

        self.assertFalse(ok)
        self.assertIn("não encontrado", detail)

    @patch("audiofy.setup.configure_tesseract")
    @patch("audiofy.setup._download")
    @patch("audiofy.setup._system_tessdata_candidates", return_value=[])
    @patch("audiofy.setup.tesseract_command", return_value="/usr/bin/tesseract")
    def test_baixa_portugues_e_ingles_ausentes(self, _command, _sources, download, _configure):
        with tempfile.TemporaryDirectory() as tmp:
            alvo = Path(tmp) / "tessdata"
            download.side_effect = lambda url, path: (path.write_bytes(b"x"), (True, str(path)))[1]
            with patch("audiofy.setup.user_tessdata_dir", return_value=alvo):
                ok, detail = ensure_tesseract_languages()

            self.assertTrue(ok)
            self.assertIn("por", detail)
            self.assertTrue((alvo / "por.traineddata").is_file())
            self.assertTrue((alvo / "eng.traineddata").is_file())

    @patch("audiofy.setup.configure_tesseract")
    @patch("audiofy.setup._download")
    @patch("audiofy.setup.tesseract_command", return_value="/usr/bin/tesseract")
    def test_reaproveita_idiomas_ja_instalados_sem_baixar(self, _command, download, _configure):
        with tempfile.TemporaryDirectory() as tmp:
            sistema = Path(tmp) / "sistema"
            sistema.mkdir()
            for lang in ("por", "eng"):
                (sistema / f"{lang}.traineddata").write_bytes(b"dados")
            alvo = Path(tmp) / "tessdata"
            with (
                patch("audiofy.setup._system_tessdata_candidates", return_value=[sistema]),
                patch("audiofy.setup.user_tessdata_dir", return_value=alvo),
            ):
                ok, detail = ensure_tesseract_languages()

            self.assertTrue(ok)
            self.assertIn("já disponíveis", detail)
            download.assert_not_called()
            self.assertTrue((alvo / "por.traineddata").is_file())

    @patch("audiofy.setup.configure_tesseract")
    @patch("audiofy.setup._download", return_value=(False, "falha ao baixar"))
    @patch("audiofy.setup._system_tessdata_candidates", return_value=[])
    @patch("audiofy.setup.tesseract_command", return_value="/usr/bin/tesseract")
    def test_falha_de_rede_e_reportada(self, _command, _sources, _download, _configure):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("audiofy.setup.user_tessdata_dir", return_value=Path(tmp) / "tessdata"):
                ok, detail = ensure_tesseract_languages()

            self.assertFalse(ok)
            self.assertIn("falha ao baixar", detail)

    def test_tessdata_do_usuario_fica_no_estado_local_gravavel(self):
        self.assertIn("tools", user_tessdata_dir().parts)


if __name__ == "__main__":
    unittest.main()
