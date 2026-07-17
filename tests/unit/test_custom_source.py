"""Testes da fonte genérica de conteúdo (URL ou texto colado)."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.sources.custom import CustomSource, extract_main_text, slugify  # noqa: E402

HTML = """<html><head><title>Página de Teste — Blog</title></head><body>
<nav><a href="/">home</a><a href="/sobre">sobre</a></nav>
<article>
<h1>Título do Artigo</h1>
<p>Primeiro parágrafo com conteúdo relevante o bastante para contar como texto principal.</p>
<p>Segundo parágrafo, também com bastante texto para o extrator considerar.</p>
<script>alert('nunca no texto')</script>
</article>
<footer>rodapé © 2026</footer>
</body></html>"""


class ExtractTest(unittest.TestCase):
    def test_extrai_texto_do_article(self):
        title, text = extract_main_text(HTML)
        self.assertEqual(title, "Página de Teste — Blog")
        self.assertIn("Primeiro parágrafo", text)
        self.assertIn("Segundo parágrafo", text)

    def test_remove_script_e_navegacao(self):
        _, text = extract_main_text(HTML)
        self.assertNotIn("alert", text)
        self.assertNotIn("rodapé", text)

    def test_slugify(self):
        self.assertEqual(slugify("Olá, Mundo — Teste!"), "ola-mundo-teste")


class CustomSourceTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.source = CustomSource(inbox_dir=Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_vazio(self):
        self.assertTrue(self.source.is_ready())
        self.assertEqual(self.source.list_items(), [])

    def test_adicionar_texto(self):
        item_id = self.source.add_text("Meu Artigo", "Corpo do conteúdo.",
                                       url="https://exemplo.com/a")
        items = self.source.list_items()
        self.assertEqual(len(items), 1)
        item = self.source.get_item(item_id)
        self.assertEqual(item.title, "Meu Artigo")
        self.assertIn("Corpo do conteúdo", item.text)
        self.assertIn("exemplo.com", item.attribution)

    def test_busca(self):
        self.source.add_text("Sobre Fingerprint", "corpo")
        self.source.add_text("Outro Assunto", "corpo")
        hits = self.source.search("fingerprint")
        self.assertEqual(len(hits), 1)

    def test_get_inexistente(self):
        with self.assertRaises(LookupError):
            self.source.get_item("nao-existe")

    def test_ids_unicos_para_titulos_iguais(self):
        first = self.source.add_text("Mesmo Título", "a")
        second = self.source.add_text("Mesmo Título", "b")
        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
