"""Servidor MCP: as 14 ferramentas, o teto da chave e os limites que só um agente exige."""

import asyncio
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from dataclasses import asdict
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from audiofy import config, mcp_server  # noqa: E402
from audiofy.estimates import EpisodeEstimate  # noqa: E402
from audiofy.providers.openrouter import KeyLimit, OpenRouterError  # noqa: E402

try:
    from mcp import Client
    from mcp.server import MCPServer  # noqa: F401 - só o SDK 2.x tem
except ImportError:
    Client = None

SEM_SDK = "SDK mcp 2.x ausente (python -m pip install -r requirements-dev.txt)"
FERRAMENTAS = {
    "listar_conteudos",
    "ver_conteudo",
    "adicionar_texto",
    "adicionar_url",
    "adicionar_arquivo",
    "listar_vozes",
    "gerar_episodio",
    "refazer_trechos",
    "acompanhar_geracao",
    "abortar_geracao",
    "exportar_notebooklm",
    "exportar_legendas",
    "consultar_saldo",
    "relatorio_de_custos",
}


def _chave(restante, limite=None, reset="daily"):
    if limite is None and restante is not None:
        limite = restante + 0.5
    return KeyLimit(
        label="agentes", usage=0.5, usage_monthly=0.5, limit=limite, remaining=restante, reset=reset
    )


def _estimativa(maximo=1.71):
    return EpisodeEstimate(
        duration_minutes=10,
        duration_min_minutes=8,
        duration_max_minutes=12,
        speaking_rate_wpm=150,
        cost_usd=1.32,
        cost_min_usd=0.99,
        cost_max_usd=maximo,
        sample_count=3,
    )


class PastasLiberadasTest(unittest.TestCase):
    def setUp(self):
        temporario = tempfile.TemporaryDirectory()
        self.addCleanup(temporario.cleanup)
        self.raiz = Path(temporario.name).resolve()
        self.liberada = self.raiz / "liberada"
        self.liberada.mkdir()
        self.dentro = self.liberada / "nota.txt"
        self.dentro.write_text("um dois três", encoding="utf-8")
        self.fora = self.raiz / "segredo.txt"
        self.fora.write_text("não pode", encoding="utf-8")

    def _liberar(self, *pastas):
        return patch.dict(
            os.environ, {mcp_server.ALLOWED_DIRS_ENV: os.pathsep.join(map(str, pastas))}
        )

    def test_sem_pasta_liberada_nada_e_lido(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "Nenhuma pasta"):
                mcp_server._arquivo_liberado(str(self.dentro))

    def test_arquivo_dentro_da_pasta_liberada_passa(self):
        with self._liberar(self.liberada):
            self.assertEqual(mcp_server._arquivo_liberado(str(self.dentro)), self.dentro)

    def test_arquivo_fora_da_pasta_liberada_e_recusado(self):
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "fora das pastas"):
                mcp_server._arquivo_liberado(str(self.fora))

    def test_recusa_igual_para_arquivo_que_nao_existe_fora_das_pastas(self):
        # Mensagem diferente deixaria o agente descobrir quais arquivos existem no disco.
        inexistente = self.raiz / "nao-existe.txt"
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "fora das pastas"):
                mcp_server._arquivo_liberado(str(inexistente))

    def test_subir_com_ponto_ponto_nao_escapa(self):
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "fora das pastas"):
                mcp_server._arquivo_liberado(str(self.liberada / ".." / "segredo.txt"))

    def test_pasta_irma_com_o_mesmo_prefixo_nao_conta(self):
        irma = self.raiz / "liberada2"
        irma.mkdir()
        (irma / "x.txt").write_text("x", encoding="utf-8")
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "fora das pastas"):
                mcp_server._arquivo_liberado(str(irma / "x.txt"))

    def test_atalho_que_sai_das_pastas_e_recusado(self):
        atalho = self.liberada / "atalho.txt"
        try:
            os.symlink(self.fora, atalho)
        except (OSError, NotImplementedError):
            self.skipTest("este sistema não permite criar atalho sem privilégio")
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "fora das pastas"):
                mcp_server._arquivo_liberado(str(atalho))

    def test_varias_pastas_separadas_pelo_separador_do_sistema(self):
        outra = self.raiz / "outra"
        outra.mkdir()
        (outra / "b.txt").write_text("b", encoding="utf-8")
        with self._liberar(self.liberada, outra):
            self.assertEqual(mcp_server._arquivo_liberado(str(outra / "b.txt")), outra / "b.txt")

    def test_dentro_da_pasta_mas_inexistente_diz_que_nao_achou(self):
        with self._liberar(self.liberada):
            with self.assertRaisesRegex(ValueError, "não encontrado"):
                mcp_server._arquivo_liberado(str(self.liberada / "nao-existe.txt"))

    def test_arquivo_grande_demais_e_recusado(self):
        with self._liberar(self.liberada), patch.object(mcp_server, "_MAX_FILE_BYTES", 3):
            with self.assertRaisesRegex(ValueError, "limite"):
                mcp_server._arquivo_liberado(str(self.dentro))

    def test_adicionar_arquivo_grava_o_texto_quando_liberado(self):
        with (
            self._liberar(self.liberada),
            patch("audiofy.sources.custom._INBOX_DIR", self.raiz / "inbox"),
        ):
            resposta = mcp_server.adicionar_arquivo(str(self.dentro))
        self.assertEqual((resposta["adicionado"], resposta["palavras"]), (True, 3))
        self.assertTrue((self.raiz / "inbox" / f"{resposta['item_id']}.md").is_file())

    def test_adicionar_arquivo_fora_nao_chega_a_extrair(self):
        with self._liberar(self.liberada), patch("audiofy.bridge._cmd_add_file") as extrair:
            with self.assertRaises(ValueError):
                mcp_server.adicionar_arquivo(str(self.fora))
        extrair.assert_not_called()


