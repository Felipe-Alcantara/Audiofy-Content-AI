"""Servidor MCP do Audiofy: um agente narra texto como podcast ou audiolivro.

É uma borda, como a bridge: chama as mesmas funções dela, sem subprocess e sem regra de
negócio própria. Acrescenta só o que um agente exige e um operador humano dispensa:

- vale apenas a chave entregue pelo app, e o limite dela é o teto do gasto (``_conferir_teto``);
- ``adicionar_arquivo`` só lê dentro das pastas liberadas em ``AUDIOFY_ALLOWED_DIRS``;
- chat, chaves, perfis e instalação não existem aqui: quem conversa é o agente.

As ferramentas são funções comuns que recusam com ``ValueError``; ``build_server`` as registra
e converte a recusa em ``ToolError``, a única exceção cuja mensagem o SDK repassa ao agente.
Os módulos do Audiofy são importados dentro das funções porque ``main`` precisa fixar o modo
de chave única antes de ``config`` ler o ambiente.
"""

from __future__ import annotations

import contextlib
import functools
import os
import re
import shutil
import sys
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any

ALLOWED_DIRS_ENV = "AUDIOFY_ALLOWED_DIRS"
_SINGLE_KEY_ENV = "AUDIOFY_SINGLE_KEY"  # mesmo nome de config.SINGLE_KEY_ENV (testado)
_MAX_TEXT_BYTES = 5 * 1024 * 1024  # mesmo limite do conteúdo baixado por URL
_MAX_FILE_BYTES = 50 * 1024 * 1024
_MAX_LISTED_ITEMS = 200

#: Nome que o agente vê -> modo interno da bridge.
_MODOS = {"podcast": "adaptation", "leitura_fiel": "verbatim", "reflexivo": "reflexive"}
_ITEM_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_./-]*")
_PERIODOS = {"daily": "hoje", "weekly": "nesta semana", "monthly": "neste mês"}
_RENOVACAO = {"daily": "diariamente", "weekly": "semanalmente", "monthly": "mensalmente"}

INSTRUCTIONS = (
    "O Audiofy transforma texto em podcast (de 1 a N vozes) ou em leitura fiel (audiolivro "
    "sem reescrever o texto). Antes de gerar, chame ver_conteudo e diga à pessoa quanto "
    "pode custar: a faixa vai até o máximo, e a estimativa já ficou abaixo do real. Gerar "
    "gasta crédito e leva minutos; depois de gerar_episodio, use acompanhar_geracao e "
    "aborte (abortar_geracao) se travar. Use leitura_fiel para texto da própria pessoa e "
    "não narre obra de terceiros sem ela confirmar que tem o direito. exportar_notebooklm "
    "custa zero."
)


def _bridge():
    from . import bridge

    return bridge


def _item_id(valor: str) -> str:
    """Aceita só ids que viram um nome de pasta seguro (a primeira letra barra '..')."""
    valor = str(valor).strip()
    if len(valor) > 200 or not _ITEM_ID.fullmatch(valor):
        raise ValueError("item_id inválido: use o id devolvido por listar_conteudos.")
    return valor


def _idioma(valor: str) -> str:
    from .languages import is_supported

    if valor and not is_supported(valor):
        raise ValueError(f"Idioma desconhecido: {valor}")
    return valor


def _usd(valor: float) -> str:
    return f"US$ {valor:.2f}".replace(".", ",")


def _estimativa(dados: dict) -> dict:
    return {
        "custo_usd": {
            "minimo": round(dados["cost_min_usd"], 2),
            "central": round(dados["cost_usd"], 2),
            "maximo": round(dados["cost_max_usd"], 2),
        },
        "duracao_min": {
            "minimo": round(dados["duration_min_minutes"], 1),
            "central": round(dados["duration_minutes"], 1),
            "maximo": round(dados["duration_max_minutes"], 1),
        },
        "baseada_em_episodios": dados["sample_count"],
    }


def _pastas_liberadas() -> list[Path]:
    brutas = os.environ.get(ALLOWED_DIRS_ENV, "")
    return [Path(p).expanduser().resolve() for p in brutas.split(os.pathsep) if p.strip()]


