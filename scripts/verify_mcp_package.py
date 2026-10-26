#!/usr/bin/env python3
"""Verifica o Audiofy como o AI Core o instala: o wheel num venv limpo, sem o clone.

Os testes unitários provam a lógica com a bridge em memória. Este utilitário prova o
artefato: constrói (ou recebe) o wheel, instala com o extra ``mcp`` num venv novo e fala com o
``audiofy-mcp`` por stdio, de um diretório onde o repositório não existe. Pega o que o teste
em memória não enxerga: arquivo que faltou no pacote, dado gravado dentro do clone em vez de
``AUDIOFY_DATA_DIR`` e worker em segundo plano que só sobe a partir do clone.

Usa uma chave falsa e nunca gasta crédito: gerar é recusado porque o limite da chave não
pode ser confirmado, e o worker é lançado direto para provar que ele sobe e falha limpo.

Uso:
    python scripts/verify_mcp_package.py
    python scripts/verify_mcp_package.py --wheel dist/audiofy-0.3.0-py3-none-any.whl

Sai com código 1 se qualquer verificação falhar.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CHAVE_FALSA = "sk-or-v1-chave-falsa-so-para-teste"
FERRAMENTAS = 14
PRAZO_INSTALACAO_S = 900
PRAZO_WORKER_S = 90

#: Roda no venv, de fora do clone. Fala com o servidor pelo cliente do próprio SDK.
CLIENTE = r"""
import asyncio, json, os, sys
from mcp import Client, StdioServerParameters

async def main():
    ambiente = {chave: valor for chave, valor in os.environ.items() if chave.startswith("AUDIOFY_")}
    ambiente.update(OPENROUTER_API_KEY=os.environ["OPENROUTER_API_KEY"], PYTHONUTF8="1")
    parametros = StdioServerParameters(command=sys.argv[1], args=[], env=ambiente)
    saida = {}
    async with Client(parametros) as cliente:
        saida["ferramentas"] = sorted(t.name for t in (await cliente.list_tools()).tools)
        texto = await cliente.call_tool(
            "adicionar_texto", {"titulo": "Teste do pacote", "texto": "Uma frase curta. " * 30}
        )
        saida["adicionar_texto"] = json.loads(texto.content[0].text)
        item_id = saida["adicionar_texto"]["item_id"]
        ver = await cliente.call_tool("ver_conteudo", {"fonte": "custom", "item_id": item_id})
        saida["ver_conteudo"] = json.loads(ver.content[0].text)
        fora = await cliente.call_tool("adicionar_arquivo", {"caminho": sys.argv[2]})
        saida["arquivo_fora"] = [fora.is_error, fora.content[0].text]
        saldo = await cliente.call_tool("consultar_saldo", {})
        saida["saldo"] = [saldo.is_error, saldo.content[0].text]
        gerar = await cliente.call_tool("gerar_episodio", {"fonte": "custom", "item_id": item_id})
        saida["gerar"] = [gerar.is_error, gerar.content[0].text]
    print("RESULTADO:" + json.dumps(saida))

asyncio.run(main())
"""

#: Lança o worker de verdade a partir do pacote instalado e espera ele terminar.
WORKER = r"""
import json, sys, time
from pathlib import Path
from audiofy import bridge, config

item_id = sys.argv[1]
print("RESULTADO:" + json.dumps(bridge._cmd_generate("custom", item_id)["started"]))
diretorio = config.EPISODES_DIR / item_id
prazo = time.time() + float(sys.argv[2])
estado = {}
while time.time() < prazo:
    arquivo = diretorio / "status.json"
    estado = json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.is_file() else {}
    if estado.get("state") not in {None, "iniciando", "rodando"}:
        break
    time.sleep(1)
