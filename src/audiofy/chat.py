"""Chat de pesquisa do Audiofy.

Assistente conversacional para pesquisar temas (qualquer assunto, não só uma
fonte específica), avaliar conteúdos e comandar o programa. As respostas podem
conter ações estruturadas em blocos ```acao — a interface (CLI ou app) mostra
e executa cada ação com um clique, pela mesma bridge de sempre.

Provedor: a CLI de assinatura configurada (custo zero; no Claude Code a
pesquisa na web é liberada via WebSearch) ou a API do OpenRouter.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Callable

from .config import DATA_DIR, Settings

CHAT_DIR = DATA_DIR / "chat"

SYSTEM_PROMPT = """Você é o assistente do Audiofy Content AI, um programa que transforma
conteúdo em podcasts auditáveis. Responda sempre em português brasileiro, de forma direta.

Você ajuda a: pesquisar temas e indicar bons conteúdos/artigos sobre qualquer assunto,
avaliar se um conteúdo rende um bom episódio, e operar o programa. Quando tiver acesso a
pesquisa na web, use-a para trazer informações atuais com as fontes.

Quando quiser propor uma operação concreta, inclua ao final um ou mais blocos de ação,
exatamente neste formato (um JSON por bloco):

```acao
{"tipo": "adicionar_url", "url": "https://…", "descricao": "Adicionar este artigo como conteúdo"}
```

Tipos disponíveis:
- adicionar_url {url} — baixa uma página e guarda o texto como conteúdo gerável
- buscar {fonte, termos} — busca itens numa fonte ("akita" ou "custom")
- gerar {fonte, item_id} — inicia a geração de um episódio (consome créditos; sempre avise)
- exportar_notebooklm {fonte, item_id} — prepara o pacote de custo zero

Nunca invente item_id: use os que a conversa apresentou. Fora dos blocos ```acao, escreva
texto normal."""


def parse_actions(reply: str) -> tuple[str, list[dict]]:
    """Separa o texto da resposta e as ações estruturadas."""
    actions = []
    for block in re.findall(r"```acao\s*\n(.*?)\n\s*```", reply, re.DOTALL):
        try:
            data = json.loads(block)
            if isinstance(data, dict) and data.get("tipo"):
                actions.append(data)
        except json.JSONDecodeError:
            continue
    text = re.sub(r"```acao\s*\n.*?\n\s*```", "", reply, flags=re.DOTALL).strip()
    return text, actions


class ChatSession:
    def __init__(self, session_id: str = "principal",
                 chat_dir: Path | None = None) -> None:
        self.path = (chat_dir or CHAT_DIR) / f"{session_id}.json"
        self.messages: list[dict] = []
        if self.path.is_file():
            self.messages = json.loads(self.path.read_text(encoding="utf-8"))

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self.messages, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def clear(self) -> None:
        self.messages = []
        self._flush()

    def _transcript(self) -> str:
        lines = []
        for message in self.messages[-20:]:  # janela de contexto do histórico
            speaker = "Usuário" if message["role"] == "user" else "Assistente"
            lines.append(f"{speaker}: {message['content']}")
        return "\n\n".join(lines)

    def send(self, message: str, settings: Settings,
             call_provider: Callable[[str, str, Settings], str] | None = None,
             ) -> tuple[str, list[dict]]:
        """Envia uma mensagem e retorna (texto da resposta, ações propostas)."""
        history = self._transcript()
        user_prompt = (f"Histórico da conversa:\n{history}\n\nUsuário: {message}"
                       if history else message)
        caller = call_provider or _default_provider
        reply = caller(SYSTEM_PROMPT, user_prompt, settings)
        self.messages.append({"role": "user", "content": message, "at": time.time()})
        self.messages.append({"role": "assistant", "content": reply, "at": time.time()})
        self._flush()
        return parse_actions(reply)


def _default_provider(system: str, user: str, settings: Settings) -> str:
    """CLI de assinatura quando configurada (com pesquisa web no Claude Code);
    senão, API do OpenRouter em texto livre."""
    if settings.text_provider not in ("", "openrouter"):
        import subprocess
        from .providers.subscription import get_cli
        cli = get_cli(settings.text_provider)
        if cli.key == "claude-code":
            command = ["claude", "-p", "--output-format", "text",
                       "--allowedTools", "WebSearch", "--append-system-prompt", system]
            stdin = user
        elif cli.args:
            command, stdin = cli.command(system), user
        else:
            command, stdin = [cli.binary], f"{system}\n\n{user}"
        result = subprocess.run(command, input=stdin, capture_output=True,
                                text=True, timeout=900)
        if result.returncode != 0:
            raise RuntimeError(f"{cli.name} falhou: {result.stderr[:300]}")
        return result.stdout.strip()

    import requests
    from .config import OPENROUTER_BASE_URL
    response = requests.post(
        f"{OPENROUTER_BASE_URL}/chat/completions",
        json={
            "model": settings.text_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        headers={"Authorization": f"Bearer {settings.require_api_key()}"},
        timeout=300,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]