def _arquivo_liberado(caminho: str) -> Path:
    pastas = _pastas_liberadas()
    if not pastas:
        raise ValueError(
            "Nenhuma pasta foi liberada para o agente ler arquivos. "
            "Envie o texto com adicionar_texto."
        )
    # Resolve antes de conferir: ".." e atalhos que saem das pastas liberadas caem fora.
    alvo = Path(str(caminho)).expanduser().resolve()
    if not any(alvo.is_relative_to(pasta) for pasta in pastas):
        # Mesma resposta exista o arquivo ou não: não deixa o agente sondar o disco.
        raise ValueError("Esse arquivo está fora das pastas liberadas ao agente.")
    if not alvo.is_file():
        raise ValueError("Arquivo não encontrado dentro das pastas liberadas.")
    if alvo.stat().st_size > _MAX_FILE_BYTES:
        raise ValueError(f"O arquivo passa do limite de {_MAX_FILE_BYTES // (1024 * 1024)} MiB.")
    return alvo


def _limite_da_chave(settings) -> dict:
    """Consulta o limite da chave; sem conseguir confirmar, recusa (o teto é o que protege)."""
    from .providers.openrouter import OpenRouterError, current_key_limit

    settings.require_api_key()
    try:
        limite = current_key_limit(settings)
    except OpenRouterError as erro:
        raise ValueError(
            f"Não consegui confirmar o limite da chave ({erro}). Sem isso não gasto crédito."
        ) from erro
    avisos = []
    if settings.text_provider != "openrouter":
        avisos.append(
            f"O texto sai pela assinatura ({settings.text_provider}): não entra no teto em dólar "
            "e gasta a janela de uso dessa conta."
        )
    if limite.remaining is None:
        avisos.append(
            "A chave não tem limite de crédito no OpenRouter: nada além da conta segura o "
            "gasto. Crie uma chave com limite em openrouter.ai/keys para ter um teto."
        )
    elif limite.remaining <= 0:
        renova = f" (renova {_RENOVACAO.get(limite.reset, limite.reset)})" if limite.reset else ""
        raise ValueError(f"O limite da chave acabou{renova}. Nada foi gerado.")
    return {"restante_usd": limite.remaining, "avisos": avisos}


def _conferir_teto(settings, custo_maximo: float) -> dict:
    """Recusa o que a estimativa (topo da faixa) diz que estouraria o limite da chave."""
    contexto = _limite_da_chave(settings)
    restante = contexto["restante_usd"]
    if restante is not None and custo_maximo > restante:
        raise ValueError(
            f"A estimativa vai até {_usd(custo_maximo)}, mas o limite da chave só tem "
            f"{_usd(restante)}. Nada foi gerado. Escolha um texto menor ou outro modo, ou "
            "peça à pessoa para aumentar o limite da chave."
        )
    return contexto


# ── Ferramentas ──────────────────────────────────────────────────────────────


def listar_conteudos(fonte: str = "", busca: str = "", limite: int = 50) -> dict[str, Any]:
    """Lista as fontes de conteúdo, ou os itens de uma fonte (com busca opcional).

    Sem ``fonte``, devolve as fontes disponíveis; ``custom`` guarda o que você adicionou.
    Não gasta crédito.
    """
    b = _bridge()
    if not fonte:
        return {"fontes": b._cmd_sources()["sources"]}
    itens = (b._cmd_search(fonte, busca) if busca else b._cmd_items(fonte))["items"]
    limite = max(1, min(int(limite), _MAX_LISTED_ITEMS))
    return {
        "fonte": fonte,
        "total": len(itens),
        "itens": itens[:limite],
        "truncado": len(itens) > limite,
    }


def ver_conteudo(fonte: str, item_id: str) -> dict[str, Any]:
    """Mostra um conteúdo e quanto custa narrá-lo em cada modo, antes de gastar.

    A estimativa traz a faixa (mínimo, central e máximo) e a duração. Diga à pessoa o
    máximo: a estimativa já errou para menos. Não gasta crédito.
    """
    item_id = _item_id(item_id)
    dados = _bridge()._cmd_item(fonte, item_id)
    atual = dados.get("actual") or {}
    return {
        "fonte": fonte,
        "item_id": item_id,
        "titulo": dados["title"],
        "palavras": dados["words"],
        "url": dados["url"],
        "estimativas": {
            nome: _estimativa(dados["estimates"][interno]) for nome, interno in _MODOS.items()
        },
        "episodio_existente": (
            {"custo_usd": atual.get("cost_usd"), "duracao_segundos": atual.get("duration_seconds")}
            if atual
            else None
        ),
    }


