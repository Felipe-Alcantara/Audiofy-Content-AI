"""Leitura fiel: segmentação exata e plano prosódico não autoral."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.narration import (  # noqa: E402
    NarrationChunk,
    fallback_direction,
    parse_prosody_plan,
    prosody_batches,
    split_verbatim_text,
    tts_direction,
)


class VerbatimSegmentationTest(unittest.TestCase):
    def test_recompoe_texto_exatamente_e_prefere_pausas_naturais(self):
        text = ("Primeiro período. Segundo período!\n\n" * 30) + "Fim sem nova linha."

        chunks = split_verbatim_text(text, max_chars=240)

        self.assertEqual("".join(chunk.text for chunk in chunks), text)
        self.assertTrue(all(0 < len(chunk.text) <= 240 for chunk in chunks))
        self.assertTrue(any(chunk.text.endswith("\n\n") for chunk in chunks[:-1]))

    def test_palavra_maior_que_trecho_usa_corte_duro_sem_perda(self):
        text = "a" * 550
        chunks = split_verbatim_text(text, max_chars=200)
        self.assertEqual([len(chunk.text) for chunk in chunks], [200, 200, 150])
        self.assertEqual("".join(chunk.text for chunk in chunks), text)

    def test_lotes_nao_dependem_do_tamanho_total_do_livro(self):
        chunks = [NarrationChunk(index, "x" * 1_000) for index in range(1, 26)]
        batches = prosody_batches(chunks, max_chars=4_000)
        self.assertEqual([len(batch) for batch in batches], [4, 4, 4, 4, 4, 4, 1])


class ProsodyContractTest(unittest.TestCase):
    def test_descarta_texto_reescrito_e_ids_inesperados(self):
        result = parse_prosody_plan(
            {
                "segments": [
                    {"id": 1, "direction": "  suspense gradual  ", "text": "texto alterado"},
                    {"id": 99, "direction": "ignorar"},
                ]
            },
            {1, 2},
        )
        self.assertEqual(result, {1: "suspense gradual"})
        self.assertNotIn("texto", str(result))

    def test_fallback_e_instrucao_mantem_texto_fora_da_direcao(self):
        direction = fallback_direction("“Quem está aí?” O perigo crescia...")
        instruction = tts_direction(direction, "caloroso")
        self.assertIn("diálogos", direction)
        self.assertIn("tensão", direction)
        self.assertIn("ordem exata", instruction)
        self.assertIn("caloroso", instruction)


if __name__ == "__main__":
    unittest.main()