log = diretorio / "generation.log"
print("RESULTADO:" + json.dumps({
    "estado": estado.get("state"),
    "erro": estado.get("last_error"),
    "log": log.read_text(encoding="utf-8")[-600:] if log.is_file() else None,
}))
"""


def executar(comando: list[str], **opcoes) -> subprocess.CompletedProcess:
    return subprocess.run(
        comando, capture_output=True, encoding="utf-8", errors="replace", **opcoes
    )


def ultimo_resultado(saida: str) -> object:
    linhas = [linha for linha in saida.splitlines() if linha.startswith("RESULTADO:")]
    if not linhas:
        raise RuntimeError("o cliente não devolveu resultado:\n" + saida[-1500:])
    return json.loads(linhas[-1].removeprefix("RESULTADO:"))


def construir_wheel(destino: Path) -> Path:
    resultado = executar(
        [sys.executable, "-m", "pip", "wheel", ".", "--no-deps", "-w", str(destino)],
        cwd=PROJECT_ROOT,
        timeout=PRAZO_INSTALACAO_S,
    )
    if resultado.returncode:
        raise RuntimeError("não foi possível construir o wheel:\n" + resultado.stderr[-1500:])
    return next(destino.glob("audiofy-*.whl"))


def criar_ambiente(raiz: Path, wheel: Path) -> tuple[Path, Path]:
    venv = raiz / "venv"
    subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
    binarios = venv / ("Scripts" if os.name == "nt" else "bin")
    python = binarios / ("python.exe" if os.name == "nt" else "python")
    comando = [str(python), "-m", "pip", "install", "--quiet", f"{wheel}[mcp]"]
    resultado = executar(comando, timeout=PRAZO_INSTALACAO_S)
    if resultado.returncode:
        raise RuntimeError("falha ao instalar o wheel:\n" + resultado.stderr[-1500:])
    servidor = binarios / ("audiofy-mcp.exe" if os.name == "nt" else "audiofy-mcp")
    return python, servidor


def verificar(wheel: Path | None) -> list[str]:
    falhas: list[str] = []

    def conferir(descricao: str, condicao: bool, detalhe: object = "") -> None:
        print(f"  {'OK    ' if condicao else 'FALHOU'} {descricao}")
        if not condicao:
            falhas.append(f"{descricao}: {detalhe}")

    with tempfile.TemporaryDirectory(prefix="audiofy-pacote-") as temporario:
        raiz = Path(temporario)
        wheel = wheel or construir_wheel(raiz / "dist")
        print(f"Wheel: {wheel.name}")
        python, servidor = criar_ambiente(raiz, wheel)
        dados, estado, liberada = raiz / "dados", raiz / "estado", raiz / "liberada"
        liberada.mkdir()
        segredo = raiz / "segredo.txt"
        segredo.write_text("fora das pastas liberadas", encoding="utf-8")
        ambiente = {
            **os.environ,
            "AUDIOFY_DATA_DIR": str(dados),
            "AUDIOFY_STATE_DIR": str(estado),
            "AUDIOFY_ALLOWED_DIRS": str(liberada),
            "OPENROUTER_API_KEY": CHAVE_FALSA,
            "AUDIOFY_SINGLE_KEY": "1",
            "PYTHONUTF8": "1",
        }
        # -I e cwd fora do clone: o import só pode vir do pacote instalado.
        base = [str(python), "-I"]
        cliente = executar(
            [*base, "-c", CLIENTE, str(servidor), str(segredo)],
            cwd=raiz,
            env=ambiente,
            timeout=PRAZO_WORKER_S * 2,
        )
        if cliente.returncode:
            return [f"o cliente MCP falhou:\n{cliente.stderr[-2000:]}"]
        saida = ultimo_resultado(cliente.stdout)

        print("Servidor por stdio:")
        conferir(f"expõe as {FERRAMENTAS} ferramentas", len(saida["ferramentas"]) == FERRAMENTAS)
        item_id = saida["adicionar_texto"]["item_id"]
        conferir(
            "o texto foi para AUDIOFY_DATA_DIR",
            (dados / "inbox" / f"{item_id}.md").is_file(),
            list(dados.rglob("*"))[:5],
        )
        conferir(
            "nada foi gravado dentro do pacote instalado",
            not list((raiz / "venv").rglob("inbox")),
        )
        maximo = saida["ver_conteudo"]["estimativas"]["podcast"]["custo_usd"]["maximo"]
        conferir("ver_conteudo estima o custo antes de gastar", maximo > 0, maximo)
        recusado, mensagem = saida["arquivo_fora"]
        conferir(
            "arquivo fora das pastas liberadas é recusado",
            recusado and "fora das pastas" in mensagem,
            mensagem,
        )
        conferir(
            "consultar_saldo com chave falsa não é conectado",
            "Conectado" not in str(saida["saldo"]),
        )
        recusado, mensagem = saida["gerar"]
        conferir("gerar_episodio recusa sem confirmar o limite da chave", recusado, mensagem)
        conferir(
            "recusar não deixou episódio nem gasto para trás",
            not (dados / "episodes").exists() or not any((dados / "episodes").iterdir()),
        )

        print("Worker em segundo plano:")
        worker = executar(
            [*base, "-c", WORKER, item_id, str(PRAZO_WORKER_S)],
            cwd=raiz,
            env=ambiente,
            timeout=PRAZO_WORKER_S + 60,
        )
        if worker.returncode:
            falhas.append(f"o lançamento do worker falhou:\n{worker.stderr[-2000:]}")
        else:
            linhas = [x for x in worker.stdout.splitlines() if x.startswith("RESULTADO:")]
            iniciou = json.loads(linhas[0].removeprefix("RESULTADO:"))
            final = json.loads(linhas[-1].removeprefix("RESULTADO:"))
            conferir("o worker foi lançado a partir do pacote", iniciou is True)
            log = final["log"] or ""
            conferir(
                "o worker rodou o Audiofy instalado (sem 'No module named')",
                bool(final["log"]) and "No module named" not in log,
                log[-300:],
            )
            conferir(
                "a chave falsa termina em falha, não em gasto", final["estado"] == "falhou", final
            )
    return falhas


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--wheel", type=Path, help="usa este wheel em vez de construir um")
    args = parser.parse_args()
    inicio = time.time()
    try:
        falhas = verificar(args.wheel.resolve() if args.wheel else None)
    except (RuntimeError, subprocess.SubprocessError, OSError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    if falhas:
        print("\nVerificação reprovada:", *falhas, sep="\n- ", file=sys.stderr)
        return 1
    print(f"\nPacote aprovado em {time.time() - inicio:.0f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
