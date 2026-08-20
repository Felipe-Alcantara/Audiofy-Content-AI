"""Marcações de tempo para edição de vídeo: SRT e capítulos."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.markers import (  # noqa: E402
    chapters_text,
    export_markers,
    srt_text,
    text_that_fits,
)


def _trechos():
    return [
        {"chunk_index": 1, "duration_seconds": 10.0, "text": "Primeiro trecho falado."},
        {"chunk_index": 2, "duration_seconds": 5.5, "text": "Segundo trecho."},
        {"chunk_index": 3, "duration_seconds": 3661.25, "text": "Trecho longo."},
    ]


class LegendaTest(unittest.TestCase):
    """O editor de vídeo abre SRT direto na linha do tempo; se o tempo estiver
    no formato errado, ele recusa o arquivo inteiro sem dizer por quê."""

    def test_usa_o_formato_de_tempo_que_editores_aceitam(self):
        saida = srt_text(_trechos())

        self.assertIn("00:00:00,000 --> 00:00:10,000", saida)
        self.assertIn("00:00:10,000 --> 00:00:15,500", saida)

    def test_acumula_o_tempo_e_passa_de_uma_hora_sem_quebrar(self):
        saida = srt_text(_trechos())

        self.assertIn("01:01:16,750", saida)

    def test_numera_as_legendas_em_sequencia(self):
        linhas = srt_text(_trechos()).splitlines()

        self.assertEqual(linhas[0], "1")
        self.assertIn("2", linhas)

    def test_texto_de_varias_linhas_vira_uma_legenda_so(self):
        saida = srt_text(
            [{"chunk_index": 1, "duration_seconds": 4.0, "text": "linha um\n\nlinha dois"}]
        )

        self.assertIn("linha um linha dois", saida)

    def test_sem_duracao_medida_nao_inventa_marcacao(self):
        with self.assertRaisesRegex(ValueError, "duração"):
            srt_text([{"chunk_index": 1, "duration_seconds": None, "text": "x"}])


class CapitulosTest(unittest.TestCase):
    def test_gera_capitulos_no_formato_de_players_e_editores(self):
        saida = chapters_text(_trechos())

        self.assertIn("00:00:00 Primeiro trecho falado.", saida)
        self.assertIn("00:00:10 Segundo trecho.", saida)

    def test_encurta_o_titulo_do_capitulo(self):
        longo = "palavra " * 40
        saida = chapters_text([{"chunk_index": 1, "duration_seconds": 4.0, "text": longo}])

        titulo = saida.splitlines()[0]
        self.assertLess(len(titulo), 90)
        self.assertTrue(titulo.endswith("…"))


class TextoQueCabeTest(unittest.TestCase):
    """O vídeo pede 20 minutos e o áudio tem 32: a pergunta é quanto cortar."""

    def test_diz_quantas_palavras_cabem_na_duracao_alvo(self):
        resultado = text_that_fits(words=4120, target_minutes=20, speaking_rate_wpm=147)

        self.assertEqual(resultado["fits_words"], 2940)
        self.assertEqual(resultado["cut_words"], 1180)
        self.assertAlmostEqual(resultado["cut_ratio"], 0.286, places=2)
        self.assertAlmostEqual(resultado["current_minutes"], 28.0, places=1)

    def test_texto_que_ja_cabe_nao_pede_corte(self):
        resultado = text_that_fits(words=1000, target_minutes=20, speaking_rate_wpm=147)

        self.assertEqual(resultado["cut_words"], 0)
        self.assertEqual(resultado["cut_ratio"], 0.0)

    def test_recusa_alvo_sem_sentido(self):
        for alvo in (0, -5):
            with self.assertRaises(ValueError):
                text_that_fits(words=100, target_minutes=alvo, speaking_rate_wpm=147)


class ArquivosTest(unittest.TestCase):
    def test_grava_os_dois_formatos_na_pasta_do_episodio(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)

            escritos = export_markers(directory, _trechos(), base_name="episodio")

            nomes = sorted(caminho.name for caminho in escritos)
            self.assertEqual(nomes, ["episodio-capitulos.txt", "episodio-marcacoes.srt"])
            self.assertIn("-->", (directory / "episodio-marcacoes.srt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
