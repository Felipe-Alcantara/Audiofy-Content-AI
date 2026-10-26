"""O pacote instalável não pode se desencontrar do que o clone usa."""

import importlib
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "src"))

PYPROJECT = (RAIZ / "pyproject.toml").read_text(encoding="utf-8")


class EmpacotamentoTest(unittest.TestCase):
    def test_o_extra_akita_usa_o_mesmo_commit_do_requirements(self):
        no_requirements = re.search(
            r"^akita-articles @ \S+", (RAIZ / "requirements.txt").read_text(encoding="utf-8"), re.M
        )
        no_pyproject = re.search(r'"(akita-articles @ \S+)"', PYPROJECT)
        self.assertIsNotNone(no_requirements)
        self.assertIsNotNone(no_pyproject)
        self.assertEqual(no_pyproject.group(1), no_requirements.group(0))

    def test_requirements_inclui_o_nucleo_que_o_pacote_declara(self):
        arquivo = re.search(r'dependencies = \{ file = \["([^"]+)"\] \}', PYPROJECT).group(1)
        self.assertEqual(arquivo, "requirements-core.txt")
        self.assertIn(
            f"-r {arquivo}", (RAIZ / "requirements.txt").read_text(encoding="utf-8").splitlines()
        )
        nucleo = (RAIZ / arquivo).read_text(encoding="utf-8")
        self.assertNotIn("akita", nucleo)  # o núcleo não pode exigir git

    def test_os_comandos_instalados_apontam_para_funcoes_que_existem(self):
        comandos = re.findall(r'^(audiofy-[a-z]+) = "([\w.]+):(\w+)"', PYPROJECT, re.M)
        self.assertEqual(sorted(nome for nome, _, _ in comandos), ["audiofy-bridge", "audiofy-mcp"])
        for _, modulo, funcao in comandos:
            self.assertTrue(callable(getattr(importlib.import_module(modulo), funcao)), modulo)

    def test_a_versao_do_pacote_vem_do_codigo(self):
        from audiofy import __version__

        self.assertRegex(__version__, r"^\d+\.\d+\.\d+$")
        self.assertIn('version = { attr = "audiofy.__version__" }', PYPROJECT)


if __name__ == "__main__":
    unittest.main()
