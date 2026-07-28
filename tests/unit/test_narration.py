"""Leitura fiel: segmentação exata e plano prosódico não autoral."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.narration import (  # noqa: E402
    NarrationChunk,
    fallback_direction,
    is_speakable,
    parse_prosody_plan,
    prosody_batches,
    split_verbatim_text,
    tts_direction,
)


class TextoFalavelTest(unittest.TestCase):
    """Trechos sem fala travariam o TTS, que devolve áudio vazio para eles."""

    def test_aceita_texto_com_palavras(self):
        self.assertTrue(is_speakable("Orwell chegou a Barcelona."))
        self.assertTrue(is_speakable("Ano 1937"))

    def test_recusa_numeracao_e_simbolos_soltos(self):
        for vazio in ("   8   ", " . — ", "", "42", "•••", "\n\t "):
            self.assertFalse(is_speakable(vazio), vazio)

    def test_recusa_valor_que_nao_e_texto(self):
        self.assertFalse(is_speakable(None))


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


class SpeakableFallbackTest(unittest.TestCase):
    """Trechos que o TTS devolve mudos precisam de uma segunda chance.

    Marcas de tempo, códigos e rodapés de diagramação costumam voltar sem
    áudio. Pular significa perder conteúdo do texto original em silêncio —
    inaceitável numa leitura que promete ser integral. Antes de desistir, o
    trecho é reescrito para uma forma que o modelo consiga pronunciar.
    """

    def test_marca_de_tempo_vira_texto_falado(self):
        from audiofy.narration import speakable_fallback

        self.assertEqual(
            speakable_fallback("38m57s"),
            "38 minutos e 57 segundos",
        )

    def test_marca_de_tempo_com_horas(self):
        from audiofy.narration import speakable_fallback

        self.assertEqual(
            speakable_fallback("1h02m03s"),
            "1 hora, 2 minutos e 3 segundos",
        )

    def test_duracao_em_formato_de_relogio(self):
        from audiofy.narration import speakable_fallback

        self.assertEqual(speakable_fallback("12:34"), "12 minutos e 34 segundos")

    def test_texto_normal_nao_e_alterado(self):
        from audiofy.narration import speakable_fallback

        original = "O modelo acertou a maior parte das questões."
        self.assertIsNone(speakable_fallback(original))

    def test_trecho_sem_letra_nem_numero_nao_tem_salvacao(self):
        from audiofy.narration import speakable_fallback

        # Só pontuação/símbolo: não há o que pronunciar, aí pular é correto.
        self.assertIsNone(speakable_fallback("—— ***"))

    def test_codigo_isolado_recebe_leitura_por_caractere(self):
        from audiofy.narration import speakable_fallback

        self.assertEqual(speakable_fallback("v2.1.0"), "v2 ponto 1 ponto 0")