class EntradasTest(unittest.TestCase):
    def test_item_id_barra_traversal_e_caminho_do_windows(self):
        for ruim in ("..", "../x", "a\\b", "C:\\x", "", "/abs", ".oculto", "a" * 201):
            with self.subTest(ruim=ruim), self.assertRaises(ValueError):
                mcp_server._item_id(ruim)

    def test_item_id_aceita_ids_de_fonte_com_barra(self):
        self.assertEqual(mcp_server._item_id("2026-10-26-meu-texto"), "2026-10-26-meu-texto")
        self.assertEqual(mcp_server._item_id("2008/12/post"), "2008/12/post")

    def test_texto_grande_demais_e_recusado_sem_gravar(self):
        with (
            patch.object(mcp_server, "_MAX_TEXT_BYTES", 10),
            patch("audiofy.bridge._cmd_add_text") as gravar,
        ):
            with self.assertRaisesRegex(ValueError, "limite"):
                mcp_server.adicionar_texto("t", "x" * 11)
        gravar.assert_not_called()

    def test_idioma_desconhecido_e_recusado(self):
        with self.assertRaisesRegex(ValueError, "Idioma"):
            mcp_server._idioma("klingon")

    def test_o_nome_da_variavel_de_chave_unica_acompanha_a_config(self):
        self.assertEqual(mcp_server._SINGLE_KEY_ENV, config.SINGLE_KEY_ENV)

    def test_main_fixa_a_chave_unica_e_sobe_em_stdio(self):
        servidor = Mock()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(mcp_server, "build_server", return_value=servidor),
        ):
            mcp_server.main()
            self.assertEqual(os.environ[config.SINGLE_KEY_ENV], "1")
        servidor.run.assert_called_once_with("stdio")


