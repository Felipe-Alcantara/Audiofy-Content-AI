# Servidor MCP do Audiofy

O `audiofy-mcp` deixa um agente (Claude Code, Codex, Gemini CLI ou o canvas do Felixo AI Core)
narrar texto como **podcast** de 1 a N vozes ou como **leitura fiel** (audiolivro sem reescrever o
texto). É uma borda sobre a [bridge](../src/audiofy/bridge.py): chama as mesmas funções dela, sem
subprocess e sem regra de negócio duplicada, em `src/audiofy/mcp_server.py`.

Uma geração dura minutos e custa de centavos a cerca de US$ 2. Por isso o servidor mostra a
estimativa antes, deixa o agente acompanhar e abortar, e **não gasta além do limite da chave**.

## Instalação

```bash
# A partir do wheel de uma Release (o extra [mcp] traz o SDK; precisa de ffmpeg no PATH)
python -m pip install "audiofy[mcp] @ https://github.com/Felipe-Alcantara/Audiofy-Content-AI/releases/download/v0.3.0/audiofy-0.3.0-py3-none-any.whl"
```

O núcleo instala sem git e sem Node. A fonte do blog do Akita vem pelo extra `[akita]`, que busca
um repositório Git e por isso só serve a quem tem git instalado. O desktop e o menu continuam
rodando do clone, sem nenhuma variável: o servidor é uma terceira forma de usar o mesmo motor.

Comandos instalados: `audiofy-mcp` (servidor stdio) e `audiofy-bridge` (a bridge JSON).

## Variáveis de ambiente

