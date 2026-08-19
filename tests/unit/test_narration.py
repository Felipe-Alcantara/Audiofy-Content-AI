"""Leitura fiel: segmentação exata e plano prosódico não autoral."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy.narration import (  # noqa: E402
    MAX_TTS_CHARS,
    STABLE_TTS_CHARS,
    NarrationChunk,
    fallback_direction,
    is_speakable,
    parse_prosody_plan,
    prosody_batches,
    split_verbatim_text,
    stable_direction,
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


class TableLikeChunkTest(unittest.TestCase):
    """Tabelas colapsadas em texto corrido travam a síntese.

    A extração transforma uma tabela HTML numa única linha sem separadores
    ("RankModeloScoreTier...1Claude Opus 5...95A✅39m..."). O trecho fica
    abaixo do limite de divisão, então segue inteiro para o TTS.

    Verificado ao vivo: 1.590 caracteres assim devolvem 21,7 MB — 7,5 minutos
    de áudio num único trecho, contra 2 a 5 segundos dos trechos normais. A
    chamada leva minutos, e a interface parece travada. O modelo soletra
    número a número o que na página era uma tabela visual.
    """

    def test_tabela_colapsada_e_reconhecida(self):
        from audiofy.narration import looks_like_dense_table

        # Trecho real que travou a geração, encurtado mantendo a densidade.
        linha = "1Claude Opus 5 (Claude Code)*95A39massinatura (16,02 equiv. API)"
        tabela = "RankModeloScoreTierRubyLLM OKTempoCusto da rodada" + linha * 8
        self.assertTrue(looks_like_dense_table(tabela))

    def test_texto_longo_de_prosa_com_datas_nao_e_tabela(self):
        from audiofy.narration import looks_like_dense_table

        # Prosa costuma ficar bem abaixo do limiar mesmo citando números.
        prosa = (
            "Em 2024 o modelo respondia 60% das questões; em 2025 subiu para 78%, "
            "e a rodada de 2026 chegou a 92%. O custo caiu de 16 para 6 dólares "
            "por execução, o que muda a conta de quem roda isso todo dia. "
        ) * 3
        self.assertFalse(looks_like_dense_table(prosa))

    def test_prosa_normal_nao_e_confundida_com_tabela(self):
        from audiofy.narration import looks_like_dense_table

        prosa = (
            "Não avalio uma função isolada. Avalio o projeto que saiu no final: "
            "se usa a API real do RubyLLM, se multi-turn funciona, se trata falhas "
            "do provider, e se a imagem de produção sobe sem erro em 2026."
        )
        self.assertFalse(looks_like_dense_table(prosa))

    def test_trecho_curto_com_numeros_nao_e_tabela(self):
        from audiofy.narration import looks_like_dense_table

        # Só vale para trechos longos: "38m57s" tem outro tratamento.
        self.assertFalse(looks_like_dense_table("38m57s"))
        self.assertFalse(looks_like_dense_table("201 turnos"))


if __name__ == "__main__":
    unittest.main()


class DenseTableSplitTest(unittest.TestCase):
    """A divisão da tabela não pode cortar números ao meio.

    Verificado ao vivo: cortar a cada N caracteres partiu '~$0,34' e
    'assinatura35' no meio, e esses pedaços voltaram mudos do TTS — a
    correção do travamento estava criando perda de conteúdo.
    """

    def test_divisao_preserva_o_texto_integralmente(self):
        from audiofy.narration import split_dense_table

        linha = "1Claude Opus 5 (Claude Code)*95A39massinatura (16,02 equiv. API)"
        tabela = "RankModeloScoreTierRubyLLM OKTempo" + linha * 12

        pedacos = split_dense_table(tabela)

        self.assertGreater(len(pedacos), 1)
        self.assertEqual("".join(pedacos), tabela)

    def test_nao_corta_no_meio_de_um_numero(self):
        from audiofy.narration import split_dense_table

        linha = "12Modelo Alpha88B25m~$0,3413Modelo Beta77C41m~$1,20"
        tabela = "RankModeloScoreTier" + linha * 14

        for pedaco in split_dense_table(tabela):
            # Um pedaço não pode começar nem terminar partindo um número.
            self.assertFalse(
                pedaco[:1].isdigit() and pedaco[-1:].isdigit() and len(pedaco) < 3,
                f"pedaço suspeito: {pedaco!r}",
            )
        # A garantia forte: nenhum corte separa dígitos vizinhos.
        pedacos = split_dense_table(tabela)
        for anterior, seguinte in zip(pedacos, pedacos[1:], strict=False):
            self.assertFalse(
                anterior[-1:].isdigit() and seguinte[:1].isdigit(),
                f"corte no meio de um número entre {anterior[-12:]!r} e {seguinte[:12]!r}",
            )


class LeituraEstavelTest(unittest.TestCase):
    """Modo estável: uma direção só para a obra inteira, em vez de uma por trecho.

    A variação de tonalidade relatada pelos ouvintes vinha de o pipeline pedir
    ao TTS uma interpretação diferente a cada trecho; aqui o contrato é o
    oposto — a mesma instrução, sempre.
    """

    def test_a_direcao_nao_muda_entre_trechos(self):
        primeira = stable_direction("grave e pausado", "pt-BR")
        segunda = stable_direction("grave e pausado", "pt-BR")

        self.assertEqual(primeira, segunda)
        self.assertIn("grave e pausado", primeira)

    def test_preserva_a_base_de_leitura_literal(self):
        direcao = stable_direction("", "pt-BR")

        self.assertIn("Sintetize fala em português brasileiro", direcao)
        self.assertIn("sem acrescentar, omitir, resumir ou corrigir palavras", direcao)

    def test_nao_carrega_direcao_por_trecho(self):
        direcao = stable_direction("", "pt-BR")

        self.assertNotIn("Direção deste trecho", direcao)
        self.assertNotIn("{direction}", direcao)

    def test_pede_uniformidade_explicita(self):
        self.assertIn("constantes", stable_direction("", "pt-BR"))
        self.assertIn("constant", stable_direction("", "en"))

    def test_ingles_usa_a_base_em_ingles(self):
        direcao = stable_direction("warm", "en")

        self.assertIn("Synthesize speech in English", direcao)
        self.assertIn("warm", direcao)

    def test_trecho_estavel_e_maior_e_preserva_o_texto(self):
        texto = ("Primeiro período. Segundo período!\n\n" * 400) + "Fim."

        self.assertGreater(STABLE_TTS_CHARS, MAX_TTS_CHARS)
        chunks = split_verbatim_text(texto, max_chars=STABLE_TTS_CHARS)

        self.assertEqual("".join(chunk.text for chunk in chunks), texto)
        self.assertTrue(all(0 < len(chunk.text) <= STABLE_TTS_CHARS for chunk in chunks))
        # Menos emendas por obra é o ponto do modo estável.
        self.assertLess(len(chunks), len(split_verbatim_text(texto, max_chars=MAX_TTS_CHARS)))
