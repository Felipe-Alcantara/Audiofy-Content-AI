"""Testes do pacote NotebookLM — o caminho de custo zero para gerar o áudio."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.export import export_notebooklm_pack  # noqa: E402
from audiofy.sources.base import ContentItem  # noqa: E402

ITEM = ContentItem(
    item_id="2026-07-21-artigo",
    title="Título do Artigo",
    url="https://exemplo.test/artigo",
    published_at="2026-07-21",
    text="Primeiro parágrafo.\n\nSegundo parágrafo.",
    words=4,
    attribution='Baseado no conteúdo "Título do Artigo". Verifique os direitos.',
)


class NotebookLmPackTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.episodes = Path(self._tmp.name)
        patcher = patch("audiofy.pipeline.EPISODES_DIR", self.episodes)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _export(self, language="pt-BR"):
        return export_notebooklm_pack(ITEM, "custom", language)

    def test_escreve_fonte_e_instrucoes_na_pasta_do_episodio(self):
        pack = self._export()
        self.assertTrue(pack.is_dir())
        self.assertEqual(pack.name, "notebooklm")
        self.assertTrue((pack / "instrucoes.md").is_file())
        arquivos = sorted(p.name for p in pack.iterdir())
        self.assertEqual(len(arquivos), 2, arquivos)

    def test_fonte_preserva_o_texto_integral_e_a_origem(self):
        pack = self._export()
        fonte = next(p for p in pack.iterdir() if p.name != "instrucoes.md")
        conteudo = fonte.read_text(encoding="utf-8")
        self.assertIn(ITEM.title, conteudo)
        self.assertIn(ITEM.url, conteudo)
        self.assertIn("Primeiro parágrafo.", conteudo)
        self.assertIn("Segundo parágrafo.", conteudo)

    def test_instrucoes_citam_a_atribuicao_e_o_arquivo_de_fonte(self):
        pack = self._export()
        instrucoes = (pack / "instrucoes.md").read_text(encoding="utf-8")
        fonte = next(p for p in pack.iterdir() if p.name != "instrucoes.md")
        self.assertIn(ITEM.attribution, instrucoes)
        self.assertIn(fonte.name, instrucoes)
        self.assertIn("audio-completo.mp3", instrucoes)

    def test_instrucoes_avisam_que_a_cobertura_nao_e_garantida(self):
        # O NotebookLM é "resumo aprofundado"; sem esse aviso o usuário assumiria
        # a mesma fidelidade auditável do pipeline normal.
        instrucoes = (self._export() / "instrucoes.md").read_text(encoding="utf-8")
        self.assertIn("NÃO garante", instrucoes)
        self.assertIn("cobertura integral", instrucoes)

    def test_idioma_do_episodio_chega_ao_foco_sugerido(self):
        self.assertIn(
            "português brasileiro",
            (self._export() / "instrucoes.md").read_text(encoding="utf-8"),
        )
        self.assertIn(
            "English",
            (self._export("en") / "instrucoes.md").read_text(encoding="utf-8"),
        )

    def test_episodio_em_ingles_usa_pasta_propria(self):
        # Sem isso, gerar o mesmo item nos dois idiomas sobrescreveria o pacote.
        self.assertNotEqual(self._export("en").parent, self._export("pt-BR").parent)

    def test_exportar_de_novo_atualiza_sem_duplicar_arquivos(self):
        self._export()
        pack = self._export()
        self.assertEqual(len(list(pack.iterdir())), 2)


if __name__ == "__main__":
    unittest.main()
