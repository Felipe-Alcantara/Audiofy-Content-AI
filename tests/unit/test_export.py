"""Testes do pacote NotebookLM — o caminho de custo zero para gerar o áudio."""

import json
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


class CoverageGuideTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.episodes = Path(self._tmp.name)
        patcher = patch("audiofy.pipeline.EPISODES_DIR", self.episodes)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _episode_dir(self):
        from audiofy.pipeline import episode_dir

        directory = episode_dir(ITEM.item_id, "pt-BR")
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def _write_coverage(self, items):
        (self._episode_dir() / "coverage.json").write_text(
            json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8"
        )

    def _guide(self, pack):
        return pack / "cobertura-para-o-notebooklm.md"

    def test_inclui_pontos_criticos_e_importantes_da_matriz(self):
        self._write_coverage(
            [
                {"id": "C1", "criticality": "critica", "statement": "Tese central do autor."},
                {"id": "C2", "criticality": "importante", "statement": "Número que sustenta."},
                {"id": "C3", "criticality": "contextual", "statement": "Detalhe secundário."},
            ]
        )
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        guide = self._guide(pack).read_text(encoding="utf-8")
        self.assertIn("Tese central do autor.", guide)
        self.assertIn("Número que sustenta.", guide)
        # O contextual é ruído para o foco do NotebookLM e fica de fora.
        self.assertNotIn("Detalhe secundário.", guide)

    def test_instrucoes_apontam_para_o_guia_quando_ele_existe(self):
        self._write_coverage(
            [{"id": "C1", "criticality": "critica", "statement": "Ponto essencial."}]
        )
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        instrucoes = (pack / "instrucoes.md").read_text(encoding="utf-8")
        self.assertIn("cobertura-para-o-notebooklm.md", instrucoes)

    def test_sem_matriz_o_pacote_nao_ganha_o_guia(self):
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        self.assertFalse(self._guide(pack).exists())
        self.assertNotIn(
            "cobertura-para-o-notebooklm.md",
            (pack / "instrucoes.md").read_text(encoding="utf-8"),
        )

    def test_matriz_so_com_contextual_nao_gera_guia(self):
        self._write_coverage(
            [{"id": "C1", "criticality": "contextual", "statement": "Só contexto."}]
        )
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        self.assertFalse(self._guide(pack).exists())

    def test_guia_antigo_some_quando_a_matriz_deixa_de_existir(self):
        # Reexportar após a matriz sumir não pode deixar um guia obsoleto prometendo
        # cobertura que já não acompanha o conteúdo.
        self._write_coverage(
            [{"id": "C1", "criticality": "critica", "statement": "Ponto essencial."}]
        )
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        self.assertTrue(self._guide(pack).exists())
        (self._episode_dir() / "coverage.json").unlink()
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        self.assertFalse(self._guide(pack).exists())

    def test_coverage_json_corrompido_nao_derruba_a_exportacao(self):
        (self._episode_dir() / "coverage.json").write_text("{ inválido", encoding="utf-8")
        pack = export_notebooklm_pack(ITEM, "custom", "pt-BR")
        self.assertTrue((pack / "instrucoes.md").is_file())
        self.assertFalse(self._guide(pack).exists())


if __name__ == "__main__":
    unittest.main()