| Variável | Função |
| --- | --- |
| `OPENROUTER_API_KEY` | **Obrigatória.** A única chave que o servidor usa. Crie uma chave com limite de crédito e renovação em openrouter.ai/keys: esse limite é o teto do gasto. |
| `AUDIOFY_DATA_DIR` | Onde ficam episódios e conteúdo (`episodes/`, `inbox/`). Sem ela, `data/` do clone. |
| `AUDIOFY_STATE_DIR` | Onde ficam perfis e caches. Sem ela, `.audiofy/` do clone. |
| `AUDIOFY_ALLOWED_DIRS` | Pastas que o agente pode ler em `adicionar_arquivo`, separadas por `;` no Windows e `:` nos demais. **Vazia, nada é lido.** |
| `AUDIOFY_TEXT_PROVIDER` | `openrouter` (padrão) ou `claude-code`, `codex`, `gemini-cli` para o texto sair pela assinatura. Veja [texto pela assinatura](#texto-pela-assinatura-opcional). |

O servidor define sozinho `AUDIOFY_SINGLE_KEY=1`: ignora o `.env`, o cofre de chaves e a fila de
chaves do clone. Quem opera à mão se beneficia da fila; num agente ela deixaria o limite da chave
de ser um teto.

## Registrar numa CLI

A sintaxe abaixo foi conferida no `--help` de cada CLI. Troque os caminhos e a chave.

```bash
claude mcp add audiofy -e OPENROUTER_API_KEY=sk-or-... -e AUDIOFY_DATA_DIR=/caminho/dados \
  -e AUDIOFY_STATE_DIR=/caminho/estado -e AUDIOFY_ALLOWED_DIRS=/caminho/pasta-do-agente -- audiofy-mcp

codex mcp add audiofy --env OPENROUTER_API_KEY=sk-or-... --env AUDIOFY_DATA_DIR=/caminho/dados \
  --env AUDIOFY_STATE_DIR=/caminho/estado --env AUDIOFY_ALLOWED_DIRS=/caminho/pasta-do-agente -- audiofy-mcp

gemini mcp add audiofy audiofy-mcp -e OPENROUTER_API_KEY=sk-or-... -e AUDIOFY_DATA_DIR=/caminho/dados \
  -e AUDIOFY_STATE_DIR=/caminho/estado -e AUDIOFY_ALLOWED_DIRS=/caminho/pasta-do-agente
```

## Ferramentas

Os nomes seguem o idioma do projeto. A coluna "Gasta" diz se a chamada usa crédito do OpenRouter.

| Ferramenta | O que faz | Gasta |
| --- | --- | --- |
| `listar_conteudos` | Lista as fontes ou os itens de uma fonte, com busca. | não |
| `ver_conteudo` | Palavras e **estimativa por modo** (mínimo, central e máximo, e duração). | não |
| `adicionar_texto` | Guarda um texto na fonte `custom` (até 5 MiB). | não |
| `adicionar_url` | Baixa uma página pública (http/https, até 5 MiB); rede local ou privada é recusada. | não |
| `adicionar_arquivo` | Extrai PDF, DOCX, EPUB, TXT, MD ou imagem (até 50 MiB), **só dentro das pastas liberadas**. | não |
| `listar_vozes` | Vozes do modelo atual, com o tom medido (Hz) de cada uma. | não |
| `gerar_episodio` | Começa a gerar em segundo plano e responde na hora. Modos: `podcast`, `leitura_fiel` (exige `voz`), `reflexivo`. | **sim** |
| `refazer_trechos` | Refaz só trechos já gerados (ex.: `2,3,7`), uma fração do custo de regerar tudo. | **sim** |
| `acompanhar_geracao` | Estado, etapa, progresso, custo até agora, erro, caminho do MP3 e o fim do log. | não |
| `abortar_geracao` | Interrompe e para de gastar; o progresso fica salvo. **Sempre liberada.** | não |
| `exportar_notebooklm` | Prepara a pasta para gerar o áudio no NotebookLM, a custo zero. | não |
| `exportar_legendas` | Legendas `.srt` e capítulos com o tempo de cada trecho. | não |
| `consultar_saldo` | Chave, quanto resta no limite dela e ffmpeg. É a checagem de saúde. | não |
| `relatorio_de_custos` | O que os episódios já gerados custaram. | não |

`listar_vozes` lê o catálogo local do modelo (com o tom medido), em vez de consultar o catálogo de
modelos do OpenRouter como faz o comando `tts-catalog` da bridge: a escolha da voz não depende de
rede. As dicas de cada ferramenta (`readOnlyHint`, `openWorldHint`) acompanham o registro para o
app mostrar o que lê e o que age fora.

**Não existem no servidor:** `chat` (quem conversa é o agente), `keys-*`, `setup-install`,
`setup-check`, `profiles-*`, `settings-info`, `models-list`, `sync` e os comandos internos.

## Como o teto funciona

1. `gerar_episodio` calcula a estimativa do modo pedido e compara o **topo da faixa** (e não o
   valor central) com o que **resta no limite da chave** (`/api/v1/key`). A estimativa já ficou
   abaixo do real: US$ 1,32 estimados contra US$ 1,71 cobrados.
2. Passou do que resta, **recusa antes de gastar** e diz os dois valores. Limite esgotado também
   recusa e diz quando renova.
3. Se não conseguir confirmar o limite (rede, chave inválida), **recusa**: sem a conferência não
   há teto.
4. `refazer_trechos` faz a mesma conferência com a estimativa dos trechos escolhidos, **antes de
   apagar** qualquer áudio.
5. Durante a geração, a chave que esgotar termina a geração com erro. **Nenhuma outra chave é
   tentada e nada é retomado sozinho**: quem retoma é o agente, chamando `gerar_episodio` de novo.

**Chave sem limite de crédito.** Por decisão registrada, o servidor gera mesmo assim, devolvendo o
aviso de que nada além da conta segura o gasto. Crie uma chave com limite para ter um teto de
verdade. A conferência também não reserva saldo entre gerações simultâneas: duas gerações podem
passar juntas pela conferência, e o limite da chave no OpenRouter é a barreira final.

## Texto pela assinatura (opcional)

Com `AUDIOFY_TEXT_PROVIDER=claude-code|codex|gemini-cli`, as etapas de texto rodam a CLI instalada
e custam US$ 0,00; só a voz paga. As respostas passam a trazer o aviso de que:

- esse gasto **não entra no teto em dólar** e consome a janela de uso de uma conta;
- a CLI roda dentro de outra CLI, com o ambiente herdado do servidor — o que cada CLI repassa a um
  servidor stdio ainda não foi medido.

## Segurança

- Só a chave do ambiente vale; erros e logs passam por máscara de segredos antes de chegar ao agente.
- `adicionar_arquivo` resolve `..` e atalhos antes de conferir a pasta, e responde igual exista o
  arquivo ou não (o agente não consegue sondar o disco). Sem `AUDIOFY_ALLOWED_DIRS`, nada é lido.
- `item_id` aceita só nomes que viram pasta com segurança (sem `..`, `\` ou `:`).
- O texto vai para o provedor de voz e, no modo podcast, para o de texto.
- Um `print` solto dentro de uma ferramenta iria para o stderr, nunca para o protocolo stdio.
- O README do Audiofy avisa: o modo preserva o texto, mas **não concede direito de reproduzir
  livros ou fanfics**. Narre obra própria, em domínio público ou autorizada.

## Verificação

```bash
python -m pip install -r requirements-dev.txt        # inclui o SDK mcp
python scripts/check_quality.py                      # régua completa
python scripts/verify_mcp_package.py                 # constrói o wheel e testa instalado
```

`verify_mcp_package.py` instala o wheel num venv novo, **sem o clone no caminho**, e fala com o
`audiofy-mcp` por stdio: 14 ferramentas, dados em `AUDIOFY_DATA_DIR`, arquivo fora das pastas
recusado, geração recusada sem confirmar o limite e o worker em segundo plano subindo a partir do
pacote. Usa chave falsa e não gasta crédito.

## Entrada do catálogo do Felixo AI Core

O AI Core ainda não tem o motor do catálogo de MCP nem o tipo de instalação `wheel`; esta entrada
segue o formato proposto na task do contrato do catálogo e valida quando esse motor existir.
`sha256` é o do wheel anexado à Release.

```json
{
  "id": "audiofy",
  "nome": "Audiofy (podcast e audiolivro)",
  "categoria": "criativo/audio",
  "origem": {
    "repositorio": "https://github.com/Felipe-Alcantara/Audiofy-Content-AI",
    "licenca": "MIT",
    "oficial": false,
    "mantenedor": "Felipe Martin (projeto próprio)"
  },
  "versao": "0.3.0",
  "instalacao": {
    "tipo": "wheel",
    "url": "https://github.com/Felipe-Alcantara/Audiofy-Content-AI/releases/download/v0.3.0/audiofy-0.3.0-py3-none-any.whl",
    "sha256": "<sha256 do wheel da Release>",
    "extras": ["mcp"],
    "comando": "audiofy-mcp"
  },
  "transporte": "stdio",
  "execucao": "por-agente",
  "variaveis": {
    "AUDIOFY_DATA_DIR": "userData/mcp/audiofy/dados",
    "AUDIOFY_STATE_DIR": "userData/mcp/audiofy/estado",
    "AUDIOFY_ALLOWED_DIRS": "<pastas do agente>",
    "AUDIOFY_TEXT_PROVIDER": "openrouter"
  },
  "segredos": [
    {
      "nome": "OPENROUTER_API_KEY",
      "rotulo": "Chave do OpenRouter dos agentes",
      "comoObter": "openrouter.ai → Keys, com limite de crédito e renovação diária",
      "obrigatorio": true
    }
  ],
  "autorizacao": "chave",
  "preRequisitos": ["ffmpeg (instalado pelo app)", "Python 3.10+ (matriz do instalador)"],
  "saude": {"tipo": "ferramenta", "ferramenta": "consultar_saldo", "tambem": "ffmpeg encontrado"},
  "sistemas": ["win32", "darwin", "linux"],
  "agentes": ["claude", "codex", "gemini"],
  "custo": {
    "unidade": "US$",
    "consultaAntes": "ver_conteudo (estimativa com faixa)",
    "medido": "US$ 0,57 por episódio; de US$ 0,02 a US$ 0,061 por minuto",
    "tetoNoServidor": "limite da chave no OpenRouter, com a fila de chaves desligada"
  },
  "ferramentasQueAgemFora": ["gerar_episodio", "refazer_trechos"],
  "riscos": [
    "gasta créditos por minuto de áudio, e a estimativa já errou para menos",
    "chave sem limite de crédito gera sem teto, com aviso",
    "narrar obra de terceiros exige direito sobre o texto",
    "o texto vai para o provedor de voz e de texto",
    "adicionar_url busca páginas na web (endereços locais e privados são recusados)"
  ],
  "desinstalacao": {
    "pastas": ["userData/mcp/servidores/audiofy", "userData/mcp/audiofy"],
    "segredos": ["OPENROUTER_API_KEY"],
    "foraDoApp": "episódios copiados pela pessoa para outra pasta continuam lá"
  },
  "verificadoEm": "2026-10-26"
}
```

Diferenças em relação à proposta original da task: a versão é `0.3.0` (o projeto já estava em
`0.2.0`, não em `0.1.0`), entra `AUDIOFY_ALLOWED_DIRS` (as Pastas do agente) e some o campo
`arvoreTravada`: o wheel fixa as sete dependências de núcleo, mas as do SDK `mcp` são uma faixa e
ainda não há arquivo de requisitos com hash.