class GerarEpisodioTest(unittest.TestCase):
    def setUp(self):
        self.settings = Mock(api_key="k", tts_model="vendor/tts", text_provider="openrouter")
        self.item = SimpleNamespace(words=1500)
        for alvo, kwargs in (
            ("audiofy.config.Settings", {"return_value": self.settings}),
            ("audiofy.sources.get_source", {}),
            ("audiofy.estimates.estimate_episode", {"return_value": _estimativa()}),
        ):
            patcher = patch(alvo, **kwargs)
            mock = patcher.start()
            self.addCleanup(patcher.stop)
            if alvo.endswith("get_source"):
                mock.return_value.get_item.return_value = self.item
        patcher = patch(
            "audiofy.bridge._cmd_generate",
            return_value={"started": True, "dir": "x", "log": "y"},
        )
        self.gerar = patcher.start()
        self.addCleanup(patcher.stop)

    def _com_limite(self, limite):
        return patch("audiofy.providers.openrouter.current_key_limit", return_value=limite)

    def test_recusa_quando_o_topo_da_faixa_passa_do_restante(self):
        # US$ 1,50 cobre o valor central (1,32) mas não o topo (1,71): o teto olha o topo.
        with self._com_limite(_chave(1.50)):
            with self.assertRaisesRegex(ValueError, r"US\$ 1,71.*US\$ 1,50"):
                mcp_server.gerar_episodio("custom", "meu-texto")
        self.gerar.assert_not_called()

    def test_gera_quando_cabe_e_devolve_a_estimativa_antes_do_gasto(self):
        with self._com_limite(_chave(5.0)):
            resposta = mcp_server.gerar_episodio("custom", "meu-texto")
        self.assertTrue(resposta["iniciou"])
        self.assertEqual(resposta["estimativa"]["custo_usd"]["maximo"], 1.71)
        self.assertEqual(resposta["restante_usd"], 5.0)
        self.assertEqual(resposta["avisos"], [])
        self.assertIn("acompanhar_geracao", resposta["proximo_passo"])

    def test_limite_esgotado_recusa_e_diz_que_renova(self):
        with self._com_limite(_chave(0.0)):
            with self.assertRaisesRegex(ValueError, "acabou.*diariamente"):
                mcp_server.gerar_episodio("custom", "meu-texto")
        self.gerar.assert_not_called()

    def test_chave_sem_limite_gera_com_aviso(self):
        with self._com_limite(_chave(None)):
            resposta = mcp_server.gerar_episodio("custom", "meu-texto")
        self.assertTrue(resposta["iniciou"])
        self.assertIsNone(resposta["restante_usd"])
        self.assertTrue(any("não tem limite" in aviso for aviso in resposta["avisos"]))

    def test_sem_conseguir_confirmar_o_limite_nao_gasta(self):
        with patch(
            "audiofy.providers.openrouter.current_key_limit",
            side_effect=OpenRouterError("HTTP 503", retryable=True, status_code=503),
        ):
            with self.assertRaisesRegex(ValueError, "Não consegui confirmar"):
                mcp_server.gerar_episodio("custom", "meu-texto")
        self.gerar.assert_not_called()

    def test_texto_pela_assinatura_avisa_que_fica_fora_do_teto(self):
        self.settings.text_provider = "codex"
        with self._com_limite(_chave(5.0)):
            resposta = mcp_server.gerar_episodio("custom", "meu-texto")
        self.assertTrue(any("assinatura (codex)" in aviso for aviso in resposta["avisos"]))

    def test_modo_desconhecido_e_leitura_fiel_sem_voz_sao_recusados(self):
        with self.assertRaisesRegex(ValueError, "Modo desconhecido"):
            mcp_server.gerar_episodio("custom", "meu-texto", modo="musical")
        with self.assertRaisesRegex(ValueError, "voz"):
            mcp_server.gerar_episodio("custom", "meu-texto", modo="leitura_fiel")
        self.gerar.assert_not_called()

    def test_geracao_ja_em_andamento_nao_e_erro(self):
        self.gerar.return_value = {"started": False, "reason": "geração já em andamento"}
        with self._com_limite(_chave(5.0)):
            resposta = mcp_server.gerar_episodio("custom", "meu-texto")
        self.assertFalse(resposta["iniciou"])
        self.assertEqual(resposta["motivo"], "geração já em andamento")

    def test_refazer_trechos_usa_o_restante_como_teto(self):
        with (
            self._com_limite(_chave(0.40)),
            patch(
                "audiofy.bridge._cmd_regenerate_chunks",
                return_value={"started": True, "chunks": [2], "estimated_cost_usd": 0.05},
            ) as refazer,
        ):
            resposta = mcp_server.refazer_trechos("custom", "meu-texto", "2")
        self.assertEqual(refazer.call_args.kwargs["max_cost_usd"], 0.40)
        self.assertEqual(resposta["custo_estimado_usd"], 0.05)

    def test_abortar_continua_liberado_com_o_limite_esgotado(self):
        with (
            patch("audiofy.providers.openrouter.current_key_limit", side_effect=AssertionError),
            patch(
                "audiofy.bridge._cmd_abort",
                return_value={"aborted": True, "stopped": True, "note": "worker encerrado"},
            ),
        ):
            resposta = mcp_server.abortar_geracao("meu-texto")
        self.assertEqual((resposta["abortado"], resposta["worker_encerrado"]), (True, True))


