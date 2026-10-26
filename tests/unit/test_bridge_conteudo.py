"""Contrato dos comandos de conteúdo da bridge: add-text, add-url, add-file, notebooklm e balance."""

import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy import bridge  # noqa: E402
from audiofy.file_extraction import ExtractionResult  # noqa: E402


class ComandosDeConteudoTest(unittest.TestCase):
    def setUp(self):
        temporario = tempfile.TemporaryDirectory()
        self.addCleanup(temporario.cleanup)
        self.pasta = Path(temporario.name)
        patcher = patch("audiofy.sources.custom._INBOX_DIR", self.pasta / "inbox")
        patcher.start()
        self.addCleanup(patcher.stop)

    def _executar(self, *argumentos, stdin=""):
        with (
            patch("sys.argv", ["bridge", *argumentos]),
            patch("sys.stdin", StringIO(stdin)),
            patch("audiofy.bridge._emit") as emitir,
        ):
            bridge.main()
        return emitir.call_args.args[0]

    def test_add_text_grava_na_caixa_de_entrada(self):
        resposta = self._executar("add-text", stdin='{"title": "Meu texto", "text": "Olá, mundo."}')
        self.assertTrue(resposta["ok"])
        self.assertEqual(resposta["source"], "custom")
        self.assertTrue((self.pasta / "inbox" / f"{resposta['item_id']}.md").is_file())

    def test_add_file_extrai_o_texto_e_guarda_a_origem(self):
        arquivo = self.pasta / "nota.txt"
        arquivo.write_text("um dois três quatro", encoding="utf-8")
        resposta = self._executar("add-file", str(arquivo))
        self.assertTrue(resposta["added"])
        self.assertEqual(resposta["words"], 4)
        origem = (self.pasta / "inbox" / f"{resposta['item_id']}.md").read_text(encoding="utf-8")
        self.assertIn(f"source-file: {arquivo.resolve()}", origem)

    def test_add_file_sem_texto_extraivel_pede_alternativa(self):
        arquivo = self.pasta / "scan.pdf"
        arquivo.write_bytes(b"%PDF")
        falha = ExtractionResult(
            text="", title="scan", method="", needs_fallback=True, reason="sem texto"
        )
        with patch("audiofy.file_extraction.extract_file", return_value=falha):
            resposta = self._executar("add-file", str(arquivo))
        self.assertEqual(
            (resposta["added"], resposta["needs_fallback"], resposta["reason"]),
            (False, True, "sem texto"),
        )

    def test_add_url_devolve_o_item(self):
        with patch("audiofy.sources.custom.CustomSource.add_url", return_value="2026-x"):
            resposta = self._executar("add-url", "https://exemplo.com/a")
        self.assertEqual((resposta["item_id"], resposta["source"]), ("2026-x", "custom"))

    def test_balance_reporta_a_validade_da_chave(self):
        with patch(
            "audiofy.providers.openrouter.check_api_key", return_value=(True, "chave válida")
        ):
            resposta = self._executar("balance")
        self.assertEqual((resposta["valid"], resposta["detail"]), (True, "chave válida"))

    def test_notebooklm_devolve_o_pacote(self):
        item = object()
        with (
            patch("audiofy.bridge.get_source") as fonte,
            patch(
                "audiofy.export.export_notebooklm_pack", return_value=self.pasta / "pack"
            ) as pack,
        ):
            fonte.return_value.get_item.return_value = item
            resposta = self._executar("notebooklm", "custom", "2026-x")
        self.assertEqual(resposta["pack"], str(self.pasta / "pack"))
        self.assertIs(pack.call_args.args[0], item)


if __name__ == "__main__":
    unittest.main()