def adicionar_texto(titulo: str, texto: str) -> dict[str, Any]:
    """Guarda um texto colado como conteúdo da fonte ``custom`` (até 5 MiB). Não gasta crédito."""
    if len(str(texto).encode("utf-8")) > _MAX_TEXT_BYTES:
        raise ValueError(f"O texto passa do limite de {_MAX_TEXT_BYTES // (1024 * 1024)} MiB.")
    resultado = _bridge()._cmd_add_text(titulo, texto)
    return {"fonte": resultado["source"], "item_id": resultado["item_id"]}


def adicionar_url(url: str) -> dict[str, Any]:
    """Baixa uma página pública (http ou https, até 5 MiB) e guarda o texto principal.

    Endereços locais e privados são recusados. Não gasta crédito.
    """
    resultado = _bridge()._cmd_add_url(url)
    return {"fonte": resultado["source"], "item_id": resultado["item_id"]}


def adicionar_arquivo(caminho: str) -> dict[str, Any]:
    """Extrai o texto de um arquivo (PDF, DOCX, EPUB, TXT, MD ou imagem) e o guarda.

    Só lê dentro das pastas que a pessoa liberou ao agente; fora delas, recusa.
    Não gasta crédito.
    """
    resultado = _bridge()._cmd_add_file(str(_arquivo_liberado(caminho)))
    if not resultado["added"]:
        return {
            "adicionado": False,
            "motivo": resultado["reason"],
            "titulo": resultado["title"],
        }
    return {
        "adicionado": True,
        "fonte": resultado["source"],
        "item_id": resultado["item_id"],
        "titulo": resultado["title"],
        "metodo": resultado["method"],
        "palavras": resultado["words"],
    }


def listar_vozes() -> dict[str, Any]:
    """Lista as vozes do modelo de voz atual, com o tom medido de cada uma. Não gasta crédito."""
    from .config import Settings
    from .voices import voice_summary, voices_for_model

    modelo = Settings().tts_model
    catalogo = voices_for_model(modelo) or {}
    return {
        "modelo": modelo,
        "vozes": [
            {"voz": voz, "descricao": descricao, "tom_medido": voice_summary(voz) or "sem medição"}
            for voz, descricao in catalogo.items()
        ],
    }


def gerar_episodio(
    fonte: str,
    item_id: str,
    modo: str = "podcast",
    voz: str = "",
    idioma: str = "pt-BR",
    estabilidade: str = "",
    refazer_do_zero: bool = False,
) -> dict[str, Any]:
    """Começa a gerar o áudio em segundo plano e responde na hora. GASTA CRÉDITO.

    ``modo``: ``podcast`` (adapta o texto a um diálogo), ``leitura_fiel`` (narra sem
    reescrever; exige ``voz``) ou ``reflexivo``. ``estabilidade``: ``natural`` ou
    ``estavel``. Recusa se o topo da estimativa passar do que resta no limite da chave.
    Depois, acompanhe com ``acompanhar_geracao``.
    """
    from .config import Settings
    from .estimates import estimate_episode
    from .sources import get_source

    b = _bridge()
    item_id = _item_id(item_id)
    if modo not in _MODOS:
        raise ValueError(f"Modo desconhecido: {modo!r}. Use podcast, leitura_fiel ou reflexivo.")
    interno = _MODOS[modo]
    b._validate_generation_options(interno, voz or None)
    idioma = _idioma(idioma) or "pt-BR"
    settings = Settings()
    settings.require_api_key()
    item = get_source(fonte).get_item(item_id)
    estimativa = estimate_episode(item.words, settings.tts_model, generation_mode=interno)
    contexto = _conferir_teto(settings, estimativa.cost_max_usd)
    resultado = b._cmd_generate(
        fonte, item_id, refazer_do_zero, interno, voz or None, None, 0.08, idioma, estabilidade
    )
    resposta: dict[str, Any] = {
        "iniciou": resultado["started"],
        "item_id": item_id,
        "modo": modo,
        "estimativa": _estimativa(asdict(estimativa)),
        "restante_usd": contexto["restante_usd"],
        "avisos": contexto["avisos"],
    }
    if resultado["started"]:
        resposta["proximo_passo"] = (
            "Chame acompanhar_geracao até o estado ser 'concluido'. A geração continua se você "
            "encerrar a conversa; abortar_geracao a interrompe."
        )
    else:
        resposta["motivo"] = resultado.get("reason", "")
    return resposta