class ChaveEsgotadaTest(unittest.TestCase):
    """Com a chave dos agentes esgotada, nenhuma outra é usada nem a geração é retomada."""

    def setUp(self):
        self.exausta = OpenRouterError("sem saldo", status_code=402)
        self.settings = config.Settings(api_key="sk-or-v1-esgotada")
        self.tracker = Mock(key_source="agente")
        ambiente = patch.dict(os.environ, {config.SINGLE_KEY_ENV: "1"})
        reserva = patch.object(
            config, "_dotenv_values", return_value={"OPENROUTER_API_KEY": "sk-or-v1-reserva"}
        )
        cofre = patch.object(config, "key_store")
        ambiente.start()
        reserva.start()
        cofre.start().return_value.list_keys.return_value = [
            SimpleNamespace(name="outra", key="sk-or-v1-outra")
        ]
        for patcher in (ambiente, reserva, cofre):
            self.addCleanup(patcher.stop)

    def test_texto_nao_troca_de_chave(self):
        from audiofy import pipeline

        with patch("audiofy.pipeline.openrouter.chat_json", side_effect=self.exausta) as chamada:
            with self.assertRaises(OpenRouterError):
                pipeline._chat_with_key_fallback(self.settings, "m", "s", "p", self.tracker)
        self.assertEqual(chamada.call_count, 1)

    def test_voz_nao_troca_de_chave(self):
        from audiofy import pipeline

        with patch("audiofy.pipeline.openrouter.text_to_speech", side_effect=self.exausta) as voz:
            with self.assertRaises(OpenRouterError):
                pipeline._synthesize_with_retry(self.settings, "olá", "Kore", "", 1, self.tracker)
        self.assertEqual(voz.call_count, 1)

    def test_controle_fora_do_modo_a_fila_ainda_troca_de_chave(self):
        # Prova que os testes acima medem o modo, e não um acaso do cenário.
        from audiofy import pipeline

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("audiofy.pipeline.openrouter.chat_json", side_effect=[self.exausta, "ok"]) as c,
            redirect_stdout(StringIO()),  # o aviso de troca tem seta; o worker real força UTF-8
        ):
            self.assertEqual(
                pipeline._chat_with_key_fallback(self.settings, "m", "s", "p", self.tracker), "ok"
            )
        self.assertEqual(c.call_count, 2)


class FerramentasLeituraTest(unittest.TestCase):
    def test_listar_sem_fonte_devolve_as_fontes(self):
        with patch("audiofy.bridge._cmd_sources", return_value={"sources": [{"key": "custom"}]}):
            self.assertEqual(mcp_server.listar_conteudos(), {"fontes": [{"key": "custom"}]})

    def test_listar_limita_e_avisa_que_truncou(self):
        itens = [{"item_id": str(i)} for i in range(300)]
        with patch("audiofy.bridge._cmd_items", return_value={"items": itens}):
            resposta = mcp_server.listar_conteudos("akita", limite=50)
        self.assertEqual(
            (resposta["total"], len(resposta["itens"]), resposta["truncado"]), (300, 50, True)
        )

    def test_listar_com_busca_usa_a_busca(self):
        with patch(
            "audiofy.bridge._cmd_search", return_value={"items": [{"item_id": "a"}]}
        ) as busca:
            resposta = mcp_server.listar_conteudos("akita", busca="ruby")
        busca.assert_called_once_with("akita", "ruby")
        self.assertEqual(resposta["total"], 1)

    def test_ver_conteudo_traz_a_faixa_por_modo(self):
        estimativa = asdict(_estimativa())
        dados = {
            "title": "Meu texto",
            "words": 1500,
            "url": "",
            "estimates": dict.fromkeys(("adaptation", "verbatim", "reflexive"), estimativa),
            "actual": None,
        }
        with patch("audiofy.bridge._cmd_item", return_value=dados):
            resposta = mcp_server.ver_conteudo("custom", "meu-texto")
        self.assertEqual(set(resposta["estimativas"]), {"podcast", "leitura_fiel", "reflexivo"})
        podcast = resposta["estimativas"]["podcast"]
        self.assertEqual(podcast["custo_usd"], {"minimo": 0.99, "central": 1.32, "maximo": 1.71})
        self.assertEqual(podcast["duracao_min"]["maximo"], 12.0)
        self.assertIsNone(resposta["episodio_existente"])

    def test_acompanhar_resume_o_estado_e_corta_o_log(self):
        resumo = {
            "title": "T", "state": "rodando", "stage": "voz", "progress": {"done": 2, "total": 9},
            "cost_usd": 0.4, "cost_exact": False, "last_error": None, "retry": None,
            "mp3": None, "duration_seconds": None,
        }  # fmt: skip
        log = {"text": "\n".join(f"linha {i}" for i in range(30)), "worker_alive": True}
        with (
            patch("audiofy.bridge._episode_dir", return_value=Path("x")),
            patch("audiofy.bridge._episode_summary", return_value=resumo),
            patch("audiofy.bridge._cmd_generation_log", return_value=log),
        ):
            resposta = mcp_server.acompanhar_geracao("meu-texto", linhas_do_log=3)
        self.assertEqual(resposta["estado"], "rodando")
        self.assertEqual(resposta["custo_usd"], 0.4)
        self.assertEqual(resposta["log"], ["linha 27", "linha 28", "linha 29"])
        self.assertTrue(resposta["worker_vivo"])
        self.assertNotIn("trechos", resposta)

    def test_listar_vozes_traz_o_tom_medido(self):
        self.settings = Mock(tts_model="google/gemini-3.1-flash-tts-preview")
        with patch("audiofy.config.Settings", return_value=self.settings):
            resposta = mcp_server.listar_vozes()
        kore = next(v for v in resposta["vozes"] if v["voz"] == "Kore")
        self.assertIn("Hz", kore["tom_medido"])

    def test_saldo_resume_a_saude_na_mensagem_da_task(self):
        settings = Mock(api_key="k", tts_model="vendor/tts", text_provider="openrouter")
        with (
            patch("audiofy.config.Settings", return_value=settings),
            patch("audiofy.mcp_server.shutil.which", return_value="/usr/bin/ffmpeg"),
            patch("audiofy.providers.openrouter.current_key_limit", return_value=_chave(1.73)),
        ):
            resposta = mcp_server.consultar_saldo()
        self.assertEqual(resposta["mensagem"], "Conectado; restam US$ 1,73 hoje; ffmpeg encontrado")
        self.assertEqual(resposta["chave"]["restante_usd"], 1.73)

    def test_saldo_sem_chave_e_sem_ffmpeg_nao_levanta_erro(self):
        settings = Mock(api_key="", tts_model="vendor/tts", text_provider="openrouter")
        with (
            patch("audiofy.config.Settings", return_value=settings),
            patch("audiofy.mcp_server.shutil.which", return_value=None),
        ):
            resposta = mcp_server.consultar_saldo()
        self.assertFalse(resposta["conectado"])
        self.assertFalse(resposta["ffmpeg_encontrado"])