def refazer_trechos(fonte: str, item_id: str, trechos: str, idioma: str = "") -> dict[str, Any]:
    """Refaz só os trechos indicados (ex.: ``2,3,7``) de um episódio já gerado. GASTA CRÉDITO.

    Custa uma fração de regerar tudo. Recusa, sem apagar nada, se passar do limite da chave.
    """
    from .config import Settings

    item_id = _item_id(item_id)
    contexto = _limite_da_chave(Settings())
    resultado = _bridge()._cmd_regenerate_chunks(
        fonte, item_id, trechos, _idioma(idioma), max_cost_usd=contexto["restante_usd"]
    )
    if not resultado["started"]:
        return {"iniciou": False, "motivo": resultado.get("reason", "")}
    return {
        "iniciou": True,
        "trechos": resultado["chunks"],
        "custo_estimado_usd": resultado["estimated_cost_usd"],
        "restante_usd": contexto["restante_usd"],
        "avisos": contexto["avisos"],
    }


def acompanhar_geracao(
    item_id: str, idioma: str = "", linhas_do_log: int = 12, incluir_trechos: bool = False
) -> dict[str, Any]:
    """Mostra o estado de uma geração: etapa, progresso, custo até agora, erro e o fim do log.

    Quando ``estado`` for ``concluido``, ``mp3`` traz o caminho do áudio. Não gasta crédito.
    """
    b = _bridge()
    item_id = _item_id(item_id)
    idioma = _idioma(idioma)
    resumo = b._episode_summary(b._episode_dir(item_id, idioma))
    log = b._cmd_generation_log(item_id, idioma)
    quantas = max(1, min(int(linhas_do_log), 60))
    resposta: dict[str, Any] = {
        "titulo": resumo["title"],
        "estado": resumo["state"],
        "etapa": resumo["stage"],
        "progresso": resumo["progress"],
        "custo_usd": resumo["cost_usd"],
        "custo_exato": resumo["cost_exact"],
        "ultimo_erro": resumo["last_error"],
        "nova_tentativa": resumo["retry"],
        "mp3": resumo["mp3"],
        "duracao_segundos": resumo["duration_seconds"],
        "worker_vivo": log["worker_alive"],
        "log": log["text"].splitlines()[-quantas:],
    }
    if incluir_trechos:
        resposta["trechos"] = b._cmd_audio_chunks(item_id, idioma)
    return resposta


def abortar_geracao(item_id: str, idioma: str = "") -> dict[str, Any]:
    """Interrompe uma geração em andamento e para de gastar. O progresso fica salvo."""
    resultado = _bridge()._cmd_abort(_item_id(item_id), _idioma(idioma))
    return {
        "abortado": resultado["aborted"],
        "worker_encerrado": resultado.get("stopped", False),
        "observacao": resultado.get("note") or resultado.get("reason", ""),
    }


def exportar_notebooklm(fonte: str, item_id: str) -> dict[str, Any]:
    """Prepara uma pasta para gerar o áudio no NotebookLM, a custo zero (sem garantia de
    cobertura do texto)."""
    return {"pasta": _bridge()._cmd_notebooklm(fonte, _item_id(item_id))["pack"]}


def exportar_legendas(item_id: str, idioma: str = "") -> dict[str, Any]:
    """Grava legendas (.srt) e capítulos com o tempo de cada trecho de um episódio gerado."""
    resultado = _bridge()._cmd_export_markers(_item_id(item_id), _idioma(idioma))
    return {"arquivos": resultado["files"], "trechos": resultado["chunks"]}