@unittest.skipIf(Client is None, SEM_SDK)
class ServidorTest(unittest.TestCase):
    def _chamar(self, nome, argumentos=None):
        servidor = mcp_server.build_server()

        async def rodar():
            async with Client(servidor) as cliente:
                return await cliente.call_tool(nome, argumentos or {})

        return asyncio.run(rodar())

    def test_expoe_exatamente_as_14_ferramentas(self):
        servidor = mcp_server.build_server()

        async def listar():
            async with Client(servidor) as cliente:
                return (await cliente.list_tools()).tools

        nomes = {ferramenta.name for ferramenta in asyncio.run(listar())}
        self.assertEqual(nomes, FERRAMENTAS)

    def test_nao_expoe_chat_chaves_perfis_nem_instalacao(self):
        servidor = mcp_server.build_server()

        async def listar():
            async with Client(servidor) as cliente:
                return (await cliente.list_tools()).tools

        for ferramenta in asyncio.run(listar()):
            for proibido in ("chat", "key", "chave_", "setup", "profile", "perfil", "instal"):
                self.assertNotIn(proibido, ferramenta.name)

    def test_dicas_separam_o_que_so_le_do_que_gasta(self):
        servidor = mcp_server.build_server()

        async def listar():
            async with Client(servidor) as cliente:
                return {t.name: t.annotations for t in (await cliente.list_tools()).tools}

        dicas = asyncio.run(listar())
        self.assertTrue(dicas["ver_conteudo"].read_only_hint)
        self.assertFalse(dicas["gerar_episodio"].read_only_hint)
        self.assertTrue(dicas["gerar_episodio"].open_world_hint)

    def test_a_recusa_chega_ao_agente_com_a_mensagem(self):
        with patch.dict(os.environ, {mcp_server.ALLOWED_DIRS_ENV: ""}):
            resposta = self._chamar("adicionar_arquivo", {"caminho": "/etc/passwd"})
        self.assertTrue(resposta.is_error)
        self.assertIn("Nenhuma pasta", resposta.content[0].text)

    def test_arquivo_fora_das_pastas_e_recusado_pelo_servidor(self):
        with tempfile.TemporaryDirectory() as raiz:
            liberada = Path(raiz, "liberada")
            liberada.mkdir()
            fora = Path(raiz, "segredo.txt")
            fora.write_text("x", encoding="utf-8")
            with patch.dict(os.environ, {mcp_server.ALLOWED_DIRS_ENV: str(liberada)}):
                resposta = self._chamar("adicionar_arquivo", {"caminho": str(fora)})
        self.assertTrue(resposta.is_error)
        self.assertIn("fora das pastas", resposta.content[0].text)

    def test_segredo_na_mensagem_de_recusa_e_mascarado(self):
        with patch("audiofy.bridge._cmd_costs", side_effect=ValueError("falhou: sk-or-v1-abc123")):
            resposta = self._chamar("relatorio_de_custos")
        texto = resposta.content[0].text
        self.assertTrue(resposta.is_error)
        self.assertNotIn("sk-or-v1-abc123", texto)
        self.assertIn("SEGREDO PROTEGIDO", texto)

    def test_falha_inesperada_nao_vaza_o_detalhe(self):
        with patch("audiofy.bridge._cmd_costs", side_effect=ZeroDivisionError("sk-or-v1-abc123")):
            resposta = self._chamar("relatorio_de_custos")
        self.assertTrue(resposta.is_error)
        self.assertNotIn("sk-or-v1", resposta.content[0].text)

    def test_argumento_invalido_e_recusado_antes_de_chamar_a_bridge(self):
        with patch("audiofy.bridge._cmd_items") as itens:
            resposta = self._chamar("listar_conteudos", {"limite": "muitos"})
        self.assertTrue(resposta.is_error)
        itens.assert_not_called()


if __name__ == "__main__":
    unittest.main()