def consultar_saldo() -> dict[str, Any]:
    """Confere a chave, quanto resta no limite dela e se o ffmpeg foi encontrado.

    É a checagem de saúde do servidor. Não gasta crédito.
    """
    from .config import Settings
    from .providers.openrouter import OpenRouterError, current_key_limit

    settings = Settings()
    ffmpeg = shutil.which("ffmpeg") is not None
    base = {
        "ffmpeg_encontrado": ffmpeg,
        "modelo_de_voz": settings.tts_model,
        "texto_pela_assinatura": settings.text_provider != "openrouter",
    }
    if not settings.api_key:
        return {"conectado": False, "mensagem": "Nenhuma chave do OpenRouter configurada.", **base}
    try:
        limite = current_key_limit(settings)
    except OpenRouterError as erro:
        return {"conectado": False, "mensagem": f"Chave recusada: {erro}", **base}
    if limite.remaining is None:
        quanto = "a chave não tem limite de crédito"
    else:
        periodo = _PERIODOS.get(limite.reset or "", "no total")
        quanto = f"restam {_usd(limite.remaining)} {periodo}"
    mensagem = f"Conectado; {quanto}; ffmpeg {'encontrado' if ffmpeg else 'NÃO encontrado'}"
    return {
        "conectado": True,
        "mensagem": mensagem,
        "chave": {
            "rotulo": limite.label,
            "limite_usd": limite.limit,
            "restante_usd": limite.remaining,
            "uso_usd": limite.usage,
            "renovacao": limite.reset,
            "sem_limite": limite.limit is None,
        },
        **base,
    }


def relatorio_de_custos() -> dict[str, Any]:
    """Resume o que os episódios já gerados custaram. Não gasta crédito."""
    return _bridge()._cmd_costs()


#: (função, fala com a rede?, só lê?) — vira as dicas de ferramenta que o app mostra à pessoa.
_FERRAMENTAS = (
    (listar_conteudos, False, True),
    (ver_conteudo, False, True),
    (adicionar_texto, False, False),
    (adicionar_url, True, False),
    (adicionar_arquivo, False, False),
    (listar_vozes, False, True),
    (gerar_episodio, True, False),
    (refazer_trechos, True, False),
    (acompanhar_geracao, False, True),
    (abortar_geracao, False, False),
    (exportar_notebooklm, False, False),
    (exportar_legendas, False, False),
    (consultar_saldo, True, True),
    (relatorio_de_custos, False, True),
)


_stdout_lock = threading.Lock()
_stdout_em_uso = 0
_stdout_original = None


@contextlib.contextmanager
def _stdout_no_stderr():
    """Um print solto no stdout corromperia o protocolo stdio (medido no SDK 2.3 no Windows).

    O transporte já guarda o buffer real do stdout, então trocar ``sys.stdout`` não o afeta.
    A contagem evita que uma chamada devolva o stdout enquanto outra, em outra thread, ainda
    roda.
    """
    global _stdout_em_uso, _stdout_original
    with _stdout_lock:
        if _stdout_em_uso == 0:
            _stdout_original, sys.stdout = sys.stdout, sys.stderr
        _stdout_em_uso += 1
    try:
        yield
    finally:
        with _stdout_lock:
            _stdout_em_uso -= 1
            if _stdout_em_uso == 0:
                sys.stdout = _stdout_original


def _com_recusas(funcao):
    from mcp.server.mcpserver.exceptions import ToolError

    @functools.wraps(funcao)
    def executar(*args, **kwargs):
        try:
            with _stdout_no_stderr():
                return funcao(*args, **kwargs)
        except (ValueError, LookupError, RuntimeError, OSError) as erro:
            # Falha prevista: a mensagem segue ao agente, sem chave. O resto é falha real e o
            # SDK mostra só "Error executing tool", deixando o detalhe no log do servidor.
            raise ToolError(_bridge()._sanitize_generation_log(str(erro))) from erro

    return executar


def build_server():
    from mcp.server import MCPServer
    from mcp.types import ToolAnnotations

    from . import __version__

    servidor = MCPServer("audiofy", instructions=INSTRUCTIONS, version=__version__)
    for funcao, age_fora, so_leitura in _FERRAMENTAS:
        servidor.tool(
            description=funcao.__doc__,
            annotations=ToolAnnotations(readOnlyHint=so_leitura, openWorldHint=age_fora),
        )(_com_recusas(funcao))
    return servidor


def main() -> None:
    os.environ[_SINGLE_KEY_ENV] = "1"
    build_server().run("stdio")


if __name__ == "__main__":
    main()
