# IA.md — Contexto operacional

> Linha do tempo de decisões do projeto. Não reescreva registros antigos: acrescente
> uma nova entrada datada com contexto, motivo e validação.

## Objetivo atual

MVP funcional: transformar conteúdo próprio, URLs públicas ou fontes registradas em episódios de
podcast auditáveis, com 1..N apresentadores, retomada por checkpoint, custo observável e interfaces
CLI/Electron, seguindo [docs/PLANO-TECNICO.md](docs/PLANO-TECNICO.md).

## Stack e convenções

- Python 3.10+ com `requests`, `questionary` e `rich`; `ffmpeg` para montagem de áudio.
- Electron 41 com Node.js 18.18+ para o desktop; lógica de negócio permanece no backend Python.
- Estrutura `src/audiofy/` separada em fontes, provedores, pipeline, runtime, bridge e interfaces.
- Porta de entrada: `start_app.py` (menu interativo, padrão Felixo).
- Episódios auditáveis em `data/episodes/`; estado pessoal (`data/chat/`, `data/inbox/`) ignorado.
- Segredos somente em `.env` ou `.audiofy/keys.json`, ambos fora do Git.
- Testes com `unittest` e coverage.py; JavaScript com Node test runner; régua em
  `scripts/check_quality.py`.

## Estado atual (resumo vivo)

Última atualização: [2026-07-29]
- Fase: MVP funcional; estratégia de separação em três superfícies documentada.
- Estado: branches `feat/uso-interno`, `feat/uso-publico` e `feat/uso-api` criadas a partir de `main`.
- Próximo passo: implementar e testar as bordas de cada frente sem duplicar o núcleo.
- Risco aberto: o Meu-Ecoo-Prisma ainda não possui integração executável; o contrato da API precisa ser validado com o consumidor antes de estabilizar a versão pública.

---

## 2026-07-16 — MVP inicial (listagem + geração via OpenRouter)

**O que mudou:** primeira implementação executável. Sincronizador Git do repositório
`akitaonrails/akitaonrails.github.io`, parser mínimo de frontmatter, listagem de artigos,
e pipeline de episódio em 5 etapas: matriz de cobertura → roteiro (2 apresentadores) →
auditoria do roteiro → TTS por turno → montagem/normalização com ffmpeg.

**Decisões:**

- **Parser de frontmatter mínimo (regex), sem PyYAML** — o frontmatter do blog usa apenas
  chaves simples; evita dependência. Se aparecerem estruturas complexas, migrar para PyYAML.
- **Cada etapa persiste artefato JSON** em `data/episodes/<id>/` — permite retomada após falha
  e auditoria humana (`coverage.json`, `script.json`, `audit.json`, `segments/`).
- **Auditoria não bloqueia a geração no MVP** — reporta pendências críticas no terminal e
  registra em `audit.json`; a decisão de publicar é humana (revisão obrigatória nos pilotos).
- **STT (fase 4 do plano) ficou de fora do MVP** — a auditoria pós-áudio será humana por
  enquanto; o plano prevê a etapa e a estrutura comporta adicioná-la.
- **Uma voz por chamada TTS** (contrato portável do OpenRouter); multivoz nativo fica como
  otimização futura.
- Modelos padrão em `config.py`, todos substituíveis por variáveis de ambiente `AKITA_*`.

**Validação:** `python3 -m unittest` (parser) e fluxo real de sync + listagem (771+ artigos,
commit registrado). A geração de episódio depende de `OPENROUTER_API_KEY` e ainda não foi
executada ponta a ponta com créditos reais.

**Risco que sobrou:** nomes de modelos TTS/voz podem divergir do catálogo atual do OpenRouter —
o primeiro teste real deve validar `AKITA_TTS_MODEL` e as vozes; ajuste via `.env` sem mudar código.

---

## 2026-07-16 — Primeiro episódio real: correção de PCM e barra de progresso

**O que mudou:** o primeiro teste ponta a ponta com créditos reais confirmou o risco registrado
acima: o Gemini TTS no OpenRouter rejeita `response_format=mp3` (HTTP 400) e só aceita `pcm`.
O adaptador agora recebe PCM cru (16-bit mono, taxa configurável via `AKITA_TTS_SAMPLE_RATE`,
padrão 24 kHz) e o embrulha em WAV — o que o plano já recomendava como intermediário sem perdas.
A etapa de TTS ganhou barra de progresso (linha única no terminal, linha por turno em log) e a
saída passou a ter flush por linha, para acompanhamento via `tail -f`.

**Validação:** episódio piloto gerado com sucesso a partir do artigo
"Fiz o Fable 5 analisar código do TikTok…" (2026-07-08): 66 itens de cobertura, 41 turnos,
auditoria sem pendências críticas, ~13 min de áudio, MP3 normalizado. A retomada após falha
funcionou como projetado — matriz/roteiro/auditoria foram reaproveitados do disco e a síntese
recomeçou do primeiro segmento faltante, sem custo duplicado nas etapas textuais.

**Pendências registradas:** revisão humana integral do episódio piloto (exigência do plano);
registrar o custo real da rodada (painel do OpenRouter) antes de gerar em lote.

---

## 2026-07-17 — Rebrand para Audiofy Content AI e extração do módulo akita-articles

**O que mudou:** o projeto deixou de ser "Akita to Podcast" e virou um programa geral de
geração de podcasts a partir de conteúdo. Reposicionamento completo:

- **Repositório renomeado** para `Audiofy-Content-AI` (o GitHub redireciona o nome antigo);
  a pasta local pode ser renomeada quando conveniente.
- **Módulo `akita-articles` extraído** para repositório próprio
  (https://github.com/Felipe-Alcantara/akita-articles): sincronização, busca com normalização
  de acentos, separação de seções e análise editorial; 17 testes próprios. O Audiofy o consome
  via pip (o Setup instala) ou clone irmão em desenvolvimento.
- **Pacote `audiofy` substitui `akita_podcast`**: fontes de conteúdo viram um registro
  Open/Closed (`sources/`, contrato `ContentSource`/`ContentItem`, inspirado no padrão de
  interfaces declarativas do Openia); provedor OpenRouter em `providers/`; runtime de geração
  em `runtime/`.
- **1..N apresentadores** por configuração (`AUDIOFY_PRESENTERS="nome:Voz[:tom], …"`), com
  prompts montados dinamicamente; catálogo de modelos TTS (API) e das 30 vozes Gemini no menu.
- **Custo em tempo real** (feature obrigatória definida pelo usuário): etapas de texto usam
  `usage.cost` exato da API; cada TTS preserva `X-Generation-Id` e consulta seu `total_cost`
  individual, sem misturar as outras chaves da conta. Custo e precisão aparecem na barra, no
  `status.json`, no manifesto, no Status e no `NOTES.md`.
- **Transparência de gasto em segundo plano**: `status.json` por episódio, geração em 2º plano
  via bridge, `watch` ao vivo, abort cooperativo (arquivo `ABORT`, para no próximo segmento) e
  Status/menu/app sempre alertando quando algo está consumindo créditos.
- **Bridge JSON** (`python3 -m audiofy.bridge`) como interface programática única.
- **App desktop Electron** (`electron/`): lista/busca, estimativa antes de gerar, banner de
  gasto ativo, progresso+custo ao vivo, abortar, ouvir episódio. Lógica 100% no Python.

**Piloto medido:** **US$ 0,624287, 13min01s, 2.155 palavras de fonte e 1.860 de roteiro**.
A estimativa da CLI e do app usa média ponderada e faixa do mesmo TTS e perfil; o piloto
é apenas fallback quando ainda não há histórico. Feedback do usuário: qualidade muito boa.

**Validação:** 17 testes no repositório principal (presenters, status/abort, sources) +
17 no akita-articles, todos verdes; CLI e bridge smoke-testados contra a fonte real
(771 itens); sintaxe do Electron verificada e binário instalado.

**Decisão de versionamento:** a pedido do usuário, `data/episodes/` inteiro (incluindo áudio)
passa a ser versionado; apenas o clone da fonte (`data/source/`) fica fora.

**Riscos que sobraram:** o custo de TTS por delta de conta mistura usos concorrentes da mesma
chave; o app Electron ainda não foi testado visualmente de ponta a ponta (a bridge que o
alimenta foi). Roadmap registrado no README: módulo de chat estilo Openia, modo NotebookLM
barato, planejamento editorial em lote, STT final.

---

## 2026-07-17 — Chaves nomeadas, saldo, perfis e seletor de modelos (padrões do Openia)

**O que mudou:** portadas as features de gestão do Openia que faltavam:

- **Keystore** (`keystore.py` + menu "Chaves & saldo"): chaves nomeadas com uma ativa,
  validação de formato (`sk-or-`), armazenamento em `.audiofy/keys.json` com `0600`,
  prioridade da env var/.env, máscara na exibição; checagem de chave e saldo/uso via
  `/credits` (`account_balance`, `check_api_key`).
- **Perfis** (`profiles.py` + menu "Perfis & modelos"): presets nomeados de modelos +
  apresentadores; embutidos `padrao`, `economico`, `narrador-unico`; customizados persistidos
  sem segredos; ativo trocável; `Settings` resolve env > perfil > padrão.
- **Seletor de modelos** (`catalog.py`): catálogo `/models` com cache de 24h em
  `.audiofy/models-cache.json`, navegação empresa → modelo com preço por milhão de tokens,
  filtro por modalidade (áudio para TTS).
- `.audiofy/` entrou no .gitignore; o antigo "Configurar chave" (que gravava no .env) foi
  substituído pelo cofre — o .env segue suportado como override.

**Sobre "assinatura":** no Openia, assinatura refere-se a rodar CLIs sob a assinatura do
provedor (ex.: Claude Code com plano Anthropic) em vez de chave de API. No Audiofy a geração é
via API do OpenRouter, onde esse conceito não se aplica diretamente; o equivalente barato/manual
é o modo NotebookLM, que segue no roadmap.

**Validação:** 35 testes verdes (17 novos de keystore/perfis); saldo checado ao vivo contra a
conta real (US$ 5,01 restantes / US$ 18,99 usados em 17/07/2026); menu smoke-testado.

**Risco que sobrou:** o parse do catálogo assume `pricing.prompt/completion` por token; se o
OpenRouter mudar o esquema de preços, o seletor mostra valores errados (a geração não é afetada).

---

## 2026-07-17 — Modo assinatura, exportação NotebookLM e pesquisa de modelos/custos

**O que mudou** (correção da interpretação de "assinatura" após feedback do usuário — a
intenção era usar a assinatura para as etapas de texto, com modelos fora do OpenRouter):

- **Provedor de texto por assinatura** (`providers/subscription.py`): as etapas de matriz,
  roteiro e auditoria podem rodar em CLI local sob assinatura — `claude-code`, `gemini-cli`
  ou `codex` — em modo não interativo (prompt via stdin, JSON validado na saída), custo
  US$ 0,00. Perfil embutido `assinatura` e env `AUDIOFY_TEXT_PROVIDER`. TTS permanece via API
  (assinaturas não expõem TTS programável). Máquina do usuário tem as três CLIs.
- **Exportação NotebookLM** (`export.py`, menu 14, CLI `notebooklm <id>`, bridge): gera
  `notebooklm/fonte.md` + `instrucoes.md` (passo a passo + foco de cobertura integral +
  atribuição) na pasta do episódio — caminho de custo totalmente zero, com aviso explícito
  de que Audio Overview é resumo sem auditoria.
- **Pesquisa de modelos e custos** (`docs/MODELOS-E-CUSTOS.md`): catálogo `speech` consultado
  ao vivo (12 modelos TTS). Destaques por episódio de 13 min: Gemini TTS ~US$ 0,39 (validado
  em pt-BR), Voxtral mini ~US$ 0,05, Kokoro ~US$ 0,002 (qualidade pt-BR a validar);
  combinações sugeridas de US$ 0,60 até US$ 0,00.

**Validação:** 42 testes verdes (7 novos); provedor de assinatura testado ao vivo com o
Claude Code real (JSON válido, custo zero); exportação NotebookLM executada contra o episódio
piloto; menu e status smoke-testados.

**Risco que sobrou:** os flags headless das CLIs (`claude -p`, `gemini` via stdin,
`codex exec -`) podem mudar entre versões; a falha é explícita (stderr no erro) e o fallback
é voltar o perfil para a API. TTS alternativos (Voxtral/Kokoro) ainda não foram ouvidos em
pt-BR — testar num artigo curto antes de adotar.

---

## 2026-07-17 — Chat de pesquisa, fonte genérica e app Electron com paridade total

**O que mudou** (pedido do usuário: o Electron deve ter todas as funções da CLI, ganhar um
chat de pesquisa além do Akita, e o Akita deixa de ser o foco):

- **Fonte genérica `custom`** (`sources/custom.py`, fonte padrão do menu): qualquer conteúdo
  vira episódio — texto colado ou URL (extrator de texto principal em HTML puro, sem
  dependências, priorizando `<article>/<main>` e descartando nav/script/rodapé). Itens em
  `data/inbox/*.md` com frontmatter. Atribuição genérica com aviso de direitos.
- **Chat de pesquisa** (`chat.py`, aba própria no app e opção 1 da CLI): sessões persistidas
  em `data/chat/`, histórico na janela de prompt, provedor = CLI de assinatura (no Claude Code
  com `--allowedTools WebSearch`, pesquisa web real a custo zero) ou API. Protocolo de ações
  em blocos ```acao (adicionar_url, buscar, gerar, exportar_notebooklm) que a interface
  executa com um clique — geração sempre confirma custo antes.
- **Bridge completa**: chat/chat-history/chat-clear, add-url/add-text (stdin), keys-*
  (list/add/activate/remove), balance, profiles-list/activate, settings-info; `main.js` do
  Electron passou a suportar stdin nas chamadas.
- **App Electron reconstruído em 4 abas** (Chat, Conteúdo, Episódios, Configurações) com
  paridade total com a CLI: seletor de fonte, adicionar URL/texto, estimativa, gerar, abortar,
  NotebookLM, episódios com estado/custo, chaves nomeadas com saldo, perfis e catálogo.
- **CLI reorganizada**: chat como opção 1, fonte ativa visível e trocável (padrão `custom`),
  adicionar conteúdo por URL/texto, 17 opções no total.

**Validação:** 57 testes verdes (12 novos: fonte custom e chat); extração de URL testada
contra página real do blog; chat testado ao vivo via claude-code (resposta correta, custo
zero); bridge smoke-testada em todos os comandos novos; sintaxe do Electron verificada.

**Risco que sobrou:** o extrator de HTML é heurístico — páginas muito dinâmicas (JS) ou fora
do padrão `<article>` podem render texto insuficiente (o erro instrui a colar o texto);
o protocolo de ações depende de o modelo emitir JSON válido no bloco ```acao (ações inválidas
são ignoradas silenciosamente, por design).

---

## 2026-07-17 — Paridade real do Electron, perfil Codex e interface Felixo

**O que mudou:** uma auditoria entre as 16 funções operacionais do menu e a interface revelou
que a entrega anterior ainda não expunha criação/edição de perfis, setup, regeneração forçada
e parte do status. A paridade foi completada sem duplicar regra de negócio:

- **Perfis completos no Electron:** criar, editar, ativar e remover customizados; provedor de
  texto OpenRouter/assinatura; seleção empresa → modelo com preço; 1..N apresentadores e
  validação central em `profiles.profile_from_payload`. Perfis embutidos agora incluem
  `assinatura-codex`, que usa o Codex CLI para texto e OpenRouter apenas para TTS.
- **Setup compartilhado** em `audiofy.setup`: diagnóstico sem efeitos colaterais, instalação
  explícita de dependências Python e criação de `.env`; CLI e Electron consomem a mesma rotina.
- **`--force` ponta a ponta:** CLI em segundo plano, bridge, subprocesso e pipeline preservam a
  escolha; o app explica que cobertura, roteiro e auditoria serão refeitos antes de confirmar.
- **Catálogo resiliente:** a consulta TTS usa a modalidade `speech`; sem chave/rede, as 30 vozes
  locais e os modelos atuais continuam disponíveis no editor, com aviso em vez de tela vazia.
- **Status e segurança de UI:** prontidão da fonte, origem da chave, setup obrigatório/opcional,
  feedback de sincronização e estados de loading. Uma faixa global mostra perfil, provedor/modelo
  de texto efetivo e TTS em todas as abas, deixando visíveis overrides por `AUDIOFY_*`. Conteúdo
  externo e nomes configuráveis não são mais interpolados via `innerHTML`.
- **Correção de perfil efetivo:** `Settings.profile_name` deixou de nascer preenchido como
  `padrao`; agora recebe o nome resolvido do `ProfileStore`. Antes, ativar `assinatura-codex`
  alterava corretamente o provedor, mas a interface continuava rotulando o perfil como `padrao`.
- **Modelo Codex observável:** o backend lê exclusivamente o campo global `model` de
  `~/.codex/config.toml` (ou `$CODEX_HOME/config.toml`) e a interface mostra o valor efetivo na
  faixa global e no diagnóstico. Tabelas de perfis Codex não são confundidas com o modelo global.
- **Frontend Felixo:** tokens zinc/roxo, cards, badges, foco visível, grid responsivo, estados de
  hover/disabled, contraste, scrollbar e `prefers-reduced-motion`, adaptados ao desktop Audiofy.
  Removido o `min-width: 720px` que quebrava a janela estreita; navegação, chat, listas e
  formulários têm breakpoints em 700/480 px, com mínimo nativo de 360 × 480 px.

**Validação:** testes unitários ampliados para bridge, setup, perfis e `--force`; bridge
smoke-testada nos catálogos e perfis; JavaScript validado por sintaxe e IDs do DOM; Electron
aberto no ambiente gráfico e inspecionado visualmente em Chat e Configurações nas larguras de
600 px e 380 px.

**Risco que sobrou:** modelos e preços dependem do esquema vivo do OpenRouter; o editor preserva
o valor atual quando o catálogo não responde, mas novos modelos só aparecem após nova consulta.

---

## 2026-07-17 — Auditoria integral do Felixo System Design

**O que mudou:** a entrega foi revisada contra o guia mínimo e os contratos completos de
frontend, backend, README e `start_app.py`, cobrindo desvios que não apareciam em uma validação
apenas visual ou sintática:

- **Porta de entrada conforme o padrão:** o menu numérico cru foi substituído por uma TUI
  navegável por setas com `questionary` + `rich`, cabeçalho de estado, descrições por ação,
  seleção de fontes/chaves/perfis/modelos e confirmações explícitas. As dependências foram
  declaradas em `requirements.txt`, diagnosticadas pelo setup e têm bootstrap mínimo.
- **Electron endurecido:** CSP, sandbox, bloqueio de navegação/janelas, allowlist e aridade dos
  comandos IPC, limites de entrada/saída, timeout/falha previsíveis e abertura de arquivos
  confinada ao diretório real do projeto (inclusive contra escape por symlink).
- **Dependência Electron segura:** a versão 33 apresentou vulnerabilidades de alta severidade no
  `npm audit`. A linha foi atualizada e fixada em 41.7.1, última correção compatível com Node 18+;
  o lockfile regenerado ficou com zero vulnerabilidades conhecidas.
- **Fronteiras de dados:** IDs de arquivo/sessão protegidos contra path traversal; títulos não
  injetam frontmatter; perfis têm limites; ações do chat seguem esquema conhecido. A importação
  aceita somente HTTP(S) público, revalida redirecionamentos, bloqueia rede privada/credenciais
  e limita a resposta a 5 MiB. `data/chat/` e `data/inbox/` foram ignorados para impedir commit
  acidental de conversas ou conteúdo pessoal; episódios permanecem versionáveis por decisão prévia.
- **Acessibilidade:** tabs com papéis ARIA, `aria-selected`, navegação por setas/Home/End,
  painéis associados, campos rotulados, histórico como log ao vivo e progresso semântico.
- **Contrato corrigido:** `chat-history` agora devolve as fontes esperadas pelo renderer, e
  `loadSources` também atualiza o registro local; antes, a inicialização podia falhar ao acessar
  `result.sources` inexistente. O seletor TTS da CLI passou a aceitar `speech`/`audio`, e Status
  exibe o modelo efetivo das CLIs de assinatura.

**Validação:** 88 testes Python e 3 testes Node verdes; instalação e `pip check` aprovados em venv
limpo; Ruff, `git diff --check`, `npm audit` zerado, sintaxe de todos os processos Electron e
smoke test real da TUI aprovados. O Electron 41 com sandbox/CSP foi reinspecionado visualmente em
600 px e 380 px.

**Risco que sobrou:** o bloqueio de URLs privadas impede importar páginas de intranet por design;
o caminho seguro é colar o texto. O catálogo remoto e os flags das CLIs continuam integrações
externas sujeitas a mudança, com erros controlados e valores atuais preservados quando possível.

---

## 2026-07-17 — Retomada automática e idempotente do TTS

**O que mudou:** uma geração real parou na fala 45/92 porque o provedor TTS devolveu um `400`
genérico depois de 44 WAVs válidos. A síntese agora classifica falhas retomáveis, repete somente a
fala afetada com backoff exponencial e jitter (limite configurável), mantém o abort responsivo e
mostra fala/tentativa no Status da CLI e do Electron. Segmentos são gravados por arquivo temporário
e rename atômico; `segments.json` registra hash de texto, modelo, voz, instruções, formato e taxa de
amostragem, evitando reutilizar áudio incompatível. Segmentos legados válidos são importados para o
manifesto, portanto episódios parciais anteriores continuam do primeiro arquivo ausente.

**Decisões:** erros permanentes, como autenticação inválida, falham imediatamente; falhas de rede,
respostas vazias e o `Provider returned 400` genérico observado no TTS entram na política limitada.
Uma nova execução preserva também o custo acumulado e registra `resume_count`, em vez de zerar o
status. O limite evita loop infinito e troca silenciosa de modelo/voz continua proibida.

**Validação:** 101 testes Python e 3 testes Node verdes. As regressões cobrem segmento já pronto +
falha + sucesso, esgotamento de tentativas sem apagar checkpoint, erro permanente sem retry,
classificação do `400`, backoff, manifesto e preservação de custo/status entre execuções. Ruff,
compilação Python, sintaxe Electron, `git diff --check` e `npm audit` (zero vulnerabilidades)
também foram aprovados.

**Risco que sobrou:** um erro permanente devolvido incorretamente pelo provedor como `Provider
returned 400` consumirá as tentativas configuradas antes de parar; chamadas rejeitadas não produzem
áudio e nenhum segmento existente é sobrescrito.

---

## 2026-07-17 — Feedback persistente para falhas rápidas no Electron

**O que mudou:** o botão de geração funcionava e o worker retomava o episódio, mas uma falha
permanente muito rápida podia ocorrer entre o retorno da bridge e o primeiro polling. O cartão
escondia a área de progresso assim que `state` deixava de ser `rodando`, dando a impressão de que o
clique não fizera nada. A bridge agora grava atomicamente o estado `iniciando` antes de lançar o
worker; o Electron desabilita e rotula o botão durante a solicitação e mantém estados `falhou` e
`abortado` visíveis com etapa, checkpoint, custo e ação recomendada.

**Decisões:** mensagens conhecidas do OpenRouter são traduzidas localmente sem renderizar URLs ou
identificadores devolvidos pelo provedor. Um limite mensal de chave orienta aumentar esse limite ou
trocar `OPENROUTER_API_KEY/.env`; autenticação e falta de créditos têm mensagens próprias. Erros não
reconhecidos continuam disponíveis de forma sanitizada. Falha ao criar o processo também passa para
o `status.json`, evitando estado `iniciando` preso.

**Validação:** 104 testes Python e 7 testes Node verdes. As regressões cobrem publicação antecipada
do início, preservação do checkpoint, abort durante a inicialização e falha ao lançar o worker.
Os testes Node cobrem tradução segura do limite mensal e os estados de inicialização/falha. Ruff,
compilação Python, sintaxe Electron, `git diff --check` e `npm audit` (zero vulnerabilidades)
também foram aprovados.

**Risco que sobrou:** mensagens de erro desconhecidas ainda dependem do texto devolvido pelo
provedor para oferecer uma orientação específica; o detalhe é sanitizado antes de chegar à tela.

---

## 2026-07-17 — Chave efetiva atualizada no Electron

**O que mudou:** o Electron aberto havia herdado uma `OPENROUTER_API_KEY` antiga do processo que
o iniciou. Alterar o `.env` e recarregar a interface atualizava apenas o renderer; as bridges Python
continuavam recebendo a credencial antiga do processo principal. A inicialização agora marca, sem
valores secretos, quais variáveis foram carregadas do `.env`. Antes de cada bridge, o Electron
remove somente essas cópias para que o backend releia o arquivo atual. Variáveis realmente
definidas no shell continuam intactas e com prioridade.

**Decisões:** o diagnóstico de chave passou do saldo geral da conta (`/credits`) para os metadados
da chave autenticada (`/key`), exibindo o rótulo mascarado, limite, restante e uso mensal. A tela de
configurações também diferencia `ambiente`, `.env` e a chave nomeada do cofre. Nenhum valor integral
de credencial entra no IPC, em logs ou na interface.

**Validação:** 109 testes Python e 10 testes Node verdes. As regressões cobrem procedência,
atualização do arquivo sem sobrescrever o shell, interpretação do limite da chave, remoção
seletiva e rejeição de nomes inválidos. Ruff, compilação, sintaxe Electron, `git diff --check`
e `npm audit` também passaram. A consulta real confirmou a chave mascarada esperada e seu saldo
próprio, sem iniciar geração nem consumir TTS.

**Risco que sobrou:** processos de geração já iniciados preservam deliberadamente a configuração
com que nasceram; trocar o `.env` afeta novas operações, não muta workers que estejam em execução.

---

## 2026-07-17 — Recuperação automática após troca de chave

**O que mudou:** um cartão vermelho ainda dizia que "a chave atingiu o limite" depois da troca,
embora representasse o erro persistido da execução anterior. A mensagem agora usa passado e deixa
explícito que aquela execução usou outra chave. Ao selecionar um conteúdo parado especificamente
por limite, o Electron consulta a chave efetiva; havendo limite disponível, inicia a retomada sem
regenerar os checkpoints. Se a chave continuar esgotada, revalida a cada minuto enquanto o item
permanecer aberto.

**Decisões:** a consulta de chave retorna indisponível quando `limit_remaining` é zero, mesmo que a
credencial seja tecnicamente válida. Isso impede um loop de retomadas rejeitadas. A automação é
restrita ao erro conhecido de limite e ao item selecionado; autenticação, falta de crédito global
ou falhas desconhecidas continuam exigindo intervenção para não repetir custos ou efeitos.

**Validação:** 110 testes Python e 11 testes Node verdes. Uma retomada real preservou as 66 falas
existentes e avançou com a chave atual, sem refazer cobertura, roteiro ou auditoria. As verificações
de lint, compilação, sintaxe Electron e integridade do diff também passaram.

**Risco que sobrou:** a recuperação automática depende de o conteúdo afetado permanecer selecionado
no Electron; episódios falhos não são retomados silenciosamente apenas por abrir o aplicativo.

---

## 2026-07-17 — Custos por geração e médias ponderadas

**O que mudou:** o custo do TTS deixou de usar o delta de `/credits`, que é global à conta e
misturava potencialmente nove chaves do mesmo workspace. Cada resposta de áudio agora preserva o
`X-Generation-Id`; o backend consulta `/generation`, soma `total_cost` e registra ID, valor e
precisão junto ao segmento. Metadado indisponível usa somente a tabela oficial do modelo como
fallback e marca o total como aproximado. Um `403` de limite também alterna automaticamente entre
a chave efetiva, a chave atual do `.env` e o cofre, registrando somente o rótulo da alternativa.

**Médias:** cada episódio concluído grava `metrics.json` com palavras da fonte e do roteiro,
duração real, custo, precisão, perfil e TTS. A estimativa usa totais ponderados de episódios do
mesmo modelo e perfil, e expõe valor central, mínimo/máximo observado, duração, palavras por
minuto e tamanho da amostra. Data da geração e origem do custo ficam preservadas. Os dois
episódios locais resultam em 149,71 palavras/minuto quando analisados em conjunto; o piloto é
fallback somente quando ainda não existe histórico do perfil.

**Decisões:** o Fable, gerado integralmente em 16/07, foi reconciliado em US$ 0,624287 pelo
total diário confirmado da chave. O episódio de 17/07 trocou de chave na fala 67: US$ 0,854023
foram registrados antes da troca e US$ 0,337249 na retomada, total aproximado de US$ 1,191272.
A montagem passou a escrever `episode.tmp.mp3` e fazer rename atômico; a bridge só
expõe o player quando o estado é `concluido`, impedindo a duração parcial de 15:17 observada.

**Validação:** 122 testes Python e 11 testes Node verdes. As regressões cobrem média ponderada,
faixa, fallback oficial, captura de ID/custo, isolamento da conta global, precisão persistida,
montagem atômica e bloqueio do player parcial. Ruff, compilação, sintaxe Electron,
`git diff --check` e `npm audit` também passaram.

**Risco que sobrou:** o custo do Fable foi confirmado pelo total diário da chave, mas o episódio
que trocou de chave permanece aproximado. Cada perfil ainda tem uma única amostra; a faixa ganhará
confiabilidade conforme novas gerações, agora contabilizadas individualmente, forem concluídas.

---

## 2026-07-17 — Instalação automática de git e ffmpeg no setup

**O que mudou:** uma tentativa de instalação no macOS falhou em dois pontos que o botão
"Instalar/corrigir" não cobria: o `ffmpeg` (que não é pacote Python e nunca instalaria via pip)
e o `akita-articles` (bloqueado pelo `externally-managed-environment` do Python gerenciado,
PEP 668). O `apply_setup` agora também instala ferramentas de sistema ausentes — `git` antes do
`akita-articles`, pois o pip depende dele para `git+https://` — usando o primeiro gerenciador
disponível: `brew`, `winget`, `apt-get`, `dnf` ou `pacman`. No pip, quando a instalação falha
com `externally-managed-environment`, há uma nova tentativa automática com
`--user --break-system-packages`.

**Decisões:** no macOS sem Homebrew a ação falha com orientação explícita de instalá-lo — não é
seguro automatizar a instalação do próprio brew. No Linux os gerenciadores usam `sudo -n` (sem
prompt): se a senha não estiver em cache a ação falha com mensagem, em vez de travar o app
esperando entrada invisível. No Windows via winget, o PATH só atualiza após reiniciar o app, e o
detalhe da ação avisa. As dicas de `git`/`ffmpeg` no diagnóstico mudaram para "pode ser instalado
automaticamente" e o README passou a listar como pré-requisitos manuais apenas Python 3.10+,
Node.js (desktop) e o Homebrew no macOS.

**Validação:** 126 testes Python (2 novos: instalação de git/ffmpeg ausentes na ordem correta e
retry do pip com `--break-system-packages`) e 13 verificações Node verdes; Ruff, compilação
Python, sintaxe Electron, `git diff --check` e `npm audit` (zero vulnerabilidades) aprovados.
A instalação real no macOS ainda não foi reexecutada com as mudanças.

**Risco que sobrou:** a instalação de sistema depende de gerenciador presente e de permissão
(sudo no Linux); nesses casos a ação reporta a falha com orientação, mas não resolve sozinha.
O `--break-system-packages` instala no escopo do usuário fora de venv — aceito por ser o mesmo
escopo que o `--user` já usava, apenas destravando o bloqueio do PEP 668.

---

## 2026-07-17 — App desktop abre no Windows

**O que mudou:** no Windows, abrir o app desktop pelo menu não fazia nada. Duas causas no
lançamento: o `Popen(["npm", "start"])` falhava porque o npm do Windows é `npm.cmd` e o
`CreateProcess` não resolve o nome sem extensão (não consulta o `PATHEXT`); e, mesmo que a
janela abrisse, o processo principal chamava o backend como `python3`, que no Windows não
existe no PATH — ou é o atalho da Microsoft Store, que não executa nada. O `do_desktop` agora
usa o caminho completo retornado por `shutil.which("npm")` (instalação e lançamento), desanexa
o processo com `creationflags` no Windows (mantendo `start_new_session` no POSIX) e exporta
`AUDIOFY_PYTHON` com o interpretador que já roda o menu; o `main.js` usa essa variável e,
sem ela, cai para `python` no Windows e `python3` nos demais.

**Decisões:** o interpretador é propagado pela porta de entrada em vez de o Electron adivinhar,
garantindo que o backend rode com o mesmo Python (e venv) do menu; `AUDIOFY_PYTHON` definida
pelo usuário continua tendo prioridade. Quem roda `npm start` direto no Windows, sem passar
pelo menu, usa o fallback `python`.

**Validação:** 130 testes Python (4 novos: caminho completo do npm, desanexação por plataforma
e exportação do interpretador) e 13 verificações Node verdes; Ruff, compilação, sintaxe
Electron, `git diff --check` e `npm audit` (zero vulnerabilidades) aprovados. Falta confirmar
a abertura real numa máquina Windows.

**Risco que sobrou:** se o npm não estiver no PATH do Windows (Node instalado sem reiniciar o
terminal), o menu reporta "npm não encontrado" — a correção não cobre PATH desatualizado.

---

## 2026-07-17 — Lançamento do desktop sem depender do npm.cmd

**O que mudou:** mesmo com o caminho completo do npm, o Windows respondeu
"[WinError 2] O sistema não pode encontrar o arquivo": scripts `.cmd` só executam de forma
confiável através do `cmd.exe`, e o atalho implícito falha em caminhos com espaços ou acentos
(caso da pasta deste projeto). O lançamento deixou de depender do `npm.cmd`: no Windows, o
`npm install` roda pelo `node.exe` chamando o `npm-cli.js` (executável real, sem shell), e a
abertura do app usa o binário do Electron apontado por `node_modules/electron/path.txt`,
com `npm start` apenas como fallback quando o binário não é encontrado. A instalação também
ganhou tratamento de `OSError` com mensagem orientada em vez de erro cru.

**Decisões:** evitar o shell é mais robusto do que envolver o `cmd.exe` explicitamente, cuja
citação de argumentos com aspas é notoriamente frágil; o fallback preserva o comportamento
anterior em plataformas onde o npm é um executável normal.

**Validação:** 136 testes Python (6 novos: resolução do npm via node no Windows, preferência
pelo binário real do Electron, fallback e leitura do `path.txt`) e 13 verificações Node verdes;
Ruff, compilação, `git diff --check` e `npm audit` (zero vulnerabilidades) aprovados. Smoke
local confirmou a resolução do npm real; a abertura no Windows segue pendente de confirmação.

**Risco que sobrou:** instalações de Node que não colocam o `npm-cli.js` ao lado do `node.exe`
caem no fallback do `npm.cmd`, que pode repetir o erro original; nesse caso a mensagem agora
identifica o comando que falhou.

---

## 2026-07-17 — CLIs de assinatura funcionam no Windows

**O que mudou:** enviar mensagem no chat com o provedor de assinatura (Claude Code) falhava no
Windows com "o sistema não pode encontrar o arquivo": as CLIs instaladas via npm (`claude`,
`gemini`) são scripts `.cmd`, que o `subprocess` não executa diretamente — apenas o `cmd.exe`
os resolve pelo PATH/PATHEXT. A execução foi centralizada em `subscription.run_cli`, que no
Windows monta a linha de comando com `list2cmdline` e roda pelo shell, e nas demais plataformas
mantém a chamada direta sem shell. O `chat.py` deixou de duplicar a montagem do subprocess e
reutiliza o runner e o contrato declarativo da CLI (o caso Claude Code só acrescenta
`--allowedTools WebSearch`). `OSError` na execução agora vira erro amigável identificando a CLI,
tanto no pipeline quanto no chat.

**Decisões:** o shell só entra no Windows e a linha é montada por `list2cmdline` a partir do
contrato declarativo — nenhum conteúdo do usuário entra na linha de comando (o prompt segue por
stdin), preservando a fronteira de segurança.

**Validação:** 139 testes Python (3 novos: citação e shell no Windows, ausência de shell no
POSIX e tradução de OSError) e 13 verificações Node verdes; Ruff, compilação, `git diff --check`
e `npm audit` aprovados. Smoke real no Linux: `chat_json` com o Claude Code respondeu JSON
válido a custo zero. Confirmação no Windows pendente.

**Risco que sobrou:** no Windows o `cmd.exe` expande `%VAR%` mesmo entre aspas; os argumentos
vêm do contrato fixo (sem `%`), então o risco prático é nulo hoje, mas argumentos novos com
`%` exigiriam atenção.

---

## 2026-07-17 — Chat com permissão total nas CLIs de assinatura

**O que mudou:** o chat travava com o provedor de assinatura porque, em modo headless, a CLI
não tem como pedir confirmação de permissão ao usar ferramentas (pesquisa web, leitura de
páginas) — ficava presa ou falhava. A pedido do usuário, o chat passa a conceder permissão
total por padrão: o contrato declarativo `SubscriptionCli` ganhou `chat_args`
(`--dangerously-skip-permissions` no Claude Code, `--yolo` no Gemini CLI; o Codex `exec` já é
não interativo) e o `chat.py` usa `chat_command`, eliminando o caso especial do Claude que
existia ali (o `--allowedTools WebSearch` ficou redundante e saiu).

**Decisões:** a permissão total vale somente para o chat de pesquisa — as etapas do pipeline
(matriz, roteiro, auditoria) continuam com o comando básico, pois são texto puro e não usam
ferramentas. As ações propostas pelo chat (gerar episódio, adicionar URL) continuam sendo
executadas pela interface com confirmação explícita; a permissão ampla é da CLI, não do app.

**Validação:** 140 testes Python verdes (novo teste garante os flags no chat e a ausência deles
no pipeline); Ruff, compilação e `git diff --check` aprovados. Smoke real no Linux: o comando de
chat do Claude Code com o flag respondeu normalmente (código 0).

**Risco que sobrou:** com permissão total, a CLI do chat pode executar ferramentas locais sem
confirmação caso o modelo decida — aceito pelo usuário como padrão do chat; reverter é remover
os `chat_args` do contrato.

---

## 2026-07-17 — Chat executa as ações propostas automaticamente

**O que mudou:** o chat pedia aprovação a cada ação — era preciso clicar no botão de cada
proposta e ainda confirmar a geração num `confirm()`. A pedido do usuário, o chat passou a
executar tudo sozinho: `addChatMessage` retorna as ações pendentes e `sendChat` roda cada uma
em ordem, aguardando a anterior, assim que a resposta do assistente chega. O `confirm()` antes
de gerar episódio foi removido; no lugar, o chat anuncia "Gerando … — consome créditos" com a
estimativa visível. Os botões de ação continuam na conversa para reexecução manual, e
`runAction` passou a aceitar chamada sem botão (execução automática).

**Decisões:** a execução é serial (uma ação por vez, com `await`) para não disparar várias
gerações concorrentes nem competir por recarregamento de lista. A remoção da confirmação de
custo é segura porque o custo estimado aparece no chat e o banner global de gasto ativo
continua alertando em todas as abas enquanto qualquer geração roda. Ações destrutivas não
existem no protocolo do chat (adicionar_url, buscar, gerar, exportar_notebooklm) — a mais cara
é gerar, coberta pelo aviso e pelo banner.

**Validação:** 140 testes Python e 13 verificações Node verdes; sintaxe do renderer conferida
pelo `npm run check`, `git diff --check` e `npm audit` (zero vulnerabilidades) aprovados. Falta
confirmar visualmente o fluxo automático no app.

**Risco que sobrou:** o chat agora gera episódios sem confirmação explícita; se o modelo propuser
uma geração indevida, ela inicia (e consome créditos) até ser abortada pela aba Episódios. O
aviso no chat e o banner global mantêm o gasto visível, mas a barreira de clique deixou de existir.

---

## 2026-07-17 — Chat pesquisa e entrega o conteúdo sozinho

**O que mudou:** o chat via assinatura ficava perguntando/confirmando em vez de agir — o
protocolo só permitia *propor* ações (buscar, adicionar_url) para a interface executar depois,
então, pedido um tema, o Claude devolvia perguntas esclarecedoras em vez do resultado. Agora o
chat pesquisa e entrega o conteúdo pronto na mesma resposta:

- **Nova ação `adicionar_texto {titulo, texto}`**: o modelo escreve ele mesmo um texto próprio,
  coeso e substancial sobre o tema (sintetizado, não copiado) e o grava direto na fonte `custom`
  via a bridge `add-text` que já existia. O validador isenta o campo `texto` do limite de 4096
  caracteres dos identificadores curtos; textos colados não recebem teto de caracteres.
- **System prompt reescrito** com a diretriz "AJA, NÃO PERGUNTE": nada de pedir confirmação ou
  devolver perguntas, a menos que o pedido seja impossível de interpretar; as ações rodam
  automaticamente, então o modelo não deve pedir permissão para incluí-las.
- **CLI alinhada ao app**: `do_chat` deixou de perguntar "Executar uma ação proposta?" e passou
  a rodar cada ação automaticamente; `_run_chat_action` ganhou o caso `adicionar_texto`.

**Decisões:** o texto é redigido pelo próprio modelo (síntese autoral) em vez de copiar páginas,
o que evita despejar HTML bruto e reduz risco de direitos; a atribuição genérica da fonte custom
continua avisando para verificar direitos antes de publicar. Complementa a permissão total das
CLIs ([subscription chat_args]) e a execução automática de ações no renderer.

**Validação:** 142 testes Python (2 novos: corpo longo aceito e título obrigatório) e 13
verificações Node verdes; Ruff, compilação, sintaxe Electron, `git diff --check` e `npm audit`
(zero) aprovados. Smoke real no Linux via Claude Code: pedido "pesquise o MCP e adicione",
o chat retornou a ação `adicionar_texto` com um artigo de ~2,3 mil caracteres, salvo na inbox
sem qualquer pergunta de confirmação.

**Risco que sobrou:** o conteúdo é redigido pela IA a partir de pesquisa — pode conter
imprecisões; a revisão humana antes de publicar segue sendo exigência do projeto. Sem a etapa
de confirmação, um tema mal interpretado gera um conteúdo que precisa ser removido à mão.

---

## 2026-07-17 — Execução de processos portátil: fim do travamento silencioso do TTS no Windows

**O que mudou:** em outra máquina Windows a geração travava na fase de áudio. A causa raiz era
o lançamento do worker de segundo plano com `start_new_session=True` — argumento exclusivo do
POSIX. No Windows ele impede a desanexação correta e a geração fica presa em `rodando` sem nunca
progredir nem falhar visivelmente. Corrigido de forma sistêmica, com TDD:

- **Novo módulo `runtime/process.py`** centraliza as três armadilhas de subprocesso que
  travavam ou falhavam em silêncio: `detached_flags()` (creationflags no Windows,
  start_new_session no POSIX), `resolve_tool()` (caminho absoluto de ffmpeg/ffprobe ou erro
  claro em vez de FileNotFoundError cru), `run_tool()` (sempre com `timeout`, para nenhum
  subprocesso poder pendurar a geração) e `launch_detached()` (worker desanexado portátil).
- **Worker de geração** (`bridge._cmd_generate`) passou a usar `launch_detached` — a correção
  direta do travamento.
- **Montagem e duração** (`pipeline._assemble`, `_media_duration_seconds`) usam `run_tool` com
  timeout (ffmpeg 30 min, ffprobe 2 min) e ferramenta resolvida; a lista de concatenação
  normaliza o caminho para `/` (o ffmpeg trata `\` como escape) e escapa aspas; adicionados
  guardas para lista de segmentos vazia e saída não numérica do ffprobe.

**Por que não travava antes no Linux:** `start_new_session` é válido no POSIX, então o bug só
se manifestava no Windows. `generate_episode` já marcava `falhou` em exceção, mas a montagem
sem timeout e o ffmpeg pelo nome cru continuavam sendo pontos de trava potencial.

**Validação:** 159 testes Python (11 novos: flags por plataforma, resolução/timeout de
ferramenta, desanexação do worker portátil, normalização do concat, guardas de duração e
"falha nunca silenciosa" na montagem) e 13 Node verdes; Ruff, compilação, `git diff --check` e
`npm audit` aprovados. Smoke real no Linux: dois WAVs concatenados em MP3 de 2s via o novo
`run_tool`, com duração lida por ffprobe e por `wave` — o caminho POSIX segue intacto.

**Risco que sobrou:** se o worker desanexado morrer por erro de importação antes de entrar no
`generate_episode` (que marca `falhou`), o status pode ficar em `rodando`; o `generation.log`
por episódio registra o traceback. A confirmação do fluxo completo no Windows real segue
pendente, mas a causa estrutural do travamento foi removida.

---

## 2026-07-17 — Vigia de worker: geração presa em "iniciando" nunca mais bloqueia

**O que mudou:** no Windows a geração parava em "Iniciando a retomada" e não saía dali — e
clicar em Gerar de novo (mesmo após apagar a pasta) respondia "geração já em andamento". A
cadeia do problema: o worker desanexado morria logo ao subir sem tocar o `status.json`; o
status ficava `rodando/iniciando` para sempre; e o `generate` recusava novas execuções por
causa desse estado órfão. Três correções, com TDD:

- **Vigia de PID** (`GenerationTracker.reconcile` + `process.pid_alive`): ao consultar o
  status, um `rodando` cujo PID não existe mais vira `falhou` com orientação para o
  `generation.log`; um `iniciando` sem PID há mais de 90s idem. O `pid_alive` usa a API do
  kernel no Windows (`os.kill(pid, 0)` lá TERMINA o processo — nunca usar) e sinal 0 no POSIX.
  O `_cmd_generate` também usa `reconcile`, então o estado órfão deixa de bloquear regeneração.
- **UTF-8 forçado no worker** (`PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8`): no Windows o worker
  herdava cp1252 e o primeiro print com emoji do pipeline podia derrubá-lo — causa provável da
  morte silenciosa observada.
- **Guarda no `run-generation`**: falha antes do pipeline (fonte, configuração) agora marca o
  status como `falhou` em vez de morrer só no log.
- **Texto honesto**: "Iniciando a retomada" só aparece quando há retomada de fato
  (`resume_count > 0`); geração nova diz "Iniciando a geração".

**Validação:** 171 testes Python (12 novos: pid_alive vivo/morto/inválido, reconcile em todos
os estados, UTF-8 do worker, órfão não bloqueia regeneração, falha fora do pipeline) e 14 Node
verdes; Ruff, compilação, `git diff --check` e `npm audit` aprovados. Smoke real: processo
morto de verdade reconciliado para `falhou` com checkpoint preservado.

**Risco que sobrou:** reutilização de PID pelo sistema pode, em tese, manter um órfão como
"rodando" se outro processo nascer com o mesmo PID; a janela é pequena e o custo é apenas
esperar o usuário abortar. A causa exata da morte do worker naquele Windows será confirmada
pelo generation.log agora que o erro fica visível.

---

## 2026-07-18 — Régua de qualidade reproduzível para Python e Electron

**O que mudou:** o repositório foi padronizado de ponta a ponta contra o Felixo System Design,
sem alterar contratos funcionais do pipeline:

- **Configuração central:** `pyproject.toml` define Ruff, formatter e cobertura mínima de 70%;
  `.editorconfig` e `.gitattributes` estabilizam encoding, indentação e fins de linha.
- **JavaScript verificável:** Electron ganhou ESLint 9 (linha compatível com Node 18), integrado
  ao `npm run check`; código Python foi normalizado pelo Ruff formatter e passou a usar um
  conjunto explícito de regras de bugs, imports e modernização segura.
- **Dependências reproduzíveis:** pacotes Python diretos ficaram fixados, `akita-articles` passou
  a apontar para um SHA imutável, ferramentas de desenvolvimento foram separadas em
  `requirements-dev.txt` e o lockfile npm foi regenerado. O setup instala pelo mesmo arquivo
  fixado, coberto por regressão.
- **Automação única:** `scripts/check_quality.py` executa lint, formato, testes+cobertura,
  Electron, JSON, links Markdown, whitespace e auditorias; `--quick` pula apenas rede. A CI
  repete Python 3.10/3.12, Node 18 e auditorias, com Actions presas por SHA. Dependabot cobre
  pip, npm e GitHub Actions.
- **Governança:** adicionados `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, template de PR e
  `docs/QUALIDADE.md`; README e o resumo vivo deste arquivo foram alinhados ao estado real.

**Decisões:** cobertura inicial foi fixada em 70% por refletir a base real sem mascarar módulos
de UI/integração; aumentos futuros devem vir com testes de comportamento. ESLint 10 não foi usado
porque exige Node 20.19+, enquanto o produto ainda declara Node 18. O utilitário de qualidade é
interno, sem usuário final, e por isso é a exceção documentada ao menu `start_app.py`.

**Validação:** instalação do zero em venv temporário; 177 testes Python e 14 testes Node verdes;
cobertura agregada de 70%; Ruff lint/format, ESLint, `node --check`, compilação Python, JSON,
links internos, `git diff --check`, `pip-audit` e `npm audit` aprovados. Zero vulnerabilidades
conhecidas nas árvores auditáveis e lockfile npm reproduzível. A integração ao vivo também
validou autenticação, saldo e catálogo TTS (12 modelos retornados); a chave efetiva estava válida,
mas com limite mensal esgotado, então nenhuma chamada paga de texto/voz foi disparada.

**Risco que sobrou:** o `pip-audit` não possui registro PyPI para `akita-articles` e o marca como
não auditável; o risco foi reduzido prendendo a dependência a um commit e validando sua instalação
limpa. A compatibilidade Python 3.10 fica coberta pela nova matriz de CI quando ela rodar no GitHub;
a validação local desta mudança ocorreu em Python 3.12 e Node 25, além do alvo Node 18 configurado.

---

## 2026-07-18 — Conformidade explícita com os guias do padrão de qualidade

**O que mudou:** depois da régua automatizada, os guias de backend, frontend, README e
`start_app.py` do Felixo System Design foram tratados como requisitos normativos e auditados um
a um. A porta de entrada agora expõe explicitamente **Iniciar / Rodar**, **Configurar**,
**Instalar / Setup**, **Status** e **Sair**; paginação, chat e texto multilinha deixaram de usar
`input()` cru. O Status passou a consultar virtualenv, `.env`, ferramentas e dependências reais.
O Setup diagnostica Node/npm e instala o Electron com `npm ci`, pelo lockfile, quando disponível.

No frontend, as quatro abas viraram painéis ARIA dentro de um único landmark `<main>`; o rótulo
dos apresentadores ganhou associação semântica e todas as limpezas do renderer usam
`replaceChildren()`, eliminando `innerHTML`. Testes estáticos protegem landmark, painéis, labels,
foco visível e `prefers-reduced-motion`. O README foi reordenado segundo o guia e ganhou estrutura
comentada, ferramentas disponíveis, exemplos de entrada/saída, guia para iniciantes, objetivo e
governança na sequência exigida. `docs/QUALIDADE.md` registra a correspondência entre guias e
controles.

**Validação:** ambiente virtual criado do zero; 184 testes Python e 17 testes Node verdes;
cobertura agregada de 70%; Ruff lint/format, ESLint, sintaxe Node, JSON, links internos,
`git diff --check`, `pip-audit` e `npm audit` aprovados. O desktop foi aberto sem chamada paga e
inspecionado visualmente em 1200 px, 600 px e 380 px; navegação, cartões, configuração ativa e
campo do chat permaneceram íntegros. A chave já registrada havia sido validada na rodada anterior,
mas estava com o limite mensal esgotado, então nenhuma geração paga foi feita.

**Risco que sobrou:** o `akita-articles` continua fora do banco do PyPI Audit, mitigado pelo SHA
imutável e pela instalação limpa. A cobertura está exatamente no piso inicial de 70% e deve subir
gradualmente. A inspeção visual desta rodada foi no Linux; Windows e macOS seguem cobertos por
testes de processo/caminhos e pela CI, mas ainda merecem smoke visual nativo antes de uma release.

---

## 2026-07-18 — Gerenciamento completo e verificável de chaves

**O que mudou:** Configurações e a TUI passaram a mostrar o total de chaves cadastradas, seus
nomes mascarados e a origem efetivamente usada. Cada chave nomeada pode ser registrada, escolhida,
trocada, verificada individualmente contra `/key` e removida. A `OPENROUTER_API_KEY` do `.env` ou
ambiente aparece como uma origem protegida, também verificável e selecionável.

**Decisão de precedência:** configurações antigas preservam o comportamento anterior — ambiente
primeiro. Quando a pessoa clica em **usar** para uma chave nomeada, essa decisão fica persistida no
cofre e vence o ambiente até que outra chave ou a origem `.env`/ambiente seja selecionada. Isso
torna o botão de troca efetivo sem copiar segredo para outro arquivo ou devolvê-lo ao renderer.

**Segurança e contratos:** a bridge ganhou comandos separados para listar metadados, selecionar e
verificar; somente nome, máscara, disponibilidade e resumo de limite saem do backend. O valor
integral permanece no cofre ou ambiente. Arquivos antigos do cofre são migrados em memória com
fallback seguro e continuam compatíveis.

**Validação:** testes cobrem precedência, retorno ao ambiente, persistência, chave inexistente,
verificação de uma chave específica sem vazamento, allowlist IPC e presença das ações na interface.
A régua completa passou em ambiente virtual criado do zero: 195 testes Python, 18 testes Node,
71% de cobertura, lint/formatação, JSON, links, whitespace, `pip-audit` e `npm audit` verdes. O
Electron foi inspecionado manualmente em 600 px e 380 px; um ajuste de linhas `max-content`
impediu a sobreposição dos painéis no modo compacto. O smoke real consultou `/key` usando a
origem de ambiente já presente: a autenticação foi aceita e o limite esgotado foi informado sem
gerar conteúdo, consumir créditos ou expor o segredo. Não havia chave nomeada cadastrada no cofre.

**Risco que sobrou:** verificar uma chave faz uma consulta de rede ao OpenRouter e pode falhar por
indisponibilidade externa. A operação não gera conteúdo nem consome créditos, e a interface mantém
a mensagem de erro restrita ao resumo seguro retornado pelo adaptador.

---

## 2026-07-18 — Leitura fiel e longa com direção prosódica

**Problema:** o perfil `narrador-unico` continuava usando matriz, roteiro e auditoria; portanto
adaptava a obra em vez de apenas lê-la. Enviar um livro inteiro a uma chamada também criaria um
limite de contexto e aumentaria a deriva de voz em saídas longas.

**Decisão:** `verbatim` é um formato de geração, não um perfil. A pessoa escolhe somente uma das
vozes Gemini; modelos, chave e provedor de planejamento continuam na configuração ativa. O texto
é persistido sem normalizar suas bordas, segmentado localmente em até 2.400 caracteres e a
concatenação é verificada caractere por caractere contra a entrada.
O modelo de texto recebe lotes de até 18.000 caracteres e pode devolver apenas direção vocal. O
backend ignora qualquer texto reescrito e usa fallback local para direções ausentes.

**Retomada e segurança:** `prosody.json` guarda plano incremental por hash; o manifesto de áudio
já vincula texto, direção, voz e modelo. Trocar formato ou voz reinicia custo/cache incompatível.
Livros não dependem de uma janela total e textos colados não recebem teto de caracteres do
aplicativo: são persistidos e segmentados antes da IA. Downloads por URL continuam limitados a
5 MiB. Direitos autorais da obra permanecem responsabilidade de quem a importa.

**Interface:** Electron ganhou formato + narrador no cartão do item e a TUI ganhou **Leitura
fiel**, recomendando segundo plano. A inspeção encontrou sobreposição antiga dos painéis da aba
Conteúdo em largura compacta; a grade agora combina lista rolável e detalhe em fluxo normal.

**Validação:** `scripts/check_quality.py` aprovou lint e formatação Ruff, 207 testes Python
com 72% de cobertura, 20 testes Electron, auditorias de dependências Python/Node, whitespace,
JSON e links internos. A aba Conteúdo foi inspecionada nos modos adaptação e leitura fiel em
600 px e 380 px. A chave disponível estava autenticada, mas com limite mensal esgotado; por isso
nenhuma chamada paga de planejamento ou voz foi disparada.

**Risco que sobrou:** modelos TTS em preview podem variar a voz ou interpretar imperfeitamente a
direção. Segmentos curtos reduzem, mas não eliminam, essa limitação do provedor. Uma auditoria
pós-áudio por STT continua futura; antes de publicar uma obra longa, ainda é preciso ouvi-la.

---

## 2026-07-18 — Abort ativo durante chamadas bloqueantes

**Problema reproduzido:** o botão criava corretamente o arquivo `ABORT`, mas o worker só o lia
entre etapas/segmentos. Em uma geração real, o pedido permaneceu pendente durante uma chamada TTS
com timeout de 300 segundos; a execução levou cerca de 145 segundos para alcançar o checkpoint e
parar. Nesse intervalo, a chamada em voo foi concluída e contabilizada.

**Decisão:** a bridge e a TUI agora pedem o marcador cooperativo e também encerram ativamente a
árvore do PID registrado. No POSIX, o worker desanexado possui grupo próprio e recebe
`SIGTERM`, seguido de `SIGKILL` apenas se necessário; no Windows, `taskkill /T /F` encerra worker
e filhos. O próprio processo do comando nunca pode ser alvo. Se PID ou permissão estiverem
indisponíveis, ou se a linha de comando não comprovar que o PID é o worker do mesmo episódio, o
marcador continua aguardando o primeiro checkpoint e a interface mostra esse estado sem afirmar
falsamente que terminou.

**Auditoria de custo:** ao interromper uma chamada ativa, `cost_exact` passa a falso. Fechar a
conexão impede chamadas seguintes, mas não garante que o provedor cancele uma requisição já
recebida ou deixe de cobrá-la. Segmentos e manifestos concluídos permanecem retomáveis.

**Validação:** `scripts/check_quality.py` aprovou lint/formatação, 216 testes Python com 72% de
cobertura, 22 testes Electron, auditorias de dependências Python/Node, whitespace, JSON e links.
A interface permaneceu íntegra em 600 px e 380 px. Um smoke local com worker desanexado e
bloqueado por 60 segundos foi abortado em 0,064 segundo, terminando em `abortado` sem esperar o
checkpoint.

**Risco que sobrou:** a identidade é conferida imediatamente antes do sinal, mas ainda existe uma
janela de corrida muito curta entre essa leitura e o encerramento. O processo atual/grupo do
comando são explicitamente protegidos. Uma chamada remota já aceita pode gerar cobrança que o
processo encerrado não consegue consultar depois.

---

## 2026-07-18 — Log vivo e saúde do worker no Electron

**Problema observado:** o cartão mostrava apenas o último checkpoint concluído. Durante uma
chamada TTS longa, `3/12` podia significar tanto “processando o quarto trecho” quanto “travou”.
Na execução real investigada, o status ainda marcava quatro concluídos enquanto
`generation.log` já registrava o início do quinto e o PID permanecia vivo; depois a geração
continuou avançando até o provedor responder `HTTP 402` por créditos insuficientes, após oito
trechos concluídos.

**Decisão:** a bridge ganhou `generation-log <item-id>`, que lê somente os 64 KiB finais e devolve
no máximo 160 linhas, mtime e saúde do PID. Padrões de chave OpenRouter/Google, header Bearer e
atribuição de `OPENROUTER_API_KEY` são mascarados antes do IPC. Novos workers usam
`PYTHONUNBUFFERED=1`, de modo que cada mensagem chegue ao arquivo imediatamente.

**Interface:** o detalhe do conteúdo ganhou um painel aberto por padrão com cauda rolável,
indicador **worker ativo**, idade da última saída e aviso quando a cauda foi truncada. A consulta
acompanha o polling de dois segundos já usado pelo status; `aria-live` fica apenas no resumo de
saúde para não reler todo o log a cada atualização.

**Diagnóstico de chave:** as telas do OpenRouter mostravam saldo positivo na conta e na chave
nomeada, embora a resposta fosse `402`. O log real esclareceu a sequência: a chave do ambiente
atingiu seu limite, o fallback tentou a chave nomeada e foi ela que recebeu o `402`. Segundo o
contrato do provedor, `402` significa insuficiência na conta ou na chave, mas a resposta não informa
qual das duas; a interface não deve inventar uma causa mais específica.
O status passa a persistir somente o rótulo da chave em tentativa e o atualiza antes de cada
fallback. Faixa global, banner e log o exibem, e o erro orienta verificar saldo da conta e limite
da chave. O diagnóstico não troca a configuração e a falha `402` não é retomada automaticamente.

**Validação:** `scripts/check_quality.py` aprovou lint/formatação, 219 testes Python com 72% de
cobertura, 24 testes Electron, auditorias de dependências Python/Node, whitespace, JSON e links.
O painel, o rótulo da chave efetiva e a mensagem de falha foram inspecionados em 600 px e 380 px
sobre os artefatos da geração real, sem iniciar chamadas adicionais.

**Risco que sobrou:** estar vivo não prova que um provedor remoto responderá; por isso o painel
combina saúde do processo com idade da última linha. O abort ativo continua sendo a saída para
uma chamada que permaneça tempo demais sem progresso.

---

## 2026-07-19 — Estimativas recalibradas por formato

**Problema:** os quatro episódios concluídos tinham `metrics.json` coerentes com a duração real,
mas a interface filtrava a amostra pelo perfil ativo. Como cada piloto usou um perfil diferente,
o cálculo normalmente enxergava um único episódio ou voltava ao fallback, e a troca entre podcast
e leitura fiel não recalculava a confirmação.

**Decisão:** o formato passa a ser a fronteira empírica principal. A estimativa agrega todos os
perfis com o mesmo TTS e formato, usando totais ponderados, mas nunca mistura adaptação e leitura
fiel. A bridge entrega os dois cálculos e o Electron troca valor, faixa, duração e amostra ao mudar
o seletor, inclusive no diálogo que antecede o gasto.

**Validação:** 36 testes Python focados e 24 testes Electron passaram. Nos dados reais, a
adaptação passou a usar três episódios medidos; a leitura fiel usa o piloto compatível existente.
Nenhuma chamada de rede ou geração paga foi feita.

---

## 2026-07-19 — Auditoria objetiva e revisão individual dos chunks

**Problema reproduzido:** a escuta da leitura fiel indicou trechos de silêncio, mas o MP3 final não
permitia localizar rapidamente a fala de origem. A medição dos 12 WAVs encontrou 18,765 segundos
contínuos no fim de um chunk e 6,467 segundos em outro, confirmando que não era apenas impressão.

**Decisão:** entre TTS e montagem, `audiofy.audio_audit` executa `silencedetect` em cada chunk e
persiste `audio-audit.json` atomicamente. O limiar usa -45 dB por pelo menos 1,5 segundo; 2,5
segundos geram aviso e 5 segundos ou 35% do chunk geram achado crítico. A auditoria é diagnóstica:
não apaga áudio e não consome créditos para regenerar sem decisão humana.

**Interface:** Conteúdo e Episódios ganharam **Revisar chunks**. O modal lista arquivos em ordem,
duração, severidade, maior silêncio e player individual. A bridge entrega somente caminhos dos
formatos de áudio dentro da pasta de segmentos; o DOM usa `textContent`.

**Validação parcial:** 51 testes Python focados e 25 testes Electron passaram. A auditoria completa
dos episódios existentes e a inspeção responsiva serão registradas no commit de dados verificados.

---

## 2026-07-19 — Fila ordenada e fallback por saldo/limite

**Problema:** o cofre armazenava várias chaves, mas a ordem secundária vinha da ordenação alfabética
e a interface não permitia definir uma sequência. O TTS avançava apenas em `403` por limite mensal;
um `402` encerrava a geração mesmo quando havia outra chave cadastrada com saldo.

**Decisão:** `keys.json` ganhou `order`, migrado sem quebrar cofres existentes. **Usar** move a chave
para prioridade 1; setas alteram a fila e, no modo nomeado, a primeira é a efetiva. As candidatas
são deduplicadas pelo valor secreto e tentadas nessa ordem. `402` e `403` por limite avançam tanto
nas etapas OpenRouter de texto quanto no TTS, registrando somente o nome seguro no status/log.

**Validação:** 76 testes Python focados e 25 testes Electron passaram, incluindo migração,
persistência da ordem, reordenação, contrato IPC e fallback simulado em `402`/`403`. Nenhuma chave
real foi lida pelos testes e nenhuma chamada paga foi executada.

---

## 2026-07-19 — Música de fundo local com remixagem retomável

**Decisão:** o detalhe de Conteúdo ganhou seletor nativo de arquivo, remoção e volume entre 1% e
25%. MP3, WAV, M4A, AAC, FLAC e OGG de até 500 MiB são copiados pelo launcher para
`.audiofy/music/<sha256>.<ext>`; o worker rejeita qualquer caminho fora desse diretório. Isso evita
persistir caminhos pessoais e mantém a retomada funcional depois que o seletor fecha.

**Montagem:** a narração continua normalizada e a faixa, a 8% por padrão, é repetida pelo ffmpeg
somente até o fim da voz. A opção altera apenas a montagem: chunks compatíveis são reutilizados e
não geram novo custo TTS. `mix.json` registra nome original, hash, volume e regra de duração;
`metrics.json`, `status.json` e `NOTES.md` expõem metadados seguros e o aviso de direitos autorais.

**Segurança e validação parcial:** o IPC continua em allowlist e ganhou somente dois argumentos
limitados no comando `generate`; o renderer não recebe acesso genérico ao sistema de arquivos.
79 testes Python focados e 27 testes Electron passaram. A validação integral e a inspeção em
600 px/380 px serão registradas ao fim da entrega.

---

## 2026-07-19 — Recalibração e auditoria do histórico completo

**Escopo:** `scripts/recalculate_episode_data.py` percorreu localmente os quatro episódios
concluídos e 170 chunks, sem consultar rede ou provedor. Para cada episódio, a rotina mede o MP3
com ffprobe, conta palavras diretamente no roteiro persistido, compara a fonte quando ela ainda
está disponível, executa a política de silêncio e grava `verification.json`. Custos são preservados
com exatidão/procedência declarada, em vez de serem inventados a partir de manifestos antigos
incompletos.

**Resultado:** durações e palavras de roteiro coincidiram nos quatro episódios. As fontes dos dois
artigos e de *Cereja Rougue* também coincidiram; a fonte original de *O valor de terminar* não está
mais em `data/inbox/`, portanto seus 686 termos foram preservados e marcados como indisponíveis
para confronto. Os três episódios de adaptação tiveram 158/158 chunks sem alerta. Em *Cereja
Rougue*, 9/12 ficaram OK, `001_narrador.wav` recebeu aviso, e `006_narrador.wav`/`011_narrador.wav`
foram críticos por silêncios finais de 18,765 s e 6,467 s.

**Cálculos resultantes para 4.780 palavras:** adaptação usa três amostras e estima US$ 1,7190
(faixa US$ 1,3847–2,0550), 33,73 min; leitura fiel usa uma amostra e estima US$ 1,1525 (faixa
US$ 0,9220–1,3830), 35,45 min. A auditoria não regenerou os chunks problemáticos, evitando cobrança
automática e deixando a decisão para a revisão individual no modal.

**Inspeção responsiva:** em 600 px e 380 px, controles de música, ações empilhadas, alertas e
player individual permaneceram utilizáveis. A inspeção revelou e corrigiu um estado apenas visual:
ao reabrir o modal depois de ouvir um chunk, o rótulo antigo de reprodução agora volta para a
instrução neutra junto com o player vazio. A mesma inspeção encontrou nomes de chaves comprimidos
pelos controles da fila em 380 px; os cartões agora reservam a primeira linha inteira para
prioridade, nome e valor mascarado, deixando selo e ações na linha seguinte.

**Validação final:** `python scripts/check_quality.py` aprovou lint e formatação, 237 testes
Python com 74% de cobertura, 27 testes Electron, whitespace, JSON, links e auditorias Python/Node
sem vulnerabilidades conhecidas. `akita-articles` é uma dependência Git privada ao PyPI e por isso
foi explicitamente marcada pelo `pip-audit` como não auditável no índice. A mixagem também passou
por smoke real com ffmpeg: uma trilha curta em loop produziu MP3 válido limitado à narração.

---

## 2026-07-19 — Catálogo completo de episódios gerados

**Problema observado:** a aba Episódios dependia quase inteiramente de `status.json`, mostrava
somente o identificador e estado/custo, e classificava o piloto legado como desconhecido apesar de
existirem `episode.mp3` e `metrics.json` válidos.

**Decisão de contrato:** `_episode_summary` combina status operacional, métricas, auditoria,
`NOTES.md` e metadados reais do MP3. Um arquivo concluído sem status passa a ser reconhecido e
reproduzido; durante uma montagem ativa o MP3 continua oculto para não expor uma versão parcial.
Novas gerações também persistem título e data de criação do conteúdo em `metrics.json`, enquanto
episódios antigos usam o título auditável de `NOTES.md` e a data do identificador como fallback.

**Interface:** os registros agora aparecem do mais recente ao mais antigo em cartões com título,
ID, criação do conteúdo, geração do áudio, duração, arquivo/tamanho, formato, custo, perfil,
palavras e resumo dos achados de silêncio. Em telas estreitas, metadados e ações são empilhados.
A inspeção em 380 px também corrigiu o `flex-basis` horizontal do player global que virava altura
excessiva quando o componente mudava para coluna.

**Validação:** o catálogo foi conferido com os quatro episódios locais, inclusive reprodução e
metadados do piloto legado. A interface permaneceu legível e acionável em 600 px e 380 px.
`python scripts/check_quality.py` aprovou 238 testes Python com 74% de cobertura, 28 testes
Electron, lint, formatação, whitespace, JSON, links e auditorias Python/Node sem vulnerabilidades
conhecidas; `akita-articles` continua explicitamente fora da auditoria do PyPI por ser dependência
Git privada.

---

## 2026-07-19 — Nomes autoexplicativos para fonte, chunks e áudio completo

**Problema observado:** `episode.mp3` e nomes como `001_narrador.wav` só tinham significado
dentro da pasta do episódio. Ao copiar, compartilhar ou abrir o arquivo isoladamente, perdiam-se
a fonte, o episódio, o modo de geração, a completude e, no caso do chunk, sua posição total.

**Contrato v2:** os áudios novos carregam componentes portáveis e limitados de fonte, episódio e
modo. O MP3 termina em `audio-completo.mp3`; cada trecho informa `chunk-N-de-T` e `voz-*`; a entrada
integral é preservada como `fonte-original-completa.md`. `segments.json` registra a mesma semântica
por arquivo, e `metrics.json` aponta explicitamente o MP3 e a fonte. O resolver continua aceitando
`episode.mp3`, portanto integrações e acervos ainda não migrados não deixam de funcionar.

**Migração local:** `scripts/migrate_artifact_names.py --apply` renomeia sem sobrescrever,
sincroniza manifesto, auditoria e lista de concatenação, e nunca chama TTS ou rede. Os quatro
episódios locais, 170 chunks e quatro MP3s foram migrados. Os hashes SHA-256 ordenados antes e
depois permaneceram idênticos. Três fontes ainda disponíveis foram preservadas; *O valor de
terminar* continua honestamente sem documento de origem porque seu texto já não existe no inbox.

**Interface e inspeção:** o catálogo mostra a fonte e o nome descritivo do MP3. O modal identifica
`Chunk N de T`, voz e nome completo. A inspeção real em 600 px e a emulação do viewport de 380 px
confirmaram leitura, quebra dos nomes longos, botões e rolagem utilizáveis.

**Validação final:** `python scripts/check_quality.py` aprovou 240 testes Python com 75% de
cobertura, 28 testes Electron, lint, formatação, whitespace, JSON, links e auditorias Python/Node
sem vulnerabilidades conhecidas. `akita-articles` permanece identificado como dependência Git
privada que não existe no índice do PyPI.

---

## 2026-07-19 — Catálogo expandido de perfis embutidos (5 → 13)

**O que mudou:** oito novos perfis embutidos cobrem formatos e faixas de custo que antes exigiam
criação manual: podcast com 3 vozes (`podcast-trio`, `podcast-trio-economico`), debate com 4 vozes
(`podcast-mesa-redonda`), narração econômica (`narrador-economico`), narração premium com Pro em
texto e auditoria (`narrador-premium`), narração via assinatura (`narrador-assinatura`), podcast
com roteiro Claude Sonnet (`premium-claude`) e podcast via Gemini CLI (`assinatura-gemini`).
Constantes `_TTS`, `_PRO` e `_FLASH` eliminam repetição dos IDs de modelo. As descrições seguem
padrão uniforme: formato + voz + modelo/provedor + benefício.

**Decisões:**

- Vozes do trio escolhidas por contraste tímbrico: Kore (firme/curioso), Puck (animada/animado),
  Gacrux (madura/analítico). Mesa-redonda adiciona Sadachbia (vivaz/provocador) como debatedor.
- `narrador-premium` é o único perfil que usa Gemini Pro tanto para roteiro quanto para auditoria;
  os demais mantêm auditoria no Flash para economizar.
- `premium-claude` aponta `anthropic/claude-sonnet-4.6` via OpenRouter — o ID existe no cache
  local e foi verificado.
- Nomes existentes (`padrao`, `economico`, `narrador-unico`, `assinatura`, `assinatura-codex`)
  preservados para não quebrar `profiles.json` de quem já usa.

**Validação:** 247 testes Python (inclusive 8 novos para os perfis adicionados), 28 testes
Electron, Ruff, `compileall`, `npm run check`, `npm audit` (0 vulnerabilidades) e
`git diff --check` — tudo aprovado. README atualizado com a tabela completa dos 13 perfis.

**Risco que sobrou:** os IDs de modelo apontam versões disponíveis hoje no OpenRouter; se um
modelo for descontinuado, o perfil embutido falhará até que o ID seja atualizado no código.

---

## 2026-07-20 — Perfis expandidos, idioma, reparo e re-geração

**O que mudou:** seis commits entregaram funcionalidades complementares ao catálogo e à interface:

- **Reparo seletivo** (`pipeline.repair_episode`, bridge `repair`/`run-repair`): identifica
  segmentos com silêncio problemático via `audio-audit.json`, deleta apenas os WAVs afetados,
  regenera com cache dos bons e remonta o MP3. A UI mostra warning pós-geração e botão 🔧 Reparar.
  Spinner e shimmer animam etapas ativas.
- **Catálogo de perfis 13 → 30**: organizado por provedor em abas no app (Claude Code, Codex,
  Gemini CLI, Gemini, Claude, OpenAI). Assinaturas (texto grátis) aparecem antes dos perfis API.
  Claude prioriza Opus; OpenAI prioriza GPT SOL.
- **Idioma do episódio** (pt-BR / en): prompts convertidos de constantes para funções
  parametrizadas (`system_prompt(lang)`, `coverage_prompt(lang)`, etc.) com compatibilidade
  retroativa. Episódios em inglês ficam em `<item>__en`. O seletor na aba Conteúdo recalcula
  status e estimativa ao trocar.
- **Botão Re-gerar**: quando já existe episódio no idioma selecionado, o botão muda de
  "Gerar episódio" para "Re-gerar episódio", com status sensível ao idioma.

**Decisões:**

- Categorias de aba derivadas de `text_provider` + prefixo do modelo — sem campo extra no schema.
- `language` adicionado ao `Profile` e `Settings`; o worker recebe `--language=` via child_args.
- Funções de prompt mantêm constantes como alias padrão (`SYSTEM_PROMPT = system_prompt("pt-BR")`)
  para não quebrar imports existentes.
- Reparo reutiliza `_synthesize_turns()` (cache por fingerprint), `audit_segments()` e
  `_assemble()` do pipeline; não inventa fluxo paralelo.

**Validação:** 252 testes Python, 28 testes Electron, Ruff, `compileall`, `npm run check`,
`npm audit` (0 vulnerabilidades) e `git diff --check` — tudo aprovado. README atualizado com
tabela dos 30 perfis, seção de idioma e referências de perfis corrigidas.

**Risco que sobrou:** a troca de idioma não traduz o conteúdo-fonte automaticamente — a
tradução fica a cargo do modelo durante o roteiro, e a qualidade depende da capacidade do
modelo escolhido. IDs de modelo (Opus, GPT SOL) dependem do catálogo vivo do OpenRouter.

---

## 2026-07-20 — Erro de saldo da conta diferenciado do limite de chave

**O que mudou:** a geração real em inglês falhou na primeira fala TTS com HTTP 402
("Insufficient credits") e o app tratou como "saldo ou limite insuficiente" genérico, sem
orientar a recarregar créditos. O auto-resume só funcionava para 403 (limite de chave), não
para 402 (saldo da conta). Corrigido em backend e frontend:

- **Backend** (`pipeline._exhaustion_label`): nova função diferencia 402 ("sem saldo na conta")
  de 403 ("sem limite"). Os logs de fallback agora informam a causa correta.
- **Frontend** (`status-view.js`): mensagem 402 agora diz "O saldo da conta no OpenRouter acabou.
  Recarregue créditos em openrouter.ai/settings/credits e o Audiofy retoma automaticamente."
  A mensagem 403 permanece inalterada.
- **Auto-resume** (`canAutoResumeKeyLimit`): agora cobre tanto 402 quanto 403. Ao recarregar
  créditos, o Audiofy retoma a geração do checkpoint sem precisar clicar em nada.

**Decisões:** 402 é verificado antes de 403 no `friendlyGenerationError` porque uma resposta
com "Insufficient credits" e status 402 deve orientar recarga de saldo, não troca de chave.
O fallback entre chaves no pipeline continua tratando ambos como exaustão — a distinção é
apenas na mensagem ao usuário e no auto-resume.

**Validação:** 253 testes Python, 29 testes Electron (novo: retoma automática após 402), Ruff,
`compileall`, ESLint, `npm audit` (0 vulnerabilidades) e `git diff --check` — tudo aprovado.

**Risco que sobrou:** o auto-resume consulta a chave efetiva a cada minuto; se o usuário
recarregar créditos mas a consulta `/key` do OpenRouter ainda devolver indisponível por cache,
a retomada atrasa até a próxima checagem.

---

## 2026-07-20 — Idioma propagado para chunks, log, abort e reparo

**O que mudou:** o botão "Revisar chunks" e os comandos `generation-log`, `abort` e `repair`
usavam `_episode_dir(item_id)` sem passar o idioma selecionado na interface. Quando o episódio
era em inglês (diretório `<id>__en`) mas o perfil ativo tinha `language=pt-BR`, a bridge
procurava no diretório errado — sem `__en`. Resultado: chunks não encontrados, log vazio, abort
e reparo no episódio errado ou inexistente.

Corrigido de ponta a ponta: `_cmd_audio_chunks`, `_cmd_generation_log`, `_cmd_abort`,
`_cmd_repair` e `_cmd_run_repair` agora aceitam `language` explícito. O renderer passa
`--language=` do seletor (aba Conteúdo) ou de `episode.language` (aba Episódios) em todas as
chamadas afetadas.

**Validação:** 253 testes Python, 29 testes Electron, Ruff, `compileall`, ESLint,
`npm audit` (0 vulnerabilidades) e `git diff --check` — tudo aprovado.

**Risco que sobrou:** episódios que já tinham `status.json` com `episode_id` sem sufixo de
idioma continuam dependendo do perfil ativo para localizar o diretório quando não recebem
`--language=` (caso de chamadas legadas pela CLI ou automações antigas).

---

## 2026-07-20 — Correções do chat e modos de operação

**O que mudou:** o chat de pesquisa apresentava três problemas funcionais e ganhou modos
dedicados para reduzir perguntas esclarecedoras da IA:

- **JSON com newlines literais** (`_fix_json_newlines`): LLMs colocam quebras de linha
  reais dentro de valores JSON; `json.loads` falhava e a ação era ignorada silenciosamente.
  O parser agora escapa `\n`/`\r` literais dentro de strings JSON antes do decode,
  preservando newlines já escapadas e aspas escapadas.
- **Contexto poluído**: blocos ```acao (JSON já executado) e textos longos de pesquisa
  ficavam no histórico e esgotavam a janela de contexto na rodada seguinte.
  `ChatSession._clean_for_context` remove os blocos e trunca respostas do assistente a
  800 caracteres. O texto salvo no histórico já não contém blocos de ação crus.
- **Timeout de CLI**: a `_default_provider` agora captura `subprocess.TimeoutExpired`
  com mensagem clara em vez de propagar a exceção crua.
- **Modos de chat** (Livre, Pesquisar, Podcast, Narração, URL): barra de botões na
  interface que prefixa a mensagem com instruções claras (ex.: `[MODO PESQUISA] Pesquise
  o tema abaixo…`), orientando a IA a agir diretamente sem pedir confirmação. O prefixo
  é removido do histórico salvo para não poluir o contexto das rodadas seguintes.

**Decisões:** o prefixo de modo é tratado como instrução interna — transparente para o
modelo na chamada atual, mas removido do histórico persistido. Cada modo tem um placeholder
descritivo no campo de texto. O modo URL envia a URL diretamente para `adicionar_url` sem
passar pelo LLM, evitando custo e latência.

**Validação:** 261 testes Python e 29 testes Electron verdes; Ruff, `compileall`,
`npm run check` (ESLint + syntax + tests), `npm audit` (0 vulnerabilidades) e
`git diff --check` — tudo aprovado. 8 testes novos cobrem `_fix_json_newlines` (JSON
válido, newlines escapadas, newlines literais, aspas escapadas), remoção de blocos ação do
histórico, truncamento de contexto e remoção do prefixo de modo.

**Risco que sobrou:** os prefixos de modo dependem de o modelo seguir a instrução em texto;
modelos menos capazes podem ignorar a diretriz e continuar perguntando. O modo URL não
valida a URL antes de enviá-la à bridge.

---

## 2026-07-21 — Leitura reflexiva, redesign da aba Conteúdo e envio de arquivos

**O que mudou:** três frentes numa mesma sessão.

- **Modo de geração `reflexive`** (terceira opção ao lado de `adaptation` e `verbatim`):
  lê o texto original parágrafo a parágrafo sem reescrevê-lo e intercala, ao fim de cada
  parágrafo, um comentário curto (1–2 frases, teto de 400 caracteres) que contextualiza ou
  reflete sobre o trecho. O planejamento vive em `reflexive.json` (prosódia + comentários,
  ambos com cache por hash), e os turnos carregam `kind: verbatim|commentary` para separar
  o que é texto do autor do que é fala gerada. Seis perfis novos (`*-leitor-reflexivo`).
- **Redesign da aba Conteúdo**: cabeçalho da fonte com badge de estado (pronta/requer sync),
  área "Adicionar conteúdo" convertida em `<details>` recolhível, lista de itens em cards com
  título em destaque e data subordinada, contador de itens e estado vazio contextual
  (distingue "sem itens" de "sem resultado da busca").
- **Envio de arquivos** (`add-file` na bridge + `file_extraction.py`): PDF, DOCX, EPUB,
  TXT/MD e imagens. A extração roda por bibliotecas locais (pypdf, python-docx, ebooklib) e,
  para material escaneado, por OCR local (Tesseract, opcional, verificado no Diagnóstico).

**Decisões:**

- **A IA nunca extrai texto de arquivo automaticamente.** A ordem é biblioteca → OCR local →
  e só então uma pergunta explícita ao usuário. Um livro ou dezenas de páginas escaneadas
  custariam caro e seriam lentos via modelo; quando o caminho local falha, a UI explica o
  motivo, avisa do custo e oferece as alternativas gratuitas (instalar o OCR ou colar o texto).
  Ao aceitar, a instrução é apenas preparada no chat — o envio continua sendo do usuário.
- **PDF sem camada de texto é detectado por densidade** (`< 20 caracteres por página`), não
  por metadado: PDFs escaneados frequentemente declaram fontes que não correspondem a texto
  extraível, e a heurística evita ingerir lixo silenciosamente.
- **UTF-16 só é tentado quando há BOM.** Sem essa guarda, qualquer arquivo latin-1 de bytes
  pares "decodificava" em ideogramas sem erro e vencia o encoding correto (bug encontrado
  pelos testes durante esta sessão).
- **Tesseract entrou no diagnóstico como opcional**, com nome de pacote por gerenciador
  (`tesseract-ocr` + `tesseract-ocr-por` no apt, `tesseract-langpack-por` no dnf) — o pacote
  de idioma português é separado e essencial para OCR de conteúdo em pt-BR.

**Validação:** `scripts/check_quality.py` aprovado por completo — 291 testes Python
(30 novos em `test_file_extraction.py`, cobrindo TXT/DOCX/EPUB/PDF/imagem, os caminhos de
fallback e a seleção de idioma do OCR) e 29 Electron verdes; Ruff lint e format, cobertura
em 70% (mínimo do projeto), `pip_audit` e `npm audit` sem vulnerabilidades, `git diff --check`
limpo. `file_extraction.py` ficou com 87% de cobertura.

**Risco que sobrou:** o app Electron não pôde ser aberto neste ambiente (sandbox sem display
funcional), então a aba Conteúdo redesenhada e o fluxo de envio de arquivos foram validados
por preview estático com o CSS de produção e por teste da bridge em linha de comando — falta
conferência visual na máquina do usuário. O OCR foi exercitado apenas com mocks, porque o
binário Tesseract não está instalado aqui; o caminho real de PDF escaneado segue não testado
ponta a ponta. O modo reflexivo dobra aproximadamente o número de chamadas TTS em relação à
leitura fiel (um segmento extra por parágrafo), o que encarece episódios longos.

---

## 2026-07-21 — Escolha de modelo também nas assinaturas

**O que mudou:** os perfis com provedor de assinatura (Claude Code, Gemini CLI, Codex)
ficavam presos ao "modelo padrão da CLI" — só o OpenRouter permitia escolher. Agora o perfil
tem um campo `subscription_model` que vira `--model <nome>` na invocação da CLI, valendo tanto
para as etapas do pipeline quanto para o chat de pesquisa. Vazio mantém o comportamento
anterior (a CLI decide). A interface mostra sugestões por CLI via `<datalist>`, mas aceita
qualquer nome digitado.

**Decisões:**

- **Campo livre com sugestões, não lista fechada.** Cada CLI evolui seu catálogo sem avisar o
  Audiofy; uma lista fixa ficaria desatualizada e impediria modelos novos. As sugestões
  (`opus`/`sonnet`/`haiku`, `gemini-2.5-pro`/`flash`, `gpt-sol`/`o3`) são atalhos, não limites.
- **Validação estrita porque o valor vira argumento de processo:** aceita apenas
  `[A-Za-z0-9][A-Za-z0-9._:-]*` até 100 caracteres. Isso barra tanto injeção de flags
  (`--dangerously-skip-permissions`, `-opus`) quanto separação de argumentos e encadeamento
  de comandos. O campo é descartado quando o provedor é OpenRouter.
- **`command()` passou a montar o comando também para CLIs sem args headless.** O Gemini lê
  system e prompt juntos por stdin e antes recebia `[cli.binary]` cru nos dois chamadores
  (`chat_json` e `_default_provider`), o que deixaria a flag de modelo de fora justamente nele.
- **Precedência explícita:** modelo do perfil > modelo configurado na própria CLI (hoje
  detectado só no Codex, via `config.toml`) > padrão. O `settings-info` expõe
  `profile_subscription_model` para a interface marcar "(perfil)" quando a escolha é do Audiofy.

**Validação:** `scripts/check_quality.py` aprovado; 303 testes Python (12 novos cobrindo a
construção do comando nas três CLIs, o repasse em `chat_json` e `_default_provider`, a
validação hostil do campo e a persistência) e 29 Electron verdes. Além dos testes, o fluxo foi
exercitado de ponta a ponta: perfil salvo com `subscription_model: haiku`, ativado, e uma
chamada real ao Claude Code retornou JSON válido com custo US$ 0 — confirmando que a flag
chega à CLI e é aceita. As três CLIs tiveram o suporte a `--model` verificado no `--help`.

**Risco que sobrou:** nomes de modelo não são validados contra o catálogo real da CLI; um nome
inexistente só falha no momento da geração, com a mensagem de erro vinda da própria CLI (o
Codex, por exemplo, responde 400 dizendo que o modelo não é suportado na conta). A interface
não foi conferida visualmente porque o Electron não abre neste ambiente.

---

## 2026-07-21 — Rodapé de PDF derrubava a geração inteira

**O que mudou:** uma geração real (livro "Homenagem à Catalunha", PDF de 23 páginas) morreu
três vezes seguidas na fala 15, sempre depois de esgotar as 5 tentativas e já ter pago 14
segmentos de TTS. Duas correções independentes, em camadas diferentes.

- **Extração de PDF remove cabeçalhos e rodapés repetidos** (`_strip_running_headers`): o
  rodapé do InDesign (`14909-Homenagem à Catalunha (4P).indd 8 15/02/21 15:07`) aparecia nas
  23 páginas. A página 8 tinha *só* isso, e virou um trecho de leitura composto apenas de
  ruído de diagramação.
- **O pipeline tolera trechos que o TTS não pronuncia:** quando a resposta vem vazia depois de
  esgotar as tentativas, a fala é pulada com aviso e o episódio segue, em vez de perder todo o
  áudio já sintetizado. Se nenhuma fala gerar áudio, aí sim erra explicitamente.

**Decisões:**

- **A causa raiz foi isolada empiricamente, não adivinhada.** Chamando a API com variações do
  texto, o que quebra é o token `.indd`: `'14909-Homenagem à Catalunha (4P).indd 8 15/02/21'`
  retorna vazio, e o mesmo texto sem `.indd` sintetiza normalmente (660 KB). O modelo trata a
  string como nome de arquivo e não vocaliza. Uma primeira heurística — exigir 3+ letras — foi
  escrita e **descartada** ao ser testada contra o turno real, que tem 24 letras e mesmo assim
  falha. `is_speakable` ficou no código para o caso genuíno (numeração e símbolos soltos), mas
  não é o que resolve este bug.
- **Detecção de rodapé por repetição, não por padrão conhecido.** Rodapés variam por editora;
  casar `.indd` resolveria só este PDF. A regra é: linhas nas bordas da página que se repetem
  em pelo menos um terço das páginas, comparadas com os números normalizados (`8` → `#`) para
  casar numeração de página.
- **Três guardas contra remover conteúdo**, todas motivadas por testes que falharam durante a
  implementação: a janela de borda nunca cobre a página inteira (senão o miolo de páginas
  curtas some); linhas acima de 90 caracteres são ignoradas; e linhas terminadas em pontuação
  de frase também. Sem a última, uma abertura padronizada de capítulo seria apagada.
- **Só o erro de áudio vazio é tolerado.** Qualquer outro erro do provedor continua derrubando
  a geração — silenciar falhas de rede ou de crédito esconderia problemas reais.

**Validação:** `scripts/check_quality.py` aprovado; 317 testes Python (14 novos) e 29 Electron
verdes. A correção foi verificada contra o texto real preservado em `data/episodes/`: os 23
rodapés saem, a página 8 fica vazia, e Orwell (9x), Barcelona (5x), Poum (6x), Eileen e Aragón
continuam no texto — 4,7% de caracteres removidos, só ruído. Os testes de resiliência do
pipeline cobrem trecho pulado, erro diferente que ainda derruba, e nenhum áudio gerado.

**Risco que sobrou:** a detecção de rodapé é heurística e pode errar nos dois sentidos —
deixar passar rodapés em documentos de poucas páginas (o mínimo é 4) ou, em teoria, remover
uma linha curta de conteúdo que se repita nas bordas sem pontuação final. O episódio de teste
não foi regerado (a chave estava sem créditos e o PDF original não está mais no disco), então
a correção ponta a ponta na interface segue por confirmar.

---

## 2026-07-21 — Voz do narrador mudava sozinha no seletor

**O que mudou:** um episódio foi gerado com a voz Orus enquanto o perfil ativo
(`claude-code-leitor-reflexivo`) especifica `narrador:Sulafat`. O usuário relatou ter
selecionado outra voz sem querer — e o app não oferecia nenhuma barreira nem sinal disso.

Duas causas somadas, ambas corrigidas:

- **A roda do mouse sobre um `<select>` troca a opção no Chromium.** Passar o cursor sobre o
  combo enquanto se rola a página basta para mudar a voz. Agora `wheel` é bloqueado em
  narrador, formato e idioma — os três campos que alteram custo e áudio final.
- **O valor alterado virava o novo padrão e se perpetuava.** `renderActiveConfig` roda a cada
  refresh e repopula o combo usando `previousVoice || profileVoice`; qualquer valor presente
  no campo vencia o perfil, indefinidamente. Agora só uma escolha deliberada (evento `change`)
  sobrepõe o perfil, e a divergência aparece como aviso clicável que restaura a voz do perfil.

**Decisões:**

- **Bloquear `wheel` em vez de só avisar.** Num campo que define a voz do episódio inteiro e
  consome crédito, mudança silenciosa por rolagem é acidente esperando acontecer; o ganho de
  poder rolar o valor com a roda não compensa.
- **O aviso mostra a voz do perfil e volta em um clique**, em vez de forçar o perfil de volta
  automaticamente — trocar a voz pontualmente continua sendo legítimo, só não pode ser mudo.

**Validação:** `scripts/check_quality.py` aprovado; 317 testes Python e 30 Electron verdes
(1 novo cobrindo o bloqueio de `wheel` nos três campos, a precedência do perfil sobre o valor
não intencional e a presença do aviso de divergência).

**Risco que sobrou:** a proteção é do renderer, não do backend — uma chamada direta à bridge
com `--voice=` continua aceitando qualquer voz do catálogo, o que é correto para automações.
A interface não foi conferida visualmente porque o Electron não abre neste ambiente.

---

## 2026-07-21 — Configuração da geração travada durante a síntese

**O que mudou:** durante uma geração em andamento, só o botão "Gerar" ficava desabilitado —
narrador, formato, idioma, música de fundo e volume continuavam editáveis. Trocar qualquer um
deles no meio não afeta os segmentos já sintetizados, então o episódio sairia com duas
configurações misturadas, sem nenhum aviso. Agora esses campos ficam desabilitados enquanto
`state == "rodando"`, com uma faixa explicando que é preciso abortar e gerar de novo.

**Decisões:**

- **Travar em vez de avisar depois.** O caso é irreversível na prática: quando a divergência
  aparecesse no áudio final, o crédito já teria sido gasto nos dois formatos.
- **A trava é liberada explicitamente quando não há item selecionado.** `renderSelectedStatus`
  só roda com `selectedItem`; sem essa saída, desselecionar o item durante a geração deixaria
  os campos presos até o próximo clique em um item.
- **Complementa a correção anterior do mesmo dia** (roda do mouse trocando a voz em silêncio):
  aquela evita a mudança acidental antes de gerar, esta impede a mudança — acidental ou
  deliberada — depois que a síntese começou.

**Validação:** `scripts/check_quality.py` aprovado; 317 testes Python e 31 Electron verdes
(1 novo cobrindo a função de trava, o repasse do estado `rodando`, a liberação sem item
selecionado e a presença da faixa explicativa). A geração real em curso passou de 38/46 com
a correção anterior ativa, pulando os 2 trechos que o TTS não pronuncia.

**Risco que sobrou:** a trava vale para a interface; a bridge continua aceitando outra voz ou
formato numa chamada direta, o que é correto para automações mas significa que a garantia não
é do backend. Não houve conferência visual (o Electron não abre neste ambiente).

---

## 2026-07-21 — Auditoria contra o Guia Mínimo de Qualidade

**O que mudou:** varredura do repositório inteiro contra os 12 padrões obrigatórios do
`GUIA_MINIMO_QUALIDADE.md`. A régua automatizada (`scripts/check_quality.py`) já cobria lint,
formatação, testes, cobertura, auditoria de dependências e validação de JSON/links. Esta
entrada registra o que a régua **não** cobre e foi verificado por inspeção.

**Conforme:** menu de entrada (`start_app.py` com Iniciar/Instalar/Configurar/Status);
segredos fora do Git (`.env` e `.audiofy/` ignorados, chaves em teste são fixtures óbvias);
responsabilidades separadas por módulo (fontes, provedores, pipeline, runtime, bridge);
dependências pinadas com lockfile e auditoria limpa; README enquadra trabalho futuro como
convite a contribuição; `IA.md` preservado como linha do tempo.

**Corrigido nesta entrada:**

- **`export.py` estava com 0% de cobertura** — é lógica de negócio (escreve o pacote
  NotebookLM e formata o contrato de instruções), não código visual, então o item 7 exige
  teste. Sete testes cobrem a escrita dos dois arquivos, a preservação do texto integral e da
  atribuição, o aviso de que o NotebookLM não garante cobertura integral, a separação por
  idioma (sem isso, gerar o mesmo item em pt-BR e en sobrescreveria o pacote) e a
  reexportação idempotente. Cobertura do módulo: 0% → 100%.

**Riscos conhecidos e aceitos (decisão do mantenedor):**

- **`data/episodes/` é versionado e o repositório é público.** São 238 arquivos de áudio
  (~350 MB, com o `.git` em ~295 MB) e o texto integral das fontes, incluindo obras de
  terceiros — os próprios artefatos carregam o aviso "Verifique os direitos do conteúdo
  original antes de publicar". O versionamento é intencional: os episódios servem de exemplo
  auditável do pipeline. Fica registrado como risco conhecido de direitos autorais e de peso
  do repositório, não como pendência a corrigir. Quem for publicar um fork deve revisar essa
  pasta antes.
- **Cobertura de `bridge.py` (55%) e `pipeline.py` (60%)** fica abaixo da média do projeto.
  São os módulos de orquestração, com muitos caminhos que dependem de rede, processo externo
  ou ffmpeg; o total do projeto (72%) permanece acima do mínimo de 70%. Ampliar a cobertura
  desses dois é uma boa contribuição para quem quiser fortalecer a régua.

**Validação:** `scripts/check_quality.py` aprovado por completo — 324 testes Python e 31
Electron verdes, lint e formatação limpos, cobertura 72%, `pip-audit` e `npm audit` sem
vulnerabilidades, JSONs válidos e links internos íntegros. A geração real que motivou as
correções anteriores (livro em PDF, modo reflexivo) concluiu com sucesso: MP3 final gerado,
US$ 1,65, com os 2 trechos impronunciáveis pulados em vez de derrubarem o episódio.

---

## 2026-07-21 — Faixa da estimativa honesta e matriz no pacote NotebookLM

**O que mudou:** dois ajustes pequenos motivados por uso real.

- **Estimativa com uma amostra usa a variância real do TTS**, não um ±15%/±20% fixo. A
  estimativa já lia todos os `metrics.json` do histórico (média ponderada por modo e por
  modelo); o que faltava era a faixa: modos novos (reflexive, verbatim) têm uma amostra só, e
  o intervalo virava um chute arbitrário. Agora, quando o modo tem menos de duas amostras, a
  dispersão vem do histórico completo daquele TTS — a taxa de fala e o preço por palavra
  atravessam os formatos porque a voz é a mesma. Sem histórico suficiente, cai para o padrão.
- **O pacote NotebookLM ganha a matriz de cobertura quando ela existe.** Se o episódio já
  passou pelo pipeline, `coverage.json` lista os pontos críticos e importantes; eles viram um
  checklist (`cobertura-para-o-notebooklm.md`) para colar junto do foco, orientando o
  NotebookLM a cobrir tudo em vez de resumir livremente. O texto exportado já era o
  processado (`item.text`, pós-extração com limpeza de rodapé), então esse lado do pedido já
  estava atendido.

**Decisões:**

- **A faixa por variância do TTS ignora o modo de propósito.** Misturar formatos seria errado
  para a *média* (podcast tem proporção texto/roteiro diferente da leitura literal), mas a
  *dispersão* da voz é compartilhada — usar todos os episódios do TTS dá uma incerteza medida
  em vez de inventada. A interface passa a dizer "faixa pela variância do histórico do TTS"
  quando isso acontece, para a origem ficar clara.
- **O guia de cobertura só entra com pontos críticos/importantes.** O "contextual" é ruído
  para o foco do NotebookLM. E um guia antigo é apagado quando a matriz some, para o pacote
  nunca prometer cobertura que não acompanha mais o conteúdo.
- **`coverage.json` corrompido não derruba a exportação** — o pacote sai sem o guia, porque o
  NotebookLM continua útil só com a fonte.

**Validação:** `scripts/check_quality.py` aprovado; 20 testes novos/afetados verdes (7 de
estimativa cobrindo a variância histórica e o fallback padrão; 13 de exportação cobrindo o
guia de cobertura, o descarte do guia obsoleto e o JSON inválido). Verificado com dados reais:
a estimativa reflexive de 5000 palavras dá ~US$ 1,67 / ~41 min, coerente com o Orwell medido
(US$ 1,65 / 40,5 min); o guia gerado a partir de um `coverage.json` real trouxe os pontos
essenciais formatados.

**Risco que sobrou:** a variância do TTS só melhora a faixa enquanto houver ao menos dois
episódios daquele modelo; um TTS estreante ainda cai no ±15%/±20% padrão. A qualidade do guia
de cobertura depende da matriz que o pipeline extraiu — se o `coverage.json` for pobre, o guia
herda isso.

---

## 2026-07-21 — Idiomas viram um registro modular (refatoração, branch)

**O que mudou:** os idiomas estavam codificados em `if language == "en"` espalhados por 7
arquivos (~45 pontos), no estilo que o guia de qualidade chama de "sinal de refatoração":
adicionar um idioma exigiria caçar cada `if` em prompts, narração, bridge e perfis. Agora há um
registro único, `languages.py`, com uma entrada por idioma (código estável + rótulo de prompt +
rótulo de interface). Cada texto que varia por idioma virou um dicionário indexado pelo código,
e o código de orquestração consulta o registro em vez de ramificar.

Adicionar um idioma passou a ser local: uma entrada em `LANGUAGES` mais os textos nos
dicionários de `prompts.py` e `narration.py`. Um teste prova isso registrando "es" em runtime
e verificando que ele fica suportado e válido no perfil sem tocar em nenhum módulo de texto.

**Decisões:**

- **Refatoração pura, comportamento preservado byte a byte.** Antes de aprovar, comparei a
  saída de todas as funções migradas (system/coverage/script/audit/prosody/reflexive/tts) entre
  o `main` e a branch, nos dois idiomas, solo e duo: zero divergências.
- **Foi em branch (`refactor/registro-de-idiomas`),** não direto no `main`, porque a política de
  git reserva branch para refatoração significativa que mexe em muitos arquivos — este é o caso.
- **`get_language`/`normalize` caem no padrão para código desconhecido em vez de levantar.** Um
  artefato antigo ou integração com um código inesperado não deve derrubar a geração; o
  `reflexive_prompt` antigo já se comportava assim, e o registro generaliza isso.
- **Um bug pré-existente foi preservado, não corrigido, e registrado.** A direção padrão de
  podcast anexa `, tom X` mesmo em inglês (o rótulo do tom não era traduzido). Corrigir mudaria
  a saída, o que não cabe numa refatoração que promete preservar comportamento; fica anotado em
  `podcast_direction` como melhoria à parte, boa para quem quiser contribuir.

**Validação:** `scripts/check_quality.py` aprovado; 344 testes Python (9 novos do registro,
incluindo o fallback e a prova de que registrar um idioma é local) e 31 Electron verdes.
Comparação byte a byte old-vs-new sem divergências. README ganhou o passo a passo de como
adicionar um idioma.

**Risco que sobrou:** a interface ainda lista os dois idiomas manualmente no HTML
(`<option>` fixos); um idioma novo no registro apareceria no backend mas não no seletor até o
HTML ser atualizado — expor `supported_codes()` para a UI montar o seletor é o próximo passo
natural, deixado como contribuição.

---

## 2026-07-21 — Tesseract local sem senha de administrador

**O que mudou:** quando o APT encontra o Tesseract ausente e `sudo -n` exige senha, o Setup
agora baixa os pacotes com `apt-get download`, extrai em `.audiofy/tools/tesseract` e configura
automaticamente o `pytesseract`, o diretório de idiomas e as bibliotecas privadas. A instalação
não modifica o sistema e não solicita credenciais.

**Decisão:** o fallback sem privilégios vale para o Tesseract, que é o item que falhava e pode
ser executado de uma árvore privada. Git e FFmpeg continuam usando o gerenciador do sistema;
transformá-los em distribuições portáteis exigiria contratos e artefatos distintos por plataforma.

**Validação:** testes unitários cobrem a queda automática do APT global para o APT local e a
descoberta do executável privado; a régua do projeto foi executada após a mudança.

**Risco que sobrou:** o fallback depende de `apt-get download` e `dpkg-deb`, presentes em
sistemas Debian/Ubuntu. Outras distribuições seguem usando seu gerenciador normal.

---

## 2026-07-23 — Tesseract multiplataforma, sem senha e com idiomas garantidos

**O que mudou:** o Setup deixou de depender do PATH e do privilégio de administrador para o OCR.
`tesseract_command()` procura o executável no PATH, na cópia privada e nos locais padrão de cada
sistema (Program Files no Windows, `/opt/homebrew` e `/usr/local` no macOS, `/usr/bin` no Linux).
Quando não há instalação, `_install_private_tesseract()` escolhe o método local do sistema: pacote
portátil `.zip` no Windows (novo) ou extração de `.deb` no Linux (já existente). Por fim,
`ensure_tesseract_languages()` garante `por` e `eng` em `.audiofy/tools/tessdata`, reaproveitando
os idiomas já instalados e baixando apenas o que falta.

**Decisão:** os idiomas passaram a viver num tessdata do usuário porque o diretório do sistema
(`C:\Program Files\Tesseract-OCR\tessdata`) exige administrador para escrita — era o que impedia
instalar o português numa máquina onde o Tesseract já existia. Como o Tesseract lê um único
`TESSDATA_PREFIX`, os idiomas presentes na instalação são copiados para lá antes do download.
O `sudo -n` deixou de ser aplicado quando o processo já é root, situação comum em contêineres
onde o `sudo` sequer existe. `_download()` aceita somente HTTPS e grava em arquivo `.part`
renomeado ao final, para que uma queda de rede não deixe um idioma truncado no lugar do bom.

**Validação:** `ruff check` e `ruff format --check` limpos; 20 testes em `test_setup.py` (10 novos)
cobrindo descoberta fora do PATH, recusa de origem não-HTTPS, ausência de arquivo parcial após
falha, reaproveitamento de idiomas sem baixar e propagação do erro de rede. Cobertura de
`setup.py` subiu de 39% para 55%. Verificação manual na máquina Windows: o Tesseract 5.4.0 que já
existia passou a ser detectado e `--list-langs` passou a incluir `por`.

**Risco que sobrou:** a régua completa continua reprovada por duas falhas anteriores a esta
mudança (`test_subscription.py::test_windows_executa_node_diretamente...` e
`test_process.py::test_posix_encerra_o_grupo...`), ambas presentes no commit `346acaa`. As duas
assumem convenções POSIX ao rodar no Windows — a primeira compara o caminho com
`endswith("claude-code/cli.js")`, barra normal, que nunca casa com o separador do Windows.
Corrigi-las é uma mudança à parte, em módulos não tocados aqui. O pacote portátil do Windows
aponta para uma versão fixa, isolada na constante `_WINDOWS_TESSERACT_VERSION` para que a
atualização seja de uma linha só.

**Revisão contra o guia mínimo de qualidade:** as duas falhas descritas acima como risco foram
corrigidas na sequência, pois eram testes que assumiam POSIX ao rodar no Windows, não defeitos de
produção: a comparação de caminho passou a usar `Path.parts` em vez de `endswith` com barra
normal, e os `patch` de `os.getpgid`/`getpgrp`/`killpg` ganharam `create=True`. Com isso a suíte
fica verde em qualquer sistema (356 testes). O README foi corrigido no mesmo passo: descrevia o
fallback como exclusivo do Linux com APT, comportamento que esta mudança generalizou.

---

## 2026-07-23 — Símbolos de status quebravam a saída em console legado do Windows

**O que mudou:** `start_app.py` passou a verificar se o console consegue codificar os símbolos
`✔ ⚠ ✖` antes de usá-los. Quando não consegue, tenta migrar a saída para UTF-8; se nem isso for
possível, cai para marcas ASCII (`v ! x`). Antes, qualquer mensagem de status lançava
`UnicodeEncodeError` em consoles `cp1252`.

**Decisão:** a verificação vive junto da definição dos símbolos, na carga do módulo, e não dentro
de `main()`. O erro aparecia justamente quando funções como `do_desktop()` eram chamadas fora do
menu — em testes ou por automação —, caminho que um ajuste em `main()` não cobriria.

**Como foi encontrado:** a régua do projeto reprovava com 20 erros e 2 falhas que pareciam
problema de importação, pois só apareciam sob `unittest discover`. O pytest captura a saída e
mascarava a exceção; o `unittest` escreve direto no console e a expunha. Era um bug real de
produção no Windows, não um defeito dos testes.

**Validação:** `scripts/check_quality.py` aprovado, com 361 testes verdes e cobertura em 72%.
Quatro testes de regressão cobrem console legado sem migração, console UTF-8, migração
bem-sucedida e a emissão das três mensagens de status.

**Risco que sobrou:** em consoles muito antigos as marcas ASCII perdem o apelo visual, mas
preservam a informação. A cor ANSI é mantida nos dois casos.

---

## 2026-07-23 — Caminhos acentuados eram rejeitados ao abrir a pasta do episódio

**O que mudou:** a ponte JSON passou a garantir UTF-8 na própria emissão (`_emit`), e o Electron
passou a exportar `PYTHONIOENCODING=utf-8` para a bridge e a decodificar o `stdout` do backend
explicitamente como UTF-8.

**Sintoma:** clicar em "📂 Abrir pasta" respondia "O app só pode abrir arquivos dentro do
projeto", mesmo com o episódio existindo dentro do projeto.

**Causa:** o Python herdava o encoding do console (cp1252 no Windows) e devolvia o campo `dir`
com os acentos corrompidos — `Programa��o` no lugar de `Programação`. A guarda de
segurança do Electron comparava essa string com a raiz correta do projeto, o `startsWith` falhava
e o caminho era classificado como externo. A validação estava certa; a entrada é que chegava
corrompida. Só afeta projetos cujo caminho absoluto tem caracteres fora do ASCII.

**Decisão:** a correção fica dos dois lados da fronteira. A bridge não deve depender de quem a
chama definir variáveis de ambiente, então `_emit` ajusta o stdout sozinho; e o Electron fixa o
encoding na leitura, o que também reagrupa caracteres multibyte partidos entre dois chunks do
stream. O projeto já aplicava esse mesmo padrão ao worker de geração (`PYTHONUTF8`/
`PYTHONIOENCODING`), então a mudança estende uma solução existente em vez de criar outra.

**Validação:** `scripts/check_quality.py` aprovado. Três testes Python cobrem caminho acentuado
preservado, console cp1252 migrado para UTF-8 e saída sem `reconfigure` disponível; um teste
Electron garante o `PYTHONIOENCODING` no ambiente da bridge. Verificação manual: a validação de
caminho, que antes recusava, passou a aceitar o diretório real do episódio.

**Risco que sobrou:** o terceiro teste revelou que um `stdout` com `reconfigure` não-chamável
levantava `TypeError` e derrubaria a resposta inteira; a exceção passou a ser tratada aqui e no
`start_app.py`, que usa a mesma técnica.

## 2026-07-23 — Catálogo unificado de vozes, perfis ultra-econômicos e UI contextual

**O que mudou:** a configuração de perfis estava confusa e travada em vozes Gemini. Agora o
sistema suporta todos os 12 modelos TTS do OpenRouter com catálogo dinâmico de vozes,
classificação por tiers de custo/qualidade, e interface contextual por aba.

**Backend:**
- Novo módulo `src/audiofy/voices.py` centraliza `TTS_VOICE_CATALOGS` (modelo → vozes) e
  `TTS_TIERS` (modelo → tier/custo efetivo por milhão de caracteres). Quatro tiers:
  ultra-econômico (Kokoro, ~$0.62/M), econômico ($7/M), padrão ($15-30/M), premium ($48-100/M).
- `KOKORO_VOICES` expandido de 3 para 24 vozes (PT-BR + EN-US + EN-GB).
- Validação de vozes no bridge removeu bloqueio hard-coded em `GEMINI_VOICES` — qualquer voz
  não-vazia é aceita (a API do OpenRouter valida).
- Três comandos bridge (`models-list`, `settings-info`, `tts-catalog`) enviam `voice_catalogs`
  e `tts_tiers` ao frontend.
- 8 perfis ultra-econômicos builtin combinam texto por assinatura (grátis) + Kokoro TTS.

**Frontend Electron:**
- Formulário de perfil pré-seleciona provedor baseado na aba ativa (Claude Code → claude-code).
- Vozes dos apresentadores mudam dinamicamente ao trocar o modelo TTS: catálogo com vozes →
  dropdown; catálogo vazio → input de texto livre.
- Badge colorido com tier e custo efetivo aparece ao lado do seletor de modelo TTS.
- Catálogo TTS mostra vozes agrupadas por modelo com tier e custo.

**TUI `start_app.py`:**
- `do_catalog()` mostra vozes de todos os modelos (não só Gemini) com tiers.
- Seleção de voz verbatim usa catálogo do TTS ativo em vez de `GEMINI_VOICES` fixo.

**Decisão:** o catálogo fica no Python (`voices.py`) e viaja ao frontend via bridge, evitando
duplicação. Modelos sem catálogo conhecido usam dict vazio — o frontend oferece input de texto
livre em vez de bloquear. O Kokoro tem qualidade ruim para uso comercial, mas viável para uso
interno/prototipagem a custo desprezível.

**Validação:** 365 testes passaram (1 falha pré-existente em `test_setup.py` por Tesseract
local, sem relação). Ruff check + format + compileall aprovados.

**Risco que sobrou:** modelos TTS sem catálogo (Orpheus, Zonos, etc.) aceitam qualquer string
como voz — um erro de digitação só será detectado na hora da síntese pela API do OpenRouter.

## 2026-07-23 — Abas de perfis passaram a fixar a família de texto

**O que mudou:** as abas de perfis apenas pré-selecionavam o provedor e ainda permitiam trocar
Claude Code por OpenRouter ou outra família. Agora cada aba fixa sua família de texto ao criar e
editar perfis: Claude Code, Codex e Gemini CLI usam exclusivamente suas respectivas assinaturas;
Claude API, OpenAI API e Gemini API usam OpenRouter. A aba Personalizados continua permitindo
combinações livres de texto.

**Decisão:** o bloqueio fica no editor do Electron, com o backend continuando a validar o
provedor recebido. O modelo TTS permanece independente e editável em qualquer aba.

**Validação:** lint, testes Electron e verificação de qualidade devem cobrir que a opção de
provedor é filtrada e desabilitada quando uma categoria fixa abre o formulário.

## 2026-07-23 — Esforço alto explícito nas CLIs compatíveis

**O que mudou:** as chamadas do Claude Code agora incluem `--effort high` e as chamadas do
Codex incluem `-c model_reasoning_effort="high"`. Assim o Audiofy não depende da configuração
global da sessão para esses dois provedores.

**Limite:** o Gemini CLI não oferece uma flag universal equivalente de esforço alto; sua
configuração nativa permanece intacta para evitar enviar um argumento incompatível.

## 2026-07-23 — Seletor TTS consolidado por tier

**O que mudou:** o formulário de perfil deixou de separar empresa e modelo para TTS. Agora há
uma única lista com todos os modelos de voz retornados pelo OpenRouter, agrupados em ultra-
econômico, econômico, padrão, premium e uma área de modelos ainda sem classificação. Cada
opção mostra o custo efetivo por milhão de caracteres e o preço informado pelo catálogo.

**Decisão:** a empresa continua presente no ID técnico do modelo, mas não é mais uma etapa de
escolha do usuário. Isso reduz a exploração combinatória e orienta a seleção pelo objetivo de
uso, mantendo a atualização dinâmica do catálogo do OpenRouter.

**Complemento:** o catálogo TTS agora aproveita `supported_voices` retornado pelo OpenRouter.
Quando um modelo não informa vozes, o editor não oferece mais um input livre para o usuário
adivinhar IDs; exibe uma opção desabilitada indicando que não há vozes catalogadas. Uma voz já
salva continua visível como configuração atual para preservar perfis existentes.

**Qualidade:** a descoberta do Tesseract passou a priorizar PATH, instalação conhecida do
sistema e só então a cópia privada do Audiofy. Isso evita que uma cópia local esconda uma
instalação válida fora do PATH e elimina a falha intermitente do teste em ambientes preparados.

## 2026-07-23 — Módulo de análise de custos de geração

**O que mudou:** novo módulo `src/audiofy/cost_analytics.py` que coleta métricas de todos os
episódios gerados (custo, duração, data) e fornece:
  - estatísticas agregadas: total gerado (horas, custo, palavras);
  - análise por dimensão: custo por modelo TTS, por perfil, por semana;
  - percentis de duração (50%, 75%, 90%) e mediana de custo/minuto;
  - estimativas para próximas gerações: custo por 10min/30min/1h e por 1k/5k palavras.

A CLI `python3 start_app.py costs` exibe relatório formatado no terminal.

**Decisões:**
  - Carrega apenas `metrics.json` de episódios válidos (ignora ausentes ou corrompidos).
  - Usa `datetime.fromisoformat` para parsing de timestamps (sem dependência extra).
  - Properties com cache implícito em properties de `CostAnalytics` (cálculos leves).
  - Estimativa de duração lê `generated_at` e `verified_at` para computar tempo real.
  - Formatação com caracteres Unicode (bordas, emoji) resgata o suporte já testado em
    `_supports_unicode()` da porta de entrada.

**Validação:** 37 testes unitários (100% cobertura) cobrem métricas individuais, agregação,
carregamento de arquivos, manejo de dados ausentes/corrompidos e formatação. Ruff aprovado.
Teste manual com 10 episódios reais confirma valores acurados (custo total, duração, modelo).

**Risco que sobrou:** se `metrics.json` for omitido durante a geração de um episódio, aquele
episódio não aparecerá na análise. O código trata o JSON faltante como ignora silenciosamente,
consistente com a robustez do pipeline; alertas deveriam vir da telemetria de geração.

## 2026-07-23 — Aba "📊 Custos" no app desktop

**O que mudou:** a análise de custos criada em `cost_analytics.py` ganhou uma aba própria no
Electron, ao lado de Chat/Conteúdo/Episódios/Configurações. Mostra episódios, duração e custo
totais, custo médio (episódio/minuto/segundo/palavra e mediana), percentis de duração
(50/75/90%), custo por modelo TTS, por perfil, por semana e estimativas para 10min/30min/1h e
1k/5k palavras, com botão de atualizar.

**Decisões:**
  - Novo comando `costs` na bridge (`_cmd_costs`), que devolve `analytics_summary()` — dict
    JSON-serializável derivado do mesmo `CostAnalytics` usado pela CLI, sem duplicar lógica.
  - `security.js` ganhou a aridade `"costs": [1, 1]`, seguindo o mesmo contrato explícito de
    todo comando exposto ao renderer.
  - HTML/CSS reaproveitam o design system existente (`.panel`, `.row-list`, `stat-tile` novo
    seguindo o padrão visual dos badges e cards já usados em Episódios/Configurações).
  - `loadCosts()` é chamado ao abrir a aba (mesmo padrão de `refreshStatus`/`loadItems`) e pelo
    botão manual de atualizar.

**Validação:** 41 testes do Electron (1 novo, cobrindo presença da aba, chamada à bridge e
tratamento de "sem episódios"), lint (`eslint --max-warnings=0`) e `npm audit` limpos. Testado
visualmente via driver Playwright + Electron real sob Xvfb (instalado nesta sessão com
autorização do usuário): a aba renderiza os 10 episódios reais do projeto com os mesmos valores
já validados pela CLI (`US$ 5.9371` total, `US$ 0.0298`/min etc.), incluindo scroll até a seção
de estimativas.

**Risco que sobrou:** nenhuma paginação ou filtro por período na aba — com poucas dezenas de
episódios é aceitável; crescendo muito, "custo por semana" e as listas por modelo/perfil podem
precisar de um teto de itens exibidos.

## 2026-07-23 — Correção: ordenação de episódios no mesmo dia

**O que mudou:** `_cmd_status` (`src/audiofy/bridge.py`), `do_status` (`start_app.py`) e
`load_episode_metrics` (`src/audiofy/cost_analytics.py`) ordenavam os episódios com
`sorted(EPISODES_DIR.iterdir())`, isto é, ordem alfabética pelo **nome da pasta**
(`YYYY-MM-DD-slug`). Quando dois ou mais episódios são criados no mesmo dia, o desempate cai no
slug (ordem alfabética do título), não na ordem real de criação — um episódio gerado por último
podia aparecer no meio da lista. As três funções agora ordenam pelo horário real de criação da
pasta (`Path.stat().st_ctime`).

**Motivo:** reportado pelo usuário — o episódio mais recente (`introducao-a-linguagem-de-...`,
criado às 17h06 de 23/07) aparecia entre outros dois episódios do mesmo dia em vez de por
primeiro/último, porque os três compartilhavam o prefixo `2026-07-23`.

**Validação:** confirmado com `stat -c %W` que os três episódios de 23/07 têm horários de criação
distintos (10:16, 13:01, 17:06) que a ordenação alfabética antiga não respeitava. Após a correção,
`sorted(..., key=lambda d: d.stat().st_ctime, reverse=True)` devolve `introducao-a-linguagem...`
em primeiro, como esperado. Suíte completa (424 testes) e `ruff check` passam sem alteração.

**Risco que sobrou:** nenhum renomeio de pasta foi feito (a task original cogitava incluir hora no
nome); a correção resolve via metadado do sistema de arquivos (`ctime`), que é suficiente e não
exige migração de dados existentes.

## 2026-07-24 — Voz/tom por segmento e acompanhamento sincronizado da leitura

**O que mudou:**
- `_synthesize_turns` (`src/audiofy/pipeline.py`) agora grava `voice`, `style` e `text` em cada
  entrada de `segments.json`, tanto no caminho de síntese nova quanto no de reaproveitamento de
  segmento já existente (retomada). Antes, só `speaker` (o id abstrato do apresentador) era
  persistido; a voz/tom reais só existiam em memória durante a geração, resolvidas contra o
  perfil ativo naquele momento — se o perfil fosse editado depois, a informação se perdia.
- `_cmd_audio_chunks` (`src/audiofy/bridge.py`) passa a incluir `voice`, `style`, `text` por
  chunk, além de `start_seconds`/`end_seconds` (nova função `_add_cumulative_timing`): soma
  `duration_seconds` de `audio-audit.json` na ordem de `chunk_index`, assumindo concatenação
  direta sem silêncio extra (mesma premissa de `segments.txt`/ffmpeg na montagem final). Se
  algum chunk não tiver duração auditada, a janela fica `None` para todos — uma soma parcial
  daria posições erradas no player.
- `_episode_summary` ganhou `presenters`: lista deduplicada (por `speaker`, na ordem de
  `chunk_index`) de `{speaker, voice, style}` lida de `segments.json`, usada para exibir vozes no
  card do episódio sem chamada bridge adicional.
- Front-end (`electron/renderer/`): card do episódio agora mostra as vozes/tons dos
  apresentadores na linha de produção; novo botão "📖 acompanhar" abre um modal teleprompter
  (`#teleprompter-modal`) com o texto completo por trecho, destacando (via `timeupdate` do
  player nativo) qual trecho está tocando agora e scroll automático. Comentários do modo
  `reflexive` (`kind: "commentary"`, texto gerado pela IA, não pertence à fonte original) são
  estilizados em itálico com rótulo "comentário do narrador" em vez de tentar casar com a fonte.

**Motivo:** pedido do usuário para ver informação de cada voz na aba Episódios e uma função de
acompanhar a leitura com a fonte sempre na tela. Investigação prévia (agente Explore) confirmou
que não existe nenhum timestamp por palavra/frase no projeto — só duração por chunk bruto em
`audio-audit.json`. Sincronização real (forced alignment) exigiria processamento pesado fora de
escopo; a granularidade de chunk (frase/parágrafo) é o teto viável sem novas dependências.

**Retroatividade:** script pontual (não versionado, rodado uma vez) cruzou `chunk_index` de
`segments.json` com os `turns` de `script.json`/`narration-script.json`/`reflexive.json` dos 10
episódios já existentes para preencher `text` em todos, e tentou resolver `voice`/`style` via
`profile_name` salvo em `metrics.json` contra `ProfileStore` (builtin + `.audiofy/profiles.json`).
6 de 10 episódios recuperaram voz/tom; 4 não puderam (3 usavam nomes de perfil que não existem
mais — `padrao`, `economico`, `assinatura-codex` — e 1 tinha perfil com `speaker` incompatível
porque o perfil foi editado depois da geração, `reset de leitura ultraeconomico`). Nos 4
irrecuperáveis, só `text` foi preenchido; `voice`/`style` ficam ausentes (a UI mostra só o
`speaker` id nesses casos), evitando gravar dado plausível-mas-errado.

**Validação:** TDD — testes escritos antes da implementação em ambos os arquivos Python
(`tests/unit/test_pipeline_resume.py`: 2 novos casos cobrindo gravação e preservação de
voice/style/text; `tests/unit/test_bridge.py`: 4 novos casos cobrindo janela temporal acumulada,
ausência de auditoria, e o resumo de `presenters`). Suíte Python completa (430 testes), `ruff
check` e `ruff format --check` (só nos arquivos tocados) limpos. Suíte Electron completa (41
testes) e `eslint --max-warnings=0` limpos.

**Risco que sobrou:** a sincronização é por chunk (frase/parágrafo), não por palavra — não é
karaokê palavra-a-palavra. A premissa de concatenação direta sem silêncio entre chunks não foi
validada byte a byte contra a etapa de montagem do MP3 (`_assemble`); se `ffmpeg concat` algum dia
passar a inserir padding, a janela temporal ficaria levemente dessincronizada. Episódios sem
`audio-audit.json` completo (ou com algum chunk sem duração auditada) não têm highlight
automático — o modal ainda mostra o texto, só sem destaque sincronizado. O arquivo de
retroatividade não foi versionado (script pontual de dados, não ferramenta reutilizável) — se
novos episódios legados precisarem do mesmo tratamento, a lógica de cruzamento
`chunk_index`↔`turns` documentada acima deve ser reaplicada.
exige migração de dados existentes.

## 2026-07-24 — Navegação por parágrafo no teleprompter, correção de leak e player único

**O que mudou:**
- Corrigido um memory leak real no teleprompter, achado por uma auditoria estática do código
  (`electron/renderer/renderer.js`): `openTeleprompter` nunca removia o listener `timeupdate`
  de uma abertura anterior antes de registrar um novo no mesmo `<audio>` (elemento persistente
  no DOM, nunca recriado). Reabrir o teleprompter várias vezes sem passar por
  `closeTeleprompter` acumulava listeners, cada um retendo em closure o texto/turnos inteiros
  do episódio anterior. Nova função `detachTeleprompterTimeUpdate()` é chamada tanto no fechamento
  quanto no início da abertura, eliminando o acúmulo.
- Teleprompter ganhou numeração de parágrafo (cada trecho de texto mostra seu número) e duas
  formas de navegação: um campo "ir para o parágrafo N" (form `#teleprompter-goto-form`) e clique
  direto no parágrafo — ambos pulam `player.currentTime` para o `start_seconds` do chunk
  correspondente. Só ficam ativos quando o episódio tem janela temporal completa (`start_seconds`/
  `end_seconds` em todos os chunks); sem isso, o clique não finge uma precisão que não existe.
- **Player de áudio unificado**: existiam 3 elementos `<audio>` separados (dock do header, modal
  de revisão de chunks, modal do teleprompter) que podiam tocar simultaneamente e se sobrepor —
  reportado pelo usuário ao notar que botões diferentes de "ouvir" iniciavam reproduções
  paralelas. Agora há um único `<audio id="episode-player">` real, movido via
  `movePlayerTo(slotId)`/`movePlayerHome()` (usando `appendChild`, que reancora o elemento sem
  recriá-lo — preserva `currentTime`/estado de reprodução) para dentro do slot do modal ativo e
  de volta ao dock do header ao fechar. Abrir qualquer um dos três contextos agora pausa e, se
  necessário, fecha os outros dois primeiro, garantindo que nunca haja duas reproduções ativas.

**Motivo:** pedido do usuário (numerar parágrafos e permitir pular por número ou clique) somado a
uma auditoria de memory leak solicitada após o PC do usuário travar por esgotamento de RAM/swap —
a auditoria confirmou um leak real e concreto no teleprompter (outros pontos investigados —
polling de status, renderização de episódios/custos, IPC/spawn de processo — usam padrões seguros
como `replaceChildren()`/`clearTimeout` pareado e não apresentaram problema). Player duplicado foi
um achado do próprio usuário ao testar a feature nova.

**Validação:** TDD — testes estáticos escritos cobrindo cada mudança em
`electron/tests/frontend-quality.test.js` (correção do leak, numeração/navegação por parágrafo,
clique-para-pular, player único) e ajuste do teste pré-existente `"modal permite auditar e ouvir
chunks individualmente"` para a nova estrutura de slot. Suíte Electron completa (44 testes, 1 skip
esperado no Windows) e `eslint --max-warnings=0` limpos. Suíte Python completa (430 testes) e
`ruff check` confirmados sem alteração (mudança restrita ao Electron).

**Risco que sobrou:** a auditoria de memory leak foi estática (leitura de código, sem profiling ao
vivo) — o mecanismo do leak tem alta confiança, mas a magnitude real em bytes por abertura não foi
medida; um profiling com heap snapshot do DevTools do Electron confirmaria o tamanho do impacto.
O DOM de mensagens do chat (`#chat-messages`) também cresce sem limite até o usuário clicar em
"Limpar" — achado da mesma auditoria, mas de impacto bem menor (exige uso muito prolongado do
chat) e não foi corrigido nesta entrega. O upload dos MP3s grandes (8 de 10 episódios) para um
storage externo (Google Drive) não foi possível nesta sessão: o conector Google Drive do usuário
está autorizado em claude.ai, mas essa conexão não é exposta ao Claude Code (CLI) — são superfícies
diferentes; os episódios grandes continuam só com `Caminho do arquivo (local)` preenchido no Notion,
sem link externo real.

## 2026-07-24 — Fix: teleprompter rolava a tela sozinho a cada tick

**O que mudou:** o handler de `timeupdate` do teleprompter (`electron/renderer/renderer.js`)
chamava `scrollIntoView({ block: "center" })` toda vez que o evento disparava — várias vezes por
segundo enquanto o áudio toca — mesmo quando o parágrafo ativo continuava sendo o mesmo de antes.
Isso cancelava qualquer tentativa do usuário de rolar manualmente a tela: ela "subia sozinha" de
volta ao centro a cada fração de segundo. Nova variável `teleprompterLastActiveEntry` guarda o
último parágrafo destacado; o scroll só acontece quando o parágrafo ativo realmente muda. É
resetada ao abrir/fechar o teleprompter para não herdar estado do episódio anterior, e sincronizada
pelo botão "ir para o parágrafo" (que ainda rola sempre, por ser ação explícita do usuário).

**Motivo:** reportado pelo usuário — "não dá pra descer, ele fica subindo sozinho".

**Validação:** TDD — teste estático novo em `electron/tests/frontend-quality.test.js` confirmando
que o scroll só ocorre quando `activeEntry` muda em relação ao anterior. Suíte Electron completa
(46 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos. Suíte Python completa (430 testes)
confirmada sem alteração.

**Risco que sobrou:** nenhum novo — a correção é estritamente mais permissiva com o scroll manual
do usuário, sem remover a funcionalidade de destaque automático.

## 2026-07-24 — Botão "voltar ao parágrafo atual" no teleprompter

**O que mudou:** depois da correção anterior (scroll automático só quando o parágrafo muda), rolar
manualmente para ler à frente/atrás deixa de ser interrompido — mas também deixa de haver um jeito
rápido de voltar ao ponto sendo narrado. Novo botão flutuante `#btn-teleprompter-follow`
("↓ Voltar ao parágrafo atual") aparece sobre o texto sempre que o parágrafo em destaque sai da
área visível do container (`updateTeleprompterFollowButton`, comparando
`getBoundingClientRect()` do parágrafo ativo com o do container via listener de `scroll`); some
sozinho quando o parágrafo ativo volta a ficar visível. Clicar nele rola de volta suavemente.

**Motivo:** pedido do usuário, na sequência direta da correção do scroll automático.

**Validação:** TDD — teste estático novo em `electron/tests/frontend-quality.test.js` confirmando
a lógica de visibilidade via `getBoundingClientRect`, o listener de `scroll` e o `onclick` do
botão. Suíte Electron completa (46 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos.
Suíte Python completa (430 testes) confirmada sem alteração.

**Risco que sobrou:** nenhum — feature aditiva, não interfere no destaque automático nem na
navegação por número/clique já existentes.

## 2026-07-24 — Arrastar o texto do teleprompter para rolar (drag-to-scroll)

**O que mudou:** o container `#teleprompter-text` agora aceita arrastar com o mouse para rolar,
como o scroll por toque de um celular (`setupTeleprompterDragScroll` em
`electron/renderer/renderer.js`). `mousedown` registra a posição inicial; `mousemove` só ativa o
arraste de fato (classe `dragging`, cursor "grabbing") depois de um deslocamento mínimo
(`DRAG_THRESHOLD_PX = 6`) — um clique normal num parágrafo (que pula o áudio para aquele trecho)
não pode virar um arraste acidental. Quando o deslocamento ultrapassa o limiar, o `click`
subsequente é suprimido em fase de captura para não disparar `jumpToChunk` no fim do arraste.

**Motivo:** pedido do usuário, na sequência das melhorias anteriores de navegação do teleprompter.

**Validação:** TDD — teste estático novo em `electron/tests/frontend-quality.test.js` confirmando
os listeners de mouse, o limiar de deslocamento e a supressão do clique acidental. Suíte Electron
completa (47 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos. Suíte Python completa
(430 testes) confirmada sem alteração.

**Risco que sobrou:** só funciona com mouse (arraste via `mousedown`/`mousemove`/`mouseup`); não
implementa eventos de touch (`touchstart`/`touchmove`) — no app desktop isso não importa (não há
tela sensível ao toque), mas se o Electron algum dia rodar numa tela touch, o gesto de toque
nativo do sistema provavelmente já cobre o scroll sem precisar dessa lógica adicional.

## 2026-07-24 — Inércia no arraste do teleprompter (momentum scroll)

**O que mudou:** o drag-to-scroll do teleprompter parava seco ao soltar o mouse; agora continua
desacelerando por conta própria, como o momentum scroll de um celular. `setupTeleprompterDragScroll`
(`electron/renderer/renderer.js`) amostra a velocidade recente (px/ms) a cada `mousemove` durante
o arraste; ao soltar (`mouseup`/`mouseleave`), se a velocidade for relevante, inicia um loop de
`requestAnimationFrame` que aplica a velocidade ao `scrollTop` e a reduz por atrito
(`INERTIA_FRICTION = 0.95` por frame) até cair abaixo de um piso (`INERTIA_MIN_VELOCITY`). Um novo
`mousedown` ou um giro da roda do mouse (`wheel`) cancela a inércia em andamento, para não competir
com outro gesto de scroll.

**Motivo:** pedido do usuário, para "ficar igual rolagem rápida de celular" depois do
drag-to-scroll simples da entrega anterior.

**Validação:** TDD — teste estático estendido em `electron/tests/frontend-quality.test.js`
cobrindo o loop de animação, a estimativa de velocidade e o cancelamento por novo arraste/roda do
mouse. A implementação usa `requestAnimationFrame`, `cancelAnimationFrame` e `performance.now()`,
globals de browser que não estavam na allowlist do ESLint do renderer
(`electron/eslint.config.cjs`) — adicionados ali (são legítimos, não builds de Node). Suíte
Electron completa (47 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos. Suíte Python
completa (430 testes) confirmada sem alteração.

**Risco que sobrou:** os coeficientes de atrito/piso foram calibrados de forma subjetiva (não há
uma "física real" de referência) — se o usuário achar a inércia rápida/lenta demais, ajustar
`INERTIA_FRICTION`/`INERTIA_MIN_VELOCITY` é a forma direta de recalibrar.

## 2026-07-24 — Aumenta a duração da inércia do teleprompter

**O que mudou:** `INERTIA_FRICTION` subiu de `0.95` para `0.97` em `setupTeleprompterDragScroll`
(`electron/renderer/renderer.js`) — quanto mais perto de 1, menos a velocidade encolhe por frame,
então a inércia dura mais tempo antes de cair abaixo do piso (`INERTIA_MIN_VELOCITY`, inalterado).

**Motivo:** pedido do usuário — a inércia calibrada na entrega anterior parecia curta demais.

**Validação:** suíte Electron completa (47 testes, 1 skip esperado) e `eslint --max-warnings=0`
limpos; mudança de uma única constante, sem novo comportamento a testar.

**Risco que sobrou:** mesmo da entrega anterior — calibração subjetiva, sem física de referência.

## 2026-07-24 — Inércia do teleprompter ainda mais longa

**O que mudou:** `INERTIA_FRICTION` subiu de `0.97` para `0.985` — o ajuste anterior ainda
pareceu fraco para o usuário.

**Motivo:** feedback direto do usuário ("ainda tá meio fraco") após o ajuste anterior.

**Validação:** suíte Electron completa (47 testes, 1 skip esperado) e `eslint --max-warnings=0`
limpos; mudança de uma única constante.

**Risco que sobrou:** mesmo das entregas anteriores — calibração subjetiva. Se ainda não for
suficiente, o próximo ajuste deveria considerar também amplificar a velocidade capturada no
solto do mouse (ex.: multiplicar por um fator > 1), não só reduzir o atrito, já que a amostragem
de `mousemove` pode subestimar gestos muito rápidos.

## 2026-07-24 — Boost de velocidade na inércia (mais rápida que scroll de roda)

**O que mudou:** o feedback do usuário deixou claro que o pedido não era só "durar mais tempo" —
era ser genuinamente **mais rápida que um scroll de roda normal**. Adicionado `INERTIA_BOOST = 3`
em `setupTeleprompterDragScroll`: ao soltar o mouse, a velocidade capturada é multiplicada por 3
antes de iniciar o loop de inércia, então o início do movimento é bem mais veloz que antes,
desacelerando com o mesmo atrito (`INERTIA_FRICTION = 0.985`) já calibrado.

**Motivo:** feedback direto do usuário ("pode deixar bem rápido, a ideia é ser mais rápido que o
scroll") — os ajustes anteriores só reduziam o atrito (duração), sem aumentar a velocidade inicial.

**Validação:** suíte Electron completa (47 testes, 1 skip esperado) e `eslint --max-warnings=0`
limpos.

**Risco que sobrou:** calibração subjetiva, como as anteriores — o valor `3` foi uma estimativa
inicial; pode precisar de mais um ajuste dependendo do "sentir" real do usuário.

## 2026-07-24 — Retoma a reprodução de onde parou, mesmo após fechar o app

**O que mudou:** o player global (`electron/renderer/renderer.js`) agora persiste em
`localStorage` (sobrevive a fechar/reabrir o Electron, diferente de uma variável em memória) a
posição de reprodução de cada episódio, indexada pela URL `file://` do MP3
(`PLAYBACK_POSITIONS_KEY`, teto de `MAX_SAVED_PLAYBACK_POSITIONS = 200` entradas para não crescer
sem limite ao longo de meses de uso). Um listener permanente de `timeupdate` no `#episode-player`
salva a posição continuamente enquanto toca. `playInApp` consulta essa posição salva **só quando
troca de episódio** (`isNewSource`) e retoma o `currentTime` de lá — clicar de novo no mesmo
episódio que já está tocando não reinicia a posição.

**Motivo:** pedido do usuário. Importante: não retoma tocando sozinho ao abrir o app — só quando
o usuário decide ouvir aquele episódio de novo, evitando som inesperado na abertura (esclarecido
via pergunta ao usuário antes de implementar).

**Validação:** TDD — teste estático novo em `electron/tests/frontend-quality.test.js` cobrindo a
chave de armazenamento, as funções de leitura/escrita, o consumo em `playInApp` e o listener de
`timeupdate` que salva. `localStorage` precisou ser adicionado à allowlist de globals do ESLint
do renderer (`electron/eslint.config.cjs`), mesmo padrão dos ajustes anteriores com
`requestAnimationFrame`/`performance`. Suíte Electron completa (48 testes, 1 skip esperado) e
`eslint --max-warnings=0` limpos. Suíte Python completa (430 testes) confirmada sem alteração.

**Risco que sobrou:** a posição é por caminho absoluto do arquivo — se o episódio for movido/
renomeado (fora do fluxo normal do Audiofy) ou o projeto for movido de pasta, a posição salva não
será encontrada e o episódio toca do início, sem erro visível (comportamento seguro, mas silencioso).

## 2026-07-24 — Fix: resume sempre voltava para o início (race condition)

**O que mudou:** `playInApp` (`electron/renderer/renderer.js`) definia `player.currentTime` logo
depois de `setPlayerSource` (que faz `player.src = url; player.load()`) — mas nesse instante o
`<audio>` ainda não resolveu metadata/seekability do arquivo, e o navegador ignora silenciosamente
o `currentTime` atribuído cedo demais. Por isso a posição salva nunca era aplicada de fato: o
episódio sempre tocava do início, mesmo com o valor correto persistido em `localStorage`. Corrigido
checando `player.readyState >= HTMLMediaElement.HAVE_METADATA` antes de posicionar; se ainda não
estiver pronto, espera o evento `loadedmetadata` (uma vez) antes de aplicar o `currentTime` salvo.

**Motivo:** reportado pelo usuário — "fechei enquanto reproduzia e quando abri de novo começou do
0", confirmando que a implementação anterior nunca funcionava de fato, apesar de os testes
estáticos (que checam presença de código, não comportamento real do `<audio>`) passarem.

**Validação:** TDD — teste estendido em `electron/tests/frontend-quality.test.js` confirmando a
checagem de `readyState` e o listener `loadedmetadata`. `HTMLMediaElement` precisou ser adicionado
à allowlist de globals do ESLint do renderer, mesmo padrão dos ajustes anteriores. Suíte Electron
completa (48 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos. Suíte Python completa
(430 testes) confirmada sem alteração.

**Risco que sobrou:** os testes desta feature são estáticos (regex sobre o código-fonte) — eles
confirmam que o padrão correto está presente, mas não executam o `<audio>` de verdade nem
simulam o timing real do carregamento. Um teste com JSDOM/Playwright que efetivamente carregasse
um arquivo e verificasse `currentTime` após `loadedmetadata` daria confiança mais forte contra
regressões futuras desse mesmo tipo de race condition.

## 2026-07-24 — Fix: resume ainda voltava para o início (localStorage não é durável)

**O que mudou:** mesmo depois da correção anterior (esperar `loadedmetadata`), o usuário reportou
que fechar o app durante a reprodução e reabrir ainda sempre voltava para o início — a correção
anterior tratou a race condition de timing do `currentTime`, mas não a causa raiz real: o
Chromium/Electron **não garante que `localStorage.setItem` seja fisicamente sincronizado em disco
no momento da chamada** — a escrita física acontece de forma assíncrona em background (commit em
batch no LevelDB interno). Fechar a janela abruptamente (botão X) pode encerrar o processo antes
desse commit terminar, perdendo dados ainda não sincronizados — potencialmente todo o histórico
salvo, não só o último tick, dependendo do estado do commit pendente.

A solução: substituir `localStorage` por persistência real via backend Python, que já escreve em
disco de forma síncrona e atômica (arquivo temporário + `Path.replace()`, atômico no nível do
sistema de arquivos, garantido pelo kernel — mesmo padrão já usado em `_save_json` de
`pipeline.py`). Novo módulo `src/audiofy/playback_positions.py` (classe `PlaybackPositions`,
teto de 200 entradas) grava/lê `.audiofy/playback-positions.json`. Novo factory
`playback_positions_store()` em `config.py`. Dois comandos novos na bridge
(`playback-position-get <source>` / `playback-position-save <source> <segundos>`), registrados
também na allowlist `COMMAND_ARITY` de `electron/security.js`. No renderer, `savePlaybackPosition`
chama a bridge (throttled a cada 3s — spawnar um processo Python a cada tick de `timeupdate`
seria caro) e `readSavedPlaybackPosition`/`playInApp` viraram `async`, aguardando a resposta antes
de posicionar o `currentTime`.

**Motivo:** reportado pelo usuário pela segunda vez ("quando eu fecho, ainda volta do 0") após a
correção anterior não resolver — a causa raiz não estava na race condition de timing do
`<audio>` (que era real e também precisava de correção), mas na falta de durabilidade do
`localStorage` do Chromium em fechamentos abruptos de janela.

**Investigação:** tentativa de reproduzir o bug ao vivo rodando o Electron real (com
`--remote-debugging-port` e Xvfb) falhou neste ambiente — o binário Electron sempre iniciava como
processo Node puro (`app` chegava `undefined`), porque a variável de ambiente
`ELECTRON_RUN_AS_NODE=1` estava herdada da sessão (o próprio Claude Code roda sob Electron/VS
Code). Não foi possível confirmar a causa por execução real; a conclusão veio de análise estática
rigorosa e conhecimento documentado do comportamento de `localStorage` em Chromium/Electron.

**Validação:** TDD — 9 testes novos em `tests/unit/test_playback_positions.py` (leitura/escrita,
persistência entre instâncias diferentes apontando pro mesmo arquivo — simulando fechar/reabrir o
app —, atomicidade, resiliência a arquivo corrompido, teto de entradas, criação do diretório pai)
e 3 em `tests/unit/test_bridge.py` para os novos comandos. Teste estático de
`electron/tests/frontend-quality.test.js` reescrito para confirmar ausência de `localStorage` e
uso da bridge. `electron/tests/security.test.js` estendido para os 2 comandos novos. Suíte Python
completa (442 testes) e `ruff check`/`ruff format --check` (nos arquivos tocados) limpos. Suíte
Electron completa (48 testes, 1 skip esperado) e `eslint --max-warnings=0` limpos.

**Risco que sobrou:** o resultado da chamada assíncrona `savePlaybackPosition` (que dispara a
bridge sem `await`, propositalmente, para não travar a UI a cada tick) não é aguardado — se o
processo Python falhar silenciosamente numa gravação específica, essa posição pontual se perde
sem erro visível, mas o próximo tick tenta de novo. Também não há garantia de que o **último**
tick antes do fechamento abrupto complete a gravação a tempo (o intervalo de 3s entre saves
significa que até ~3s do fim podem não ter sido persistidos) — isso é uma perda pequena e aceitável,
bem diferente do bug anterior (perda total, sempre voltando a zero).

## 2026-07-24 — Fix: resume ainda voltava para o início (caminho do teleprompter)

**O que mudou:** o usuário reportou que o resume ainda voltava sempre para o início mesmo após a
correção anterior. Investigação revelou que ele estava usando especificamente o botão
"📖 acompanhar" (teleprompter), não o "▶️ ouvir" do card — e `openTeleprompter`
(`electron/renderer/renderer.js`) tinha sua própria lógica de troca de fonte do player
(`player.src = ...`), **sem nenhuma chamada à lógica de resume** adicionada em `playInApp` na
correção anterior. Além disso, mesmo em `playInApp`, havia uma race condition sutil: a leitura da
posição salva (`await readSavedPlaybackPosition`) rodava **depois** de `setPlayerSource` já trocar
`dataset.source`/`src`/`load()` — assim que `dataset.source` aponta pra nova URL, o listener global
de `timeupdate` já trata o player como "válido" para salvar, e o primeiro `timeupdate` disparado
por `load()` (com `currentTime=0`) podia sobrescrever a posição salva com zero **durante o
`await`**, antes dela ser lida/aplicada.

Duas correções: (1) extraída a lógica de "esperar `loadedmetadata`/`readyState` e posicionar" para
uma função compartilhada `seekWhenReady(player, seconds)`, usada tanto por `playInApp` quanto por
`openTeleprompter` — o teleprompter passou a ter a mesma lógica de resume que faltava
completamente; (2) em ambos os fluxos, a leitura da posição salva agora acontece **antes** de
qualquer troca de `dataset.source`/`src`, eliminando a janela de corrida. Como reforço adicional,
o listener global de `timeupdate` que salva a posição agora só grava quando `!player.paused` — um
`timeupdate` com `currentTime=0` antes do play real não deveria sobrescrever nada.

**Motivo:** reportado pelo usuário pela terceira vez ("sempre que dou play volta do 0"). A pergunta
decisiva ("você está abrindo pelo teleprompter?") revelou que o caminho corrigido anteriormente
(`playInApp`, botão "▶️ ouvir" do card) nunca era o caminho que o usuário de fato usava.

**Investigação:** desta vez foi possível rodar o Electron real e reproduzir o bug ao vivo — a
variável `ELECTRON_RUN_AS_NODE=1` herdada do ambiente (o próprio Claude Code roda sob Electron)
impedia isso antes; rodando o binário num subshell com `unset ELECTRON_RUN_AS_NODE` e
`--remote-debugging-port`, foi possível conectar via Chrome DevTools Protocol (websockets em
Python) e executar JavaScript diretamente na página real do app, incluindo cliques nos botões
reais e inspeção do estado do `<audio>`. Isso confirmou o mecanismo exato do bug e validou a
correção antes de fechar: um teste limpo (processo novo, arquivo de posição preparado com 77s,
um único clique em "acompanhar", 5s de espera) mostrou `player.currentTime === 77` ao final.

**Validação:** TDD — teste estático de `electron/tests/frontend-quality.test.js` reescrito para
verificar a ordem relativa (leitura antes da troca de fonte) via índice de substring no corpo de
`playInApp` e `openTeleprompter`, a existência da função `seekWhenReady` compartilhada, e o guard
`if (player.paused) return;` no listener de salvamento. Suíte Electron completa (48 testes, 1 skip
esperado) e `eslint --max-warnings=0` limpos. Suíte Python completa (442 testes) confirmada sem
alteração. Validação adicional ao vivo via CDP, conforme descrito acima — não só testes estáticos
desta vez.

**Risco que sobrou:** a validação ao vivo cobriu o caminho principal (app novo → abrir teleprompter
→ resume correto) uma vez; não foram testados exaustivamente todos os cenários de troca rápida
entre chunk-review/teleprompter/dock que os testes estáticos descrevem. O ambiente de teste (Xvfb +
Electron sob sandbox) se mostrou instável para sessões muito longas ou repetidas rapidamente —
processos ocasionalmente falharam ao subir ou a reproduzir de forma consistente entre tentativas
consecutivas, então parte da investigação combinou evidência ao vivo com análise estática do código.

## 2026-07-27 — Extração de PDF migrada para Poppler (texto vinha com palavras partidas)

**O que mudou:** a extração de PDF passou a usar `pdftotext` (Poppler) como via principal, com
`pypdf` mantido apenas como reserva. Antes, `_extract_pdf` (`src/audiofy/file_extraction.py`)
usava `pypdf` direto, que parte palavras em PDFs de livro diagramado: no arquivo real de "O
cavaleiro preso na armadura" o texto extraído trazia 276 quebras do tipo `"cav a-\nleiro"` (em vez
de `"cavaleiro"`), `"men ção"`, `"drag ões"`, `"Chris topher"`. Como os modos de leitura fiel
(`verbatim`/`reflexive`) garantem por asserção que o texto não muda depois da ingestão
(`pipeline.py`), o defeito atravessava o pipeline inteiro e chegava quebrado no áudio e no
teleprompter.

**Por que:** medição direta no mesmo PDF — `pypdf` produzia 276 quebras de hifenização; `pdftotext`
produz **zero**, e ainda recupera palavras que no `pypdf` nunca apareciam inteiras (`menção`,
`patrão`, `predileção` iam a 0 ocorrências). Como a extração acontece na camada de texto do PDF,
o ganho independe do idioma do documento. O defeito é específico de PDF: DOCX/EPUB/TXT armazenam
texto por parágrafo, sem layout de página, então não há hifenização de fim de linha para quebrar —
verificado por execução nos três formatos.

**Alternativa descartada:** uma primeira tentativa corrigia o texto *depois* de extraído — regex +
dicionário `hunspell pt_BR` + vocabulário do próprio documento, e uma passada opcional por LLM
(`--fix-hyphenation` na bridge + checkbox na UI, commit `769463d`). Foi removida: cobria só ~25 dos
~270 casos, exigia heurística frágil (`"mas eu"` não pode virar `"maseu"`, o que obrigou a descartar
sufixos ambíguos), custava créditos de IA por arquivo e só funcionava para português — enquanto a
troca de extrator resolve 100% dos casos, de graça, em qualquer idioma. Corrigir na origem se
mostrou estritamente melhor que remendar depois.

**Sobre idioma:** a detecção e a tradução automática já existiam e continuam valendo —
`detect_language()` (`languages.py`) seguido de `_translate_if_needed()` (`pipeline.py`), que traduz
para o idioma configurado e cacheia em `translation.json`. Verificado na prática: dos 8 itens em
`data/inbox/`, 3 artigos foram detectados como `en` e 5 como `pt-BR`.

**Validação:** TDD — 4 testes novos em `tests/unit/test_file_extraction.py` (`PdftotextTest`)
cobrindo via principal, reserva quando o binário falta, reserva quando o processo falha e reserva
quando o Poppler devolve texto vazio (PDF escaneado, que segue para OCR). Suíte Python completa:
446 testes passando. `ruff check` e `ruff format` limpos; `node --check` no renderer OK. Execução
real, não só teste: o PDF do cavaleiro extraído pelo app dá `method=pdftotext`, 98.232 chars e 0
quebras; outros 4 PDFs de origens diferentes também deram 0. A reserva foi exercitada de verdade
(simulando ausência do binário): cai para `pypdf`, extrai 96.936 chars com as 276 quebras
conhecidas — degrada, mas não falha. `setup-check` da bridge agora reporta "Leitor de PDF
(Poppler)" no Diagnóstico.

**Risco que sobrou:** o Poppler é dependência de sistema (`poppler-utils`), não pacote Python — em
máquina sem ele a extração continua funcionando pela reserva, mas volta a produzir texto com
palavras partidas. O Diagnóstico sinaliza a ausência, porém a instalação não é automática como a
dos pacotes Python. Os arquivos do episódio do cavaleiro já ingeridos seguem com o texto corrigido
manualmente antes desta mudança (~254 dos ~270 casos); para ficarem 100% corretos precisariam ser
reimportados do PDF original com o extrator novo — o áudio já gerado não foi refeito.

## 2026-07-27 — Áudio desacoplado das janelas e reextração de arquivo já importado

**O que mudou (player):** o elemento `<audio>` deixou de ser movido pelo DOM entre o dock e os
modais. Antes, `movePlayerTo`/`movePlayerHome` faziam `appendChild` — que **move** o elemento, não
copia — para "emprestar" o player a quem abrisse a revisão de chunks ou o teleprompter. Mover um
`<audio>` em reprodução faz o Chromium reiniciar a mídia, e o player voltava mudo ao dock. Agora o
player mora no dock e nunca sai; os modais ganharam transporte próprio (`bindModalTransport`) que
comanda esse player e espelha o estado dele.

**Bugs que isso corrige:** abrir "acompanhar" com o episódio tocando **pausava o áudio**
(`openTeleprompter` chamava `pause()` logo após mover o player); fechar a revisão de chunks
**destruía a fonte** do player (`removeAttribute("src")` + `load()`), deixando o dock sem mídia
carregada — mesmo defeito já corrigido no teleprompter em `769463d`, que continuava presente no
caminho dos chunks. Como o dock passou a hospedar o player de forma permanente,
`ensurePlayerDockVisible()` garante que ele fique à vista com um modal aberto, senão não haveria
como pausar o que está tocando.

**O que mudou (reextração):** `CustomSource.add_text` passou a aceitar `source_file`, gravado no
frontmatter, e ganhou `replace_text`, que troca o corpo preservando id, título e metadados. O
comando `reextract-file <item-id>` reprocessa o arquivo original com a extração atual, e a
interface mostra "🔄 Reextrair do arquivo" no item quando há origem registrada.

**Por quê:** a troca do extrator para Poppler (`b75fc3c`) não alcançava itens já importados — o
`.md` guardava só o texto, não a procedência. A única saída era reenviar o arquivo, o que criava
item duplicado (`add_text` gera `-2`, `-3`… quando o id colide) em vez de corrigir o existente.
Regerar o episódio também não resolvia: a geração lê o `.md` de `data/inbox/`, nunca o PDF.

**Correção pontual aplicada:** o texto-fonte do episódio "O cavaleiro preso na armadura" foi
reextraído do PDF original e regravado no mesmo `item_id` — 28 hifenizações partidas e 43
ocorrências de palavras quebradas (`drag ões`, `n ão`, `cabe ça`, `come çou`) foram a zero;
16.605 → 16.783 palavras. O áudio já gerado **não** foi refeito (custo de TTS): para o episódio
refletir o texto correto é preciso gerar novamente.

**Validação:** TDD nas duas frentes. Além dos testes estáticos de `frontend-quality.test.js`
(reescritos para exigir a arquitetura nova), foi criado `tests/player-transport.test.js`, que
avalia as funções reais de `renderer.js` em um DOM mínimo e verifica **comportamento**: abrir um
modal não pausa, não perde a posição e não descarta a fonte; o botão reflete mudanças feitas fora
do modal; fechar solta os listeners sem vazar. Suítes completas: 58 testes Electron (57 pass, 1
skip esperado) e 454 Python, `ruff` e `eslint --max-warnings=0` limpos. O ciclo de reextração foi
exercitado de verdade pela bridge: origem gravada no frontmatter, arquivo alterado, `reextract-file`
atualizando o texto sem criar item novo, e a mensagem correta para item sem origem.

**Risco que sobrou:** não foi possível validar com o app Electron em execução — o binário do
Electron não sobe neste ambiente porque `ELECTRON_RUN_AS_NODE=1` está fixa no ambiente do agente e
faz o processo rodar como Node puro (`app` fica `undefined` em `main.js`). A cobertura de
comportamento acima roda o código real do renderer, mas em DOM simulado: resta confirmar no app o
fluxo completo de abrir/fechar os modais com áudio tocando. Itens importados antes desta mudança
não têm `source-file` e continuam exigindo reenvio do arquivo — só novas importações registram a
origem.

## 2026-07-27 — Segmentos órfãos desligavam o acompanhamento; dock sem nome do episódio

**O que mudou:** a síntese passou a apagar, ao final, os áudios de gerações anteriores que
sobraram na pasta `segments/` (`_discard_orphan_segments`), e abrir o acompanhamento (ou tocar um
chunk avulso) passou a nomear o episódio no dock.

**Por que (órfãos):** o total de trechos entra no nome do arquivo de cada segmento. Reextrair o
texto de "O cavaleiro preso na armadura" mudou a divisão de 112 para 195 trechos, então os novos
(`de-195`) ganharam nomes diferentes dos antigos (`de-112`) em vez de sobrescrevê-los — a pasta
ficou com 307 arquivos de duas gerações. O MP3 final usa só os 195 do manifesto, mas
`audio-chunks` lista o que está no diretório: o teleprompter passou a mostrar 307 trechos com
parágrafos duplicados e, como os órfãos não têm duração auditada, `_add_cumulative_timing` anulou
a janela temporal de **todos** (uma soma parcial daria posições erradas). Sem timing,
`hasTiming` fica falso e o teleprompter desliga o destaque automático e o pulo por parágrafo — foi
o que o usuário reportou como "não dá mais pra ver onde ele está lendo nem clicar no trecho".

**Por que (título do dock):** com o player fixo no dock (mudança de `d06c6cb`), ele fica à vista
com o modal aberto. `openTeleprompter` troca a fonte do player mas nunca chamou
`setPlayerSource`, que é quem escreve `player-title` — o dock anunciava "Nenhum episódio
selecionado" enquanto tocava aquele episódio. O mesmo valia para a revisão de chunks, que agora
mostra qual trecho está tocando.

**Correção pontual aplicada:** os 112 WAVs órfãos do episódio do cavaleiro foram retirados da
pasta (backup fora do repositório). Com isso `audio-chunks` voltou a 195 trechos, todos com
`start_seconds`, e `hasTiming` voltou a ser verdadeiro.

**Validação:** TDD nas duas frentes. Três testes novos em `test_pipeline_resume.py`
(`SegmentosOrfaosTest`) cobrem remover o áudio da geração anterior, preservar os da atual e não
tocar em arquivos que não sejam áudio; um teste novo em `frontend-quality.test.js` exige o título
no dock ao abrir o acompanhamento. Todos confirmados falhando antes da implementação. Suítes
completas: 457 testes Python e 59 Electron (58 pass, 1 skip esperado), `ruff` e `eslint` limpos.
Verificação real pela bridge: `audio-chunks` saiu de 307 trechos com 112 sem duração (hasTiming
falso) para 195 com timing completo (hasTiming verdadeiro).

**Risco que sobrou:** a limpeza roda ao fim da síntese, então uma geração interrompida no meio
ainda deixa órfãos até a próxima execução completar — o que não impede a retomada, porque ela é
guiada pelo manifesto, não pela varredura do diretório. Episódios antigos que já acumularam
órfãos de execuções anteriores só serão limpos quando forem regerados. E, como nas mudanças
anteriores desta sessão, não foi possível validar com o app Electron em execução neste ambiente
(`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como Node puro).

## 2026-07-29 — Benchmark real do paralelismo: 8x mais rápido em 12 trechos

**O que mudou:** nada no código — só a validação. A entrada anterior já tinha rodado uma
geração real com `tts_max_concurrency=4`, mas a tentativa de comparar contra
`tts_max_concurrency=1` na mesma sessão de testes saiu contaminada: a chave usada nas duas
rodadas parece ter esbarrado em rate limit, e a rodada sequencial (2 trechos em 226s) ficou
artificialmente lenta — sem valor como benchmark.

**Medição limpa:** repeti o teste com **duas chaves diferentes** (uma pra cada rodada, evitando
qualquer rate limit cruzado) e um lote mais próximo de um episódio de verdade — 12 falas de
texto corrido, não frases soltas de teste, ainda no modelo `hexgrad/kokoro-82m`:

| Concorrência | Trechos | Duração | Custo |
| --- | --- | --- | --- |
| 1 (sequencial) | 12 | **707,3s** | US$ 0,00104 |
| 4 (paralelo) | 12 | **88,3s** | US$ 0,00104 |

**8,01× mais rápido**, custo idêntico nas duas rodadas (mesmo texto, mesmo áudio gerado) —
o paralelismo não muda quanto se paga, só quanto se espera. Ordem dos 12 segmentos confirmada
correta (`chunk-001` a `chunk-012`) nas duas rodadas.

**Um número, não uma constante.** 707,3/4 ≈ 176,8s seria o teto teórico com concorrência 4 e 0%
de overhead; o resultado medido (88,3s) veio bem abaixo disso. A explicação mais honesta não é
"o paralelismo rendeu mais que o esperado" — é que as duas rodadas usaram **chaves diferentes**
(de propósito, para não repetir a contaminação por rate limit da tentativa anterior), e a
latência por chamada do OpenRouter/Kokoro no momento de cada rodada não é garantidamente igual
entre chaves ou ao longo do tempo. 8,01× é uma medição real e válida de uma execução, não uma
constante reproduzível — o valor útil aqui é a ordem de grandeza (perto de 1 minuto e meio contra
quase 12 minutos para o mesmo lote), não a segunda casa decimal.

**Risco que sobrou:** atualiza a entrada anterior — `tts_max_concurrency=4` é um teto de
segurança, não uma previsão de ganho; o ganho real por episódio vai variar com a latência do
provedor no momento da geração. Continua valendo o mesmo risco já registrado: sem rate-limit
awareness do lado do provedor, só o teto configurável.

## 2026-07-29 — Síntese de TTS em paralelo (chamadas ao OpenRouter deixam de ser uma por vez)

**O que mudou:** `_synthesize_turns` (`src/audiofy/pipeline.py`) sintetizava um trecho por vez,
esperando a resposta do OpenRouter antes de mandar o próximo — o maior gargalo de tempo numa
geração longa, porque a maior parte da espera é rede, não processamento. A fase de síntese agora
roda em paralelo com `concurrent.futures.ThreadPoolExecutor`, com o teto configurável em
`Settings.tts_max_concurrency` (env `AUDIOFY_TTS_MAX_CONCURRENCY`, padrão 4, intervalo 1-16,
seguindo o mesmo padrão de `tts_retry_attempts`).

Desenho: a chamada de rede (`_synthesize_one_turn`, nova função extraída do corpo do loop antigo)
roda livre em threads de worker; só a thread coordenadora toca o manifesto (`segments.json`),
`paths`/`skipped` e o progresso, consumindo os resultados via `as_completed` — isso evita
precisar de trava em quase tudo. Só dois pontos realmente compartilhados entre threads
precisaram de trava:

- `GenerationTracker` (`src/audiofy/runtime/status.py`) ganhou um `threading.RLock` interno,
  porque `checkpoint()`/`using_key()`/`retrying()`/`record_error()` são chamados de dentro de
  cada worker (via `_synthesize_with_retry`) e faziam read-modify-write sem proteção — sob
  concorrência de verdade isso perdia incrementos de custo.
- `exhausted_keys` (o set de chaves que já responderam "sem saldo" nesta geração, para não
  reconsultá-las trecho a trecho) ganhou um `threading.Lock` próprio, porque agora várias falas
  podem descobrir/marcar isso ao mesmo tempo.

A ordem final dos segmentos **não precisou de nenhum ajuste**: `paths` já era montado a partir de
`plans` (ordem original dos turnos) antes de qualquer síntese, só sofrendo remoções em caso de
skip — nunca *append* em ordem de conclusão — então a montagem final (`_assemble`, que concatena
por ordem de lista) continua correta mesmo com trechos terminando fora de ordem.

**Por que:** anotado pelo usuário como task simples de otimização de tempo; o programa atual
divide o roteiro em parágrafos/frases e manda um de cada vez para o OpenRouter, e a ideia
(registrada primeiro como task no Notion, com o design detalhado) é disparar vários ao mesmo
tempo e o próprio programa remontar a ordem certa depois.

**Validação:** TDD em cada camada, testes escritos e confirmados falhando antes da mudança de
produção:

- `tests/unit/test_status.py` — 3 testes novos de concorrência no `GenerationTracker`, usando
  `sys.setswitchinterval(1e-6)` + `threading.Barrier` para tornar a corrida determinística (sem
  isso, poucas threads com trabalho trivial raramente cruzam no meio do GIL). Falhavam de forma
  reprodutível (ex.: `2.9 != 3.0`) antes do `RLock`; passam de forma estável depois (rodado 3×).
- `tests/unit/test_pipeline_parallel_synthesis.py` (novo arquivo, separado de
  `test_pipeline_resume.py` por responsabilidade) — 7 testes cobrindo: paridade com
  `tts_max_concurrency=1`; ordem final 1..N preservada quando o trecho 3 é forçado (via
  `threading.Event`) a terminar antes do trecho 1 com concorrência 3; cache-hit nunca entra no
  executor; erro real propaga sem travar a geração; `GenerationAborted` disparado dentro de uma
  worker thread encerra tudo; trecho mudo ainda vira skip sob concorrência; duas falas
  descobrindo a mesma chave esgotada ao mesmo tempo (via `threading.Barrier`) não corrompem o
  set nem duplicam chamada. 2 dos 7 falhavam contra o pipeline sequencial antigo (os que exigem
  conclusão fora de ordem de verdade); os outros 5 já valiam sequencialmente, o que é esperado.
- Suíte completa: **510 testes Python** (eram 497; 13 novos) e **72 Electron** (71 pass, 1 skip
  esperado), `ruff check` limpo, cobertura 73% (mínimo 70%).
- **Geração real** contra a API do OpenRouter (modelo `hexgrad/kokoro-82m`, perfil "reset de
  leitura ultraeconomico"), com autorização explícita do usuário para gastar crédito: 8 trechos
  reais sintetizados com `tts_max_concurrency=4` em 66,2s, ordem `chunk-001` a `chunk-008`
  confirmada nos nomes dos arquivos, custo total US$ 0,000544. Uma comparação cronometrada contra
  `tts_max_concurrency=1` foi tentada, mas a bateria de testes reais em sequência nesta mesma
  sessão parece ter esbarrado em rate limit da chave (2 trechos sequenciais levaram 226s — muito
  acima do esperado para o Kokoro, consistente com a política de retry/backoff tendo entrado em
  ação), então não virou um benchmark limpo de "antes vs. depois"; a evidência que importa aqui —
  correção (ordem, sem corrupção de manifesto, custo computado certo) — ficou confirmada contra o
  serviço real, não só mockada.

**Risco que sobrou:** o OpenRouter não documenta limite de concorrência por chave, então o teto
de `tts_max_concurrency` é um valor conservador sem embasamento formal do provedor — quem usa uma
chave de tier baixo pode precisar reduzir via `AUDIOFY_TTS_MAX_CONCURRENCY`. Um erro fatal em um
trecho cancela os que ainda não começaram (`executor.shutdown(cancel_futures=True)`), mas os que
já estavam em voo no momento do erro continuam rodando em segundo plano até terminar (podem ser
cobrados) — o processo não espera por eles antes de propagar o erro, então em teoria pode haver
uma janela onde o processo Python demora a encerrar de fato se uma dessas chamadas ficar presa
até o timeout de 300s do provedor. Não afetei `repair_episode`: ela reusa `_synthesize_turns`,
então ganha o paralelismo automaticamente. Observação à parte, não deste risco: `ruff format
--check` já falhava em 4 arquivos antes desta mudança (`cost_analytics.py`, `sources/custom.py`,
`test_narration.py`, `test_pipeline_resume.py`) por divergência entre a versão do `ruff` instalada
neste ambiente e a que formatou o repositório por último — não mexi nesses arquivos fora do que
esta task exigia, para não misturar refatoração alheia à mudança.

## 2026-07-28 — Resgate desistia na primeira resposta vazia, mas o vazio é intermitente

**O que mudou:** o usuário relatou que o trecho `38m57s`, que antes era convertido corretamente,
voltou a ser pulado — com o log mostrando o resgate sendo **tentado** e mesmo assim falhando:
`↻ Fala 19 veio muda; tentando como '38 minutos e 57 segundos'` seguido de `⚠ Fala 19 pulada`.

**Medição que derrubou minha premissa anterior.** Chamei a API 4 vezes seguidas com o **mesmo
texto resgatado**, mesma chave e mesmo modelo (Gemini TTS / Zephyr): **falhou 2, funcionou 2**. O
áudio vazio **não é determinístico** para trechos curtos — ao contrário do que a entrada
"Áudio vazio falha de imediato" afirmou e usou como justificativa.

A correção daquela entrada continua certa para o **texto original** (`38m57s` falhou em 100% das
tentativas medidas), mas estava sendo aplicada também ao **texto já resgatado**, onde o vazio é
intermitente. Resultado: bastava um vazio isolado no resgate para o trecho ser descartado.

`_synthesize_with_retry` ganhou `retry_empty_audio`, ligado apenas na chamada do resgate. O texto
original segue falhando rápido (sem gastar ~32s por trecho); o texto pronunciável recupera as
tentativas com espera, que é o que a intermitência exige.

**Sobre o log do usuário:** ele ainda mostrava `/87`, o que indica execução lançada **antes** da
reversão da divisão de tabelas — o processo em memória tinha o código antigo. Confirmado que o
disco já estava correto (`_split_dense_tables` ausente do pipeline). O pulo relatado, porém, era
real e independente disso.

**Validação:** TDD, teste confirmado falhando antes (resgate falha uma vez, acerta na seguinte, e
o trecho não pode ser perdido). Suítes: **497 testes Python** (eram 496), `ruff check` limpo.
Verificação ao vivo contra a API: **3 de 3 rodadas** do trecho `38m57s` geraram o segmento, sem
nenhum pulo — antes o resultado variava com a sorte da primeira chamada.

**Risco que sobrou:** se todas as tentativas do resgate caírem em vazio, o trecho ainda é pulado —
agora com muito menos probabilidade, mas não zero. A intermitência é do provedor e não temos
controle sobre ela; o que mudou foi parar de amplificá-la com uma decisão de desistir cedo demais.

## 2026-07-28 — Reverte a divisão de tabelas: ela invalidava o cache e regerava o episódio inteiro

**O que mudou:** o usuário clicou em "reparar" um único segmento e a geração recomeçou do zero,
consumindo créditos de novo. **Regressão minha**, introduzida junto da entrada anterior.

**Causa:** o total de trechos faz parte do nome de cada arquivo de segmento
(`chunk-026-de-082`). `_split_dense_tables` quebrava o turno da tabela em pedaços, transformando
**82 turnos em 87** — o que mudava o sufixo `de-082` para `de-087` em **todos** os nomes.
Nenhum segmento em cache era reconhecido, e o pipeline ressintetizava as 87 falas. Medido no
episódio real: 0 de 82 nomes batiam; depois da reversão, **82 de 82**.

**Por que reverter em vez de corrigir o nome:** a divisão nunca resolveu o problema que motivou.
Testes ao vivo mostraram que o modelo **se recusa a ler tabela crua em qualquer fatia** — fatia
da tabela falha, a mesma fatia sem emojis também falha, e só a versão narrada
("Décimo quinto: Nex N2 Pro, nota 83.") funciona. A divisão reduzia o tempo (7,5 min → ~3 min)
mas continuava perdendo pedaços, e agora se provou capaz de causar dano ativo. Consertar a
nomenclatura manteria uma solução que não soluciona.

O detector (`looks_like_dense_table`) e o divisor (`split_dense_table`) **permanecem em
`narration.py`, com seus testes**: a análise que os produziu é válida e serve à correção
definitiva, que depende de decisão do usuário (narrar a tabela via IA × anunciar e pular).

**Validação:** TDD. Teste novo (`TurnCountStabilityTest`) trava a invariante que faltava: um turno
de entrada vira exatamente um segmento, e o total no nome do arquivo corresponde ao número de
turnos. Confirmado falhando antes da reversão (4 turnos viravam 6). Suítes: **496 testes Python**,
`ruff check` limpo. Verificação no episódio real do usuário: 82 de 82 nomes voltaram a bater com
o `segments.json` existente.

**Lição registrada:** eu havia validado a divisão só pela síntese isolada do trecho, sem exercitar
o caminho de retomada/reparo — que é onde o nome do arquivo importa. Uma mudança que altera a
contagem de turnos toca a identidade de todos os artefatos do episódio, e isso não aparece num
teste que sintetiza um turno só.

## 2026-07-28 — Episódio reflexivo era reportado como "sem roteiro auditável"

**O que mudou:** o usuário mostrou o app dizendo "A execução anterior falhou na etapa
inicialização. O episódio não tem roteiro auditável" — junto de um log em que o **mesmo episódio
foi gerado com sucesso** (82/82 chunks, MP3 pronto, US$ 0,7809). Dois sinais contraditórios.

A causa está em `_turns` (`episode_verification.py`), que procurava o roteiro em apenas dois
arquivos: `narration-script.json` (verbatim) e `script.json` (adaptation). A **leitura reflexiva
grava `reflexive.json`**, que não estava na lista — então todo episódio reflexivo caía no
`FileNotFoundError`, por mais completo que estivesse.

**O impacto era maior que a mensagem sugeria.** `_turns` tem três chamadores, e um deles é o
`repair_episode` (`pipeline.py:192`). Ou seja: **o reparo seletivo de segmentos estava
indisponível para o modo reflexivo** — justamente o que eu havia sugerido ao usuário na conversa
anterior para tratar o chunk 30 com silêncio crítico. A sugestão teria falhado com este mesmo
erro. `generation_mode` já aceitava `"reflexive"` em `generate_episode`; só a resolução do
artefato estava incompleta.

**Validação:** TDD, teste confirmado falhando antes. Cobre o reconhecimento do roteiro reflexivo e
mantém o erro para episódios realmente sem roteiro. Verificação no episódio real do usuário:
`_turns` agora devolve `("reflexive", 82 turnos)` — antes levantava exceção. Suítes completas:
**496 testes Python** (eram 494) e 72 Electron (71 pass, 1 skip esperado), `ruff check` e
`npm run check` limpos.

**Risco que sobrou:** a lista de artefatos de roteiro continua sendo uma tabela fixa em
`_turns` — um modo novo de geração precisará ser adicionado nos dois lugares (o que escreve e o
que lê), e o sintoma de esquecer é exatamente este: geração bem-sucedida com verificação
falhando. Um registro único de "modo → arquivo de roteiro" evitaria a divergência, mas é
refatoração de escopo maior que esta correção.

## 2026-07-28 — Geração "travava" na fala 30: tabela colapsada virava 7,5 minutos de áudio numa chamada

**O que mudou:** o usuário relatou que a geração parecia travada na fala 30. Investigando o
`reflexive.json` do episódio, a fala 30 é uma **tabela de ranking do artigo colapsada em texto
corrido** — 1.590 caracteres do tipo `RankModeloScoreTierRubyLLM OKTempoCusto da
rodada1Claude Opus 5 (Claude Code)*95A✅39m…`.

**O diagnóstico só fechou com medição ao vivo, e contrariou minha hipótese inicial.** Eu supus
mais um caso de áudio vazio. Não é: a API **responde com sucesso** — devolvendo **21,7 MB**, ou
**7,5 minutos de áudio** para um único trecho, contra 2 a 5 segundos dos trechos normais (121×
maior). O modelo soletra número a número o que na página era uma grade visual. Com `_TIMEOUT=300`
por tentativa e até 5 tentativas, um trecho desses pode ocupar minutos de relógio sem nada mudar
na tela — daí a impressão de travamento. Não havia erro para o retry classificar.

**Por que passava batido:** o trecho tem 1.590 caracteres e `MAX_TTS_CHARS` é 2.400, então a
divisão normal não o alcançava. O tamanho não era o problema; a **densidade** era.

`looks_like_dense_table` (`narration.py`) usa a densidade de dígitos como sinal: a tabela real tem
**26% de dígitos**, enquanto prosa com datas e números raramente passa de 5% (limiar em 12%, só
para trechos ≥ 400 caracteres, para não colidir com o tratamento de `38m57s`). `_split_dense_tables`
quebra o turno em pedaços de 300 caracteres antes da síntese, preservando o texto **caractere a
caractere** — a concatenação dos pedaços é idêntica ao original, então a leitura segue integral.

**Verificação no episódio real:** o detector marca **exatamente o turno 30** entre os 82 — nenhum
falso positivo nos outros 81.

**Validação:** TDD, todos confirmados falhando antes. Testes cobrem detecção da tabela, prosa longa
com números **não** confundida, trecho curto fora do escopo, e — no pipeline — divisão em várias
chamadas com a garantia de que a concatenação não perde texto. Suítes: **492 testes Python**
(eram 487), `ruff check` limpo.

**Erro meu no processo:** o primeiro exemplo de tabela do teste tinha 166 caracteres, abaixo do
mínimo de 400, e falhava por motivo errado; troquei por uma amostra com a densidade real. Também
adicionei o import no bloco errado numa primeira tentativa, quebrando 21 testes — a suíte pegou.

**Risco que sobrou:** o limiar de 12% é heurístico. Uma tabela pouco numérica (só texto em
colunas) não é detectada, e um trecho legítimo muito denso em números seria dividido sem
necessidade — o que degrada a prosódia nas junções, mas não perde conteúdo. A causa raiz é a
extração, que colapsa tabelas HTML em vez de preservar a estrutura; tratar isso na extração seria
a correção definitiva e tem escopo maior.

## 2026-07-28 — Áudio vazio falha de imediato em vez de gastar 5 tentativas (e validação ao vivo do resgate)

**O que mudou:** o usuário voltou com um log mostrando que a fala 19 falhava sempre, no mesmo
trecho, mesmo depois da correção anterior. Investigando o episódio real
(`reflexive.json`), a fala 19 é `'38m57s'` isolado — item de uma lista de métricas do artigo,
conteúdo legítimo.

`_is_empty_audio_error` já classificava o caso, mas o erro nasce com `retryable=True` em
`openrouter.py`, então a política de retry gastava **5 tentativas com espera exponencial**
(2,3s + 4,7s + 8,7s + 16s ≈ 32s por trecho) antes de desistir — para chegar a uma conclusão que o
próprio comentário do código já reconhecia como determinística: o texto enviado é o mesmo a cada
tentativa, o modelo devolve o mesmo vazio. Agora esse caso falha na primeira ocorrência e o
resgate (`speakable_fallback`) entra em seguida.

**Validação ao vivo, contra a API real** — o que faltava na entrada anterior. Com uma das chaves
ilimitadas do cofre:

- `'38m57s'` → **falha** com "resposta vazia ou curta demais" (defeito reproduzido);
- `'38 minutos e 57 segundos'` → **OK**, 180.480 bytes (resgate válido);
- `'201 turnos'` (fala 20, vizinha) → OK, confirmando que o problema é específico do formato.

Cenário completo do log do usuário (falas 18-20, incluindo a que falhava): **3/3 segmentos
gerados em 34,1s**, com `↻ Fala 2 veio muda; tentando como '38 minutos e 57 segundos'` no meio.
Antes eram 2/3, com a fala 19 perdida.

**Fallback de chaves — verificado, funciona.** O usuário perguntou explicitamente. Teste ao vivo:
a chave ativa devolveu 402, a rotação passou para a seguinte e a síntese retornou 147.840 bytes
reais. Descobertas do diagnóstico: o cofre tem **3** chaves (não 2 como o painel do OpenRouter
sugere) e **duas são ilimitadas**; a chave ativa ("Chave Audio Teste") tem teto de US$ 6 e estava
com **US$ 0,07**, o que explica o 402 constante — não é a conta sem saldo (há US$ 7,29).

**Validação:** TDD. Teste novo exige que áudio vazio não repita e que `_wait_for_retry` nem seja
chamado. Três testes existentes precisaram de ajuste porque alimentavam 3 respostas vazias
simulando o esgotamento de tentativas que não acontece mais — expectativa desatualizada, não
regressão de comportamento. Suítes: **487 testes Python** (eram 486), `ruff check` limpo.

**Sobre o processo:** persegui uma hipótese errada de escopo de variável do `except` antes de
instrumentar o código e descobrir que `synthesis` **não** era `None` — o resgate já funcionava, e
o "pulada" que eu via vinha de execuções anteriores do meu próprio teste exploratório. Registro
porque medir teria sido mais rápido que teorizar.

**Risco que sobrou:** ganho de tempo real por trecho mudo é de ~32s para ~0s mais o resgate, mas
`speakable_fallback` segue cobrindo só marcas de tempo, relógio e códigos sem espaço; outros
formatos mudos continuarão pulados até aparecerem em uso. A mensagem "sem saldo na conta" é
imprecisa quando a causa é o teto da chave, e ficou fora do escopo.

## 2026-07-28 — Trecho mudo não é mais pulado, e chave esgotada não é reconsultada a cada fala

**O que mudou:** dois defeitos relatados a partir do log de uma geração real.

**1. Conteúdo perdido em silêncio.** Quando o TTS devolvia áudio vazio para um trecho, o pipeline
pulava a fala e seguia (`⚠ Fala 19 pulada … '38m57s'`). O episódio saía **incompleto** sem falhar —
inaceitável numa leitura que promete ser integral. O desenho original supunha que esses trechos
fossem lixo de diagramação (rodapés, marcas de página), mas o caso real era uma **marca de tempo**:
conteúdo legítimo do texto.

`speakable_fallback` (`narration.py`) reescreve o trecho numa forma pronunciável antes de desistir:
`38m57s` → `"38 minutos e 57 segundos"`, `12:34` → `"12 minutos e 34 segundos"`, `v2.1.0` →
`"v2 ponto 1 ponto 0"`. O pulo continua existindo para o que realmente não tem o que falar (só
pontuação/símbolo), com o manifesto guardando o **texto original**, para a revisão seguir batendo
com a fonte.

**2. Chave esgotada reconsultada trecho a trecho.** `_synthesize_with_retry` montava a lista de
chaves do zero a cada fala, então uma chave sem saldo era tentada **1× por trecho** — no log do
usuário, dezenas de `↪ … sem saldo; tentando …`, cada uma com sua latência. Agora um
`exhausted_keys` compartilhado por toda a síntese remove da lista as chaves que já responderam
"sem saldo". Se **todas** estiverem esgotadas, a lista completa é mantida de propósito: o erro real
do provedor é mais útil que uma falha inventada localmente.

**Diagnóstico que a imagem do usuário confirmou:** o `402` não significava conta sem saldo — a
conta tinha US$ 7,29. Era o **limite mensal de US$ 1 de uma das chaves**, que o OpenRouter reporta
como 402 para aquela chave. A mensagem "sem saldo na conta" é imprecisa nesse caso, mas foi
mantida fora do escopo desta correção.

**Validação:** TDD, todos os testes confirmados falhando antes. `test_narration.py` cobre as
reescritas e os casos sem resgate; `test_pipeline_resume.py` cobre trecho mudo resgatado, trecho
sem salvação ainda pulado, e a chave esgotada tentada **uma única vez** ao longo de três falas.
Suítes completas: **486 testes Python** (eram 477) e 72 Electron (71 pass, 1 skip esperado),
`ruff check` e `npm run check` limpos.

**Erro meu no processo:** duas expectativas erradas nos testes — a contagem de tentativas do mock
(a política é 3, não 5) e a leitura esperada de `v2.1.0`. Nos dois casos o teste estava errado, não
o código; corrigi os testes. Registro porque um teste que falha pelo motivo errado não valida nada.

**Risco que sobrou:** `speakable_fallback` cobre marcas de tempo, relógio e códigos sem espaço —
outros padrões mudos continuarão sendo pulados até aparecerem em uso real. Não consegui reproduzir
a falha ao vivo contra o provedor (chave sem crédito no momento), então a correção foi verificada
por teste e leitura de código, não contra a API. O `ruff format --check` segue apontando
`cost_analytics.py` e `sources/custom.py`, pré-existentes e não tocados aqui.

## 2026-07-28 — Aviso de variante do português e opção de forçar o idioma no TTS

**O que mudou:** o usuário relatou que modelos multilíngues puxam a leitura para português de
Portugal, alternando de sotaque no meio do episódio. A investigação mostrou que o payload de
`text_to_speech` não enviava **nenhum** sinal de idioma — todas as instruções já dizem "português
brasileiro", mas elas vão no campo `instructions`, que é opcional e cada modelo respeita ou ignora
à vontade. Modelos com detecção automática decidem pelo texto e tratam "português" como um só.

Três camadas novas:

- **Metadados por modelo** (`src/audiofy/voices.py`): `LANGUAGE_AMBIGUOUS_MODELS` (Grok, Gemini,
  MiniMax, dois Qwen — detectam idioma) e `LANGUAGE_FORCING_MODELS` (só os dois MiniMax).
- **Envio do parâmetro** (`providers/openrouter.py`): `language_boost` no payload, apenas para os
  modelos da segunda lista, e apenas quando o perfil pede.
- **Interface**: aviso abaixo do seletor de TTS quando o modelo é ambíguo, e caixa "Forçar o
  idioma configurado no perfil" quando ele aceita o parâmetro. A escolha é persistida no perfil
  (`Profile.force_language` → `Settings.force_language`).

**Verificação ao vivo, não documentação:** `supported_parameters` da API **não lista**
`language_boost` em nenhum modelo, então testei na prática. No MiniMax, valores diferentes
(`Portuguese`, `Japanese`, `Chinese`) produzem áudios de tamanhos bem distintos — o parâmetro
funciona de verdade. No Grok o teste foi **inconclusivo**: o modelo não é determinístico nem com
`seed` fixo, então não dá para separar o efeito do parâmetro da variação natural entre execuções.
Por isso o Grok ficou fora de `LANGUAGE_FORCING_MODELS` — ele só recebe o aviso.

**Armadilha encontrada:** o provedor aceita `language_boost` com valor inválido (`XYZ_invalido`)
respondendo **HTTP 200**, tratando como automático. Não há validação nem erro. Por isso o valor
enviado vem sempre de uma tabela interna, nunca de texto do usuário: um valor errado falharia em
silêncio, parecendo resolvido sem estar.

**Por que opt-in:** sem a caixa marcada, o comportamento anterior é preservado byte a byte. Forçar
para todo mundo mudaria o áudio de perfis existentes sem aviso.

**Validação:** TDD em todas as camadas, com os testes confirmados falhando antes. Suítes completas:
**477 testes Python** (eram 471) e **72 Electron** (71 pass, 1 skip esperado, eram 69),
`ruff check` e `npm run check` limpos. Verificação real pela bridge: 6 modelos marcados como
ambíguos, 2 como forçáveis, `language_boost_value` devolvendo `Portuguese` no MiniMax e `None` no
Grok.

**Regressão que eu mesmo causei e corrigi:** a primeira versão acessava `candidate.force_language`
direto e quebrou 18 testes que usam `SimpleNamespace` sem esse campo; passou a usar `getattr` com
padrão, como as linhas vizinhas já faziam. Registro porque o padrão do projeto é rodar a suíte
inteira antes de dar algo por pronto — foi ela que pegou.

**Cuidado com o cache:** `language` e `force_language` entraram no `_segment_fingerprint`. Sem
isso, ligar a opção reaproveitaria em silêncio o áudio sintetizado sem ela, e o usuário concluiria
que o parâmetro não funciona.

**Risco que sobrou:** o efeito real do `language_boost` na variante do português (pt-BR vs. pt-PT)
não foi confirmado por escuta — confirmei que o parâmetro **muda** o áudio, não que ele **resolve**
o sotaque brasileiro; isso só se sabe ouvindo. O MiniMax custa 4 a 6× o Grok e não expõe vozes pelo
OpenRouter, então usá-lo exige descobrir um `voice_id` válido pelo campo de texto livre. Para
português garantido sem ambiguidade, o caminho continua sendo voz com idioma fixo (Kokoro). Como
nas entradas anteriores, não foi possível validar com o app Electron em execução neste ambiente.

## 2026-07-28 — Player travava no último chunk e corrompia a posição salva do episódio

**O que mudou:** o botão "ouvir" de cada chunk, em `openChunkReview`
(`electron/renderer/renderer.js`), trocava `player.src` mas não atualizava `player.dataset.source`.
Esse campo tem duas responsabilidades no renderer: é o que `setPlayerSource` compara para decidir
se troca a fonte, e é a chave sob a qual `savePlaybackPosition` grava o progresso. Ficar
desatualizado quebrava as duas.

**Sintoma relatado pelo usuário:** "quando eu clico para ouvir um chunk eu não consigo mais ouvir
o áudio inteiro, o player fica travado no último chunk".

**Os dois defeitos, mesma causa:**

- **Travamento.** Depois de tocar um chunk, `dataset.source` continuava apontando para o MP3 do
  episódio. Ao pedir o episódio de novo, `setPlayerSource` via `dataset.source === url`, concluía
  que já estava carregado e **não fazia nada** — o player seguia no chunk, sem erro visível.
- **Corrupção silenciosa do resume.** O listener global de `timeupdate` gravava o `currentTime` do
  chunk sob a chave do episódio. Ouvir o chunk 7 e voltar ao episódio retomava num ponto errado —
  este nunca foi relatado, porque falha em silêncio.

**Correção:** `dataset.source` passa a ser atualizado junto com `src`, no mesmo passo. O chunk
grava posição sob a própria chave e nunca lê de volta (não chama `readSavedPlaybackPosition`),
então continua tocando do início — correto para trechos curtos.

**Por que não apareceu antes:** `playInApp` e `openTeleprompter` já mantinham o par `src` +
`dataset.source` em dia; só o handler do chunk trocava `src` direto. Verifiquei os demais pontos
que mexem em `player.src` e nenhum outro tem o mesmo problema.

**Validação:** TDD, os dois testes confirmados falhando antes da correção. Um reproduz o fluxo do
usuário (episódio → chunk → episódio) com um player falso que espelha o contrato de
`setPlayerSource`; o outro exige que o handler mantenha `dataset.source`. O primeiro lê o handler
real do renderer para decidir se atualiza o dataset, em vez de presumir a correção — sem isso ele
passaria mesmo com o bug presente, que foi o comportamento observado na primeira escrita do teste.
Suítes completas: 463 testes Python e **69 Electron** (68 pass, 1 skip esperado, eram 67),
`ruff check` e `npm run check` limpos.

**Risco que sobrou:** `dataset.source` continua acumulando as duas responsabilidades (identidade
da fonte carregada e chave de persistência), então todo ponto novo que mexer em `player.src`
precisa lembrar de atualizá-lo — foi exatamente o que falhou aqui. Separar as duas em campos
distintos deixaria o erro impossível, mas é refatoração de escopo maior que esta correção. Como
nas entradas anteriores, não foi possível validar com o app Electron em execução neste ambiente
(`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como Node puro), então a reprodução do fluxo
foi feita em teste com player falso, não na janela real.

## 2026-07-28 — Seletores de voz ordenados por idioma (pt-BR → pt-PT → inglês → espanhol → resto)

**O que mudou:** com 245 vozes em 15 modelos, a ordem de inserção do catálogo deixou de servir —
achar as 3 vozes pt-BR do Kokoro exigia rolar uma lista de 54. `electron/renderer/renderer.js`
ganhou `sortVoicesByLanguage`, aplicada aos **dois** seletores que listam vozes: o do perfil
(`addPresenterRow`) e o da leitura fiel (`narration-voice`) — ordenar só um deixaria as listas
divergentes, o que virou teste.

A detecção de idioma (`voiceLanguageCode`) cobre as três convenções em uso no catálogo, porque
nenhuma sozinha dá conta: prefixo do Kokoro (`pf_dora`), locale no início do ID
(`pt-PT-Rui:MAI-Voice-2`) e código no fim da descrição (`feminina, clara (en-us)`, do Deepgram e
afins). pt-BR e pt-PT são grupos **distintos** de propósito — a pronúncia difere o bastante para
não misturar. Variantes como `en-us`/`en-gb`/`es-mx` caem no grupo do idioma base. Vozes
multilíngues (Gemini, Grok) e sem idioma detectável (preset `None` do CSM) vão para o fim.

Dentro de cada grupo a ordem curada do catálogo é preservada, apoiando-se na estabilidade de
`Array.prototype.sort`.

**Por que:** o app é usado para produzir conteúdo em português; o idioma mais provável precisa
estar no topo. A ordem anterior era um acidente da ordem de escrita do catálogo, não uma decisão.

**Validação:** TDD, os 4 testes confirmados falhando antes da implementação. Testes novos em
`frontend-quality.test.js`: ordem entre grupos misturando as três convenções de ID, estabilidade
dentro do grupo, multilíngues/sem idioma no fim, e paridade entre os dois seletores. Uma
expectativa minha estava errada no primeiro teste (esperava `ff_siwis` antes de `zm_yunxi` dentro
do "resto", onde a ordenação estável preserva a ordem de entrada) — o teste foi corrigido, não o
código. Suítes completas: **463 testes Python** e **67 Electron** (66 pass, 1 skip esperado, eram
63), `ruff check` e `npm run check` limpos. Verificação real com o catálogo ao vivo: no Kokoro os
grupos saem exatamente como pt-BR → inglês (EUA) → inglês (Reino Unido) → espanhol → francês →
hindi → italiano → japonês → chinês; no MAI-Voice-2, inglês antes de espanhol.

**Ponto de atenção do `scripts/check_quality.py`:** o script reprova em "Formatação Python"
(`cost_analytics.py`, `sources/custom.py`) e "Dependências Electron" (5 vulnerabilidades high,
via `brace-expansion`/`minimatch` sob o eslint). Confirmei com `git stash` que **as duas
reprovações são idênticas sem as minhas mudanças** — são pré-existentes e ficaram fora do escopo
desta tarefa. O `npm audit fix --force` exigiria subir para eslint@10.8.0, que é breaking change;
é decisão do Felipe, não efeito colateral desta mudança.

**Risco que sobrou:** `VOICE_LANGUAGE_ORDER` é uma prioridade fixa; mudar o público-alvo do app
exigiria editá-la no código. A constante é declarada depois do uso em `narration-voice`
(linha ~1745 usa o que é definido na ~2352), o que é seguro porque a chamada acontece em runtime
e não durante a carga do módulo — verificado explicitamente contra o TDZ de `const`. Como nas
entradas anteriores, não foi possível validar com o app Electron em execução neste ambiente
(`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como Node puro), então a ordem foi conferida
executando as funções do renderer contra o catálogo real da API.

## 2026-07-28 — Idioma de todas as 245 vozes visível no app (duplicação no Kokoro e ID cru do MAI-Voice-2)

**O que mudou:** com o catálogo já alinhado à API (entrada anterior), faltava o app *mostrar* o
idioma corretamente para as vozes novas. Dois defeitos em `electron/renderer/renderer.js`:

- **Idioma duplicado no Kokoro.** `voiceToneLabel` removia da descrição só os códigos
  `pt-br|en|en-gb`, uma lista fixa da época em que o catálogo tinha 25 vozes de 2 idiomas. Com as
  54 vozes (9 idiomas), as novas mostravam o idioma duas vezes: `Siwis (francês) · feminina
  (fr-FR)`. O código removido agora é genérico (`xx` ou `xx-YY`).
- **ID cru no MAI-Voice-2.** As vozes se chamam `en-US-Harper:MAI-Voice-2` e o seletor exibia
  `En US Harper:MAI Voice 2 · feminina (en-US)` — ilegível, com o modelo repetido e o idioma só em
  código. `voiceLabel` passou a reconhecer o padrão `locale-Nome:Modelo` e renderiza
  `Harper (inglês — EUA) · feminina`.

A condição de limpeza da descrição deixou de ser "é voz do Kokoro?" e virou "o ID já codifica o
idioma?" (`hasLanguageInId`), cobrindo as duas convenções. Deepgram, Voxtral, CSM, Grok, Zonos e
Qwen não codificam idioma no ID, então a descrição continua sendo a única fonte e permanece
intacta — comportamento preservado por teste.

**Por que:** o seletor de voz é onde o usuário escolhe o idioma da narração na prática. Idioma
duplicado ou em código cru transforma a escolha em adivinhação, ainda mais agora que o catálogo
saltou de 2 para 9 idiomas no Kokoro.

**Validação:** TDD, os três testes confirmados falhando antes da correção. `frontend-quality.test.js`
ganhou testes **comportamentais** (executam `voiceLabel`/`voiceToneLabel` de verdade via
`loadVoiceHelpers`, em vez de casar regex contra o código-fonte, como faziam os testes anteriores
desta área): idioma uma única vez nos 8 idiomas do Kokoro, nome limpo + idioma por extenso no
MAI-Voice-2, e idioma preservado nos provedores sem locale no ID. Um teste antigo por regex foi
atualizado porque casava o nome da variável renomeada — quebra de acoplamento ao texto-fonte, não
de comportamento. Suítes completas: 463 testes Python e **63 Electron** (62 pass, 1 skip esperado,
eram 60), `ruff check` e `npm run check` limpos. Verificação real: renderizei os rótulos das 245
vozes dos 15 modelos com o catálogo ao vivo — todas indicam idioma, com uma única exceção
correta (`None` do CSM, preset sem idioma fixo).

**Risco que sobrou:** `voiceLabel` traduz locales por uma tabela fixa; um locale novo que o
OpenRouter passe a servir (ex.: `sv-SE`) cai no fallback e aparece como código cru em vez de nome
por extenso — degrada legível, não quebra. O `ruff format --check` segue apontando
`cost_analytics.py` e `sources/custom.py`, pré-existentes e não tocados aqui. Como nas entradas
anteriores, não foi possível validar com o app Electron em execução neste ambiente
(`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como Node puro), então a conferência dos
rótulos foi feita executando as funções do renderer fora da janela.

## 2026-07-28 — Catálogo de vozes alinhado ao que o OpenRouter realmente aceita (32 vozes inventadas removidas, 29 reais adicionadas)

**O que mudou:** o catálogo estático em `src/audiofy/providers/openrouter.py` foi confrontado com
o `supported_voices` ao vivo de `GET /models?output_modalities=speech` — a autoridade sobre quais
vozes existem. O resultado contradiz o que as entradas anteriores desta sessão registraram:

- **MAI-Voice-2 (e -flash):** o catálogo listava 36 vozes; a API aceita **4**
  (`en-US-Harper`, `es-MX-Valeria`, `fr-FR-Soleil`, `de-DE-Klaus`). As outras 32 — incluindo
  **todas as 4 pt-BR** (`Caio`, `Luana`, `Pedro`, `Rafael`) e a pt-PT `Rui` — vinham da doc do
  Azure Speech, não do OpenRouter, e retornariam erro de voz inválida na hora de gerar o áudio.
- **MiniMax Speech 2.8 (hd/turbo):** `supported_voices` vem **nulo**. Não era "subconjunto curado
  de 300+" como registrado na entrada anterior: pelo OpenRouter o modelo não expõe voz nomeada
  nenhuma. Catálogo agora é `{}` de propósito, e o frontend cai no input de texto livre.
- **Kokoro 82M:** o catálogo tinha 25 vozes com o comentário "o modelo tem 54". As 29 que faltavam
  foram adicionadas com descrição de idioma/gênero — es, fr, hi, it, ja, zh e o restante de en-GB.
- **Orpheus:** `zoe` não existe na API. **Deepgram:** `aura-2-perseo-it` não existe.

Também em `src/audiofy/bridge.py`, `_cmd_models_list` só sobrescrevia o catálogo estático quando a
API devolvia vozes (`if supported_voices:`). Era esse guard que mantinha as 32 vozes fantasma do
MAI-Voice-2 vivas no seletor mesmo com a API contradizendo. Agora a resposta ao vivo substitui o
estático sempre, inclusive vazia; as descrições curadas continuam preservadas voz a voz, porque a
API devolve só nomes.

**Por que:** o catálogo alimenta os seletores da interface. Uma voz listada que a API recusa vira
erro no meio da síntese, depois de o usuário já ter escolhido e disparado a geração — o pior
momento para descobrir. O catálogo não pode ser mais permissivo que a API.

**Validação:** TDD. `tests/unit/test_voices.py` é novo e trava o contrato contra a fixture
`tests/fixtures/openrouter_supported_voices.json` (snapshot real do `supported_voices`): nenhuma
voz catalogada fora da API, nenhuma voz da API fora do catálogo, MiniMax vazio e toda voz com
descrição não vazia. Mais um teste novo em `test_bridge.py` exige que catálogo estático não
sobreviva a uma resposta vazia da API. Os 4 testes de contrato e o do bridge foram confirmados
falhando antes da correção. Suítes completas: **463 testes Python** (eram 457) e 60 Electron
(59 pass, 1 skip esperado), `ruff check` e `npm run check` limpos. Verificação real pela bridge
com a API ao vivo: 245 vozes em 15 modelos, `catalog_error` nulo, MiniMax em 0 (texto livre),
Kokoro em 54, MAI-Voice-2 em 4.

**Risco que sobrou:** a fixture é um snapshot de 2026-07-28 — se o OpenRouter mudar o
`supported_voices` de algum modelo, o teste de contrato falha e a fixture precisa ser regravada
(é o comportamento desejado: falha ruidosa em vez de catálogo silenciosamente errado). O
`ruff format --check` aponta `cost_analytics.py` e `sources/custom.py`, ambos pré-existentes e
não tocados aqui. Perdemos pt-BR nativo no MAI-Voice-2 — hoje o único pt-BR real é o do Kokoro
(`pf_dora`, `pm_alex`, `pm_santa`); quem precisa de pt-BR premium deve testar o `language_boost`
do MiniMax via input de texto livre. Como nas entradas anteriores, não foi possível validar com o
app Electron em execução neste ambiente (`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como
Node puro).

## 2026-07-28 — Idioma da voz aparecia só para o Kokoro; demais provedores TTS ficavam sem catálogo

**O que mudou:** `src/audiofy/providers/openrouter.py` ganhou catálogos reais de vozes (nome →
descrição de tom + idioma) para `canopylabs/orpheus-3b-0.1-ft`, `deepgram/aura-2`,
`microsoft/mai-voice-2`, `minimax/speech-2.8-{hd,turbo}` e `x-ai/grok-voice-tts-1.0`, importados
em `src/audiofy/voices.py`. `mistralai/voxtral-mini-tts-2603`, `sesame/csm-1b` e
`zyphra/zonos-v0.1-{hybrid,transformer}` continuam com catálogo vazio de propósito: são modelos
de voice cloning por referência de áudio, sem vozes preset nomeadas confirmadas em fonte oficial.

**Por que:** só o Kokoro (`hexgrad/kokoro-82m`) tinha vozes cadastradas; os outros 10 modelos
caíam no modo "input de texto livre" sem nenhuma informação de idioma visível na UI — o usuário
não conseguia saber, por exemplo, se uma voz falava português antes de gastar créditos gerando
áudio. Cada catálogo veio de documentação oficial do provedor (URLs citadas nos comentários do
código); onde não havia lista de vozes confirmável, o catálogo ficou vazio em vez de inventar
nomes (regra de anti-alucinação do guia de qualidade). Achado relevante: só o MAI-Voice-2 tem
pt-BR nativo confirmado (Caio, Luana, Pedro, Rafael) — Deepgram Aura-2 e Zonos documentam listas
de idiomas que não incluem português.

Isso expôs um bug latente em `electron/renderer/renderer.js`: `voiceToneLabel(tone)` removia
qualquer sufixo `(pt-br)`/`(en)`/`(en-gb)` da descrição da voz, assumindo que só o Kokoro precisava
disso (porque `voiceLabel()` já decodifica o idioma dele a partir do prefixo do nome, ex.
`pf_dora`). Com as vozes pt-BR do MAI-Voice-2 usando a mesma convenção de sufixo, o idioma
desaparecia da UI sem nenhuma voz decodificando de volta. Corrigido: `voiceToneLabel(tone, voice)`
só remove o sufixo quando `voice` segue o padrão de prefixo do Kokoro (`/^[a-z][fm][_-]/i`); para
os demais provedores, a descrição com idioma permanece visível.

**Validação:** `tests/frontend-quality.test.js` foi atualizado (assinatura nova de
`voiceToneLabel`) e ganhou um teste cobrindo o comportamento condicional por provedor. Suítes
completas: 457 testes Python (`pytest`) e 60 Electron (59 pass, 1 skip esperado), `ruff check` +
`ruff format --check` e `npm run check` (`eslint --max-warnings=0` + `node --check` + testes)
limpos. Verificação real: `TTS_VOICE_CATALOGS` carregado via Python confirma contagem de vozes por
modelo (Deepgram 91, MAI-Voice-2 36, Orpheus 8, Minimax 11, Grok 5); `node --check` confirma que o
renderer carrega sem erro de sintaxe.

**Risco que sobrou:** os catálogos de Deepgram, MAI-Voice-2, Orpheus e Grok são íntegros (fonte
oficial completa), mas Minimax é um subconjunto curado — o catálogo real tem 300+ vozes,
incluindo ~70 rotuladas "Portuguese" cujos nomes exatos não estão publicados na doc consultada;
quem precisar delas deve puxar a lista viva pela "Get Voice API" do MiniMax. Voxtral Mini TTS
suporta português entre seus 9 idiomas mas não tem catálogo de nomes de voz confiável — hoje cai
no modo de texto livre. Como nas entradas anteriores, não foi possível validar com o app Electron
em execução neste ambiente (`ELECTRON_RUN_AS_NODE=1` fixa faz o binário rodar como Node puro).

## 2026-07-28 — Correção: `_cmd_models_list` apagava o idioma recém-catalogado ao atualizar vozes ao vivo

**O que mudou:** em `src/audiofy/bridge.py`, `_cmd_models_list` fazia
`TTS_VOICE_CATALOGS[model_id] = dict.fromkeys(supported_voices, "")` sempre que a API ao vivo do
OpenRouter retornava `supported_voices` para um modelo. Isso **sobrescrevia por completo** o
catálogo curado (nome → tom/idioma) adicionado na entrada anterior, substituindo toda descrição
por string vazia. Agora o código mescla: usa a lista de vozes da API ao vivo como fonte da
verdade de quais vozes existem, mas preserva a descrição já catalogada para cada uma
(`known_voices.get(voice, "")`), só caindo para `""` em vozes que a API retorna e ainda não
documentamos.

**Por que:** o usuário reportou que a aba Apresentadores continuava sem mostrar idioma mesmo
depois da mudança anterior. A hipótese inicial (cache do app) foi descartada ao investigar: a
ponte Python roda um processo novo por comando, sem cache entre chamadas — então o bug tinha que
estar no próprio bridge. Rodei o app de verdade (Electron sob `xvfb` via driver Playwright
descartável, contornando a suposição registrada antes de que isso não seria possível neste
ambiente — o bloqueio real era só `ELECTRON_RUN_AS_NODE=1`, que não estava setado desta vez) e
reproduzi o sintoma: trocar o modelo TTS do perfil para `microsoft/mai-voice-2` mostrava
`En US Harper:MAI Voice 2` sem nenhum tom/idioma, quando o catálogo estático tinha
`"masculina (pt-BR)"` etc. para essas vozes. A causa: `_cmd_models_list` é chamado toda vez que a
tela de Configurações carrega a lista de modelos, e a atualização ao vivo pisava no catálogo
estático a cada carregamento.

**Validação:** TDD — `tests/unit/test_bridge.py::test_atualizacao_dinamica_preserva_descricao_de_voz_ja_catalogada`
foi escrito e confirmado falhando antes da correção (`AssertionError: '' != 'masculina (pt-BR)'`
via `git stash` do fix), depois passando com o fix aplicado. Suíte completa: 458 testes Python,
`ruff check` + `ruff format --check` limpos. Validação end-to-end real no app: Electron lançado
via Playwright (`_electron.launch`) sob `xvfb-run --no-sandbox`, aba Configurações aberta, perfil
editado, modelo TTS trocado para `microsoft/mai-voice-2`, `deepgram/aura-2` e de volta para
`hexgrad/kokoro-82m` — as opções de voz do campo Apresentadores mostraram
`"En US Harper:MAI Voice 2 · feminina (en-US)"`, `"Thalia (inglês) · feminina, clara, confiante
(en-us)"` e `"Alloy (inglês — EUA) · neutra"` respectivamente, todas com idioma visível.

**Risco que sobrou:** o driver Playwright usado para validar foi descartável (não virou skill do
projeto, porque só serviu para depurar este bug pontual); uma futura sessão que precise rodar o
app de verdade neste ambiente terá que recriá-lo. O merge preserva vozes curadas mas ainda usa a
API ao vivo como lista de existência — se o OpenRouter parar de retornar `supported_voices` para
algum desses modelos, o catálogo estático (estabelecido na entrada anterior) permanece intacto
como já acontecia antes desta correção.

## 2026-07-28 — Idioma ainda faltava em 6 modelos: catálogo incompleto, não só o bug de merge

**O que mudou:** com o app rodando de verdade (mesmo driver Playwright/xvfb da correção anterior),
varri todos os 15 modelos TTS do seletor `pf-tts-model` trocando o valor e lendo as opções reais
de `.pf-voice`. Descobri que a lista ao vivo do OpenRouter inclui modelos e vozes que a entrada
anterior não cobria: `sesame/csm-1b` e `zyphra/zonos-v0.1-{hybrid,transformer}` têm presets
nomeados reais (`conversational_a`, `american_female` etc.) — a pesquisa anterior tinha concluído
errado que esses modelos só faziam voice cloning sem preset; `mistralai/voxtral-mini-tts-2603`
expõe 30 vozes reais (`en_paul_sad`, `gb_oliver_neutral`, `gb_jane_curious`, `fr_marie_happy` etc.)
que eu tinha deixado vazio por falta de fonte; e três modelos nem apareciam no catálogo estático:
`microsoft/mai-voice-2-flash` (mesmo esquema de IDs do `mai-voice-2`, só precisava do mapeamento)
e os dois `qwen/qwen-audio-3.0-tts-{flash,plus}` (vozes `loongjohn`, `longanhuan_v3.6`,
`longanlingxin`, `longanlufeng` da família CosyVoice/Qwen-TTS da Alibaba, confirmadas em
`help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list`). `src/audiofy/providers/openrouter.py`
ganhou `CSM_VOICES`, `ZONOS_VOICES` e `VOXTRAL_VOICES` populados (substituindo os dicts vazios) e
os novos `QWEN_TTS_FLASH_VOICES`/`QWEN_TTS_PLUS_VOICES`; `src/audiofy/voices.py` mapeou os três
modelos que faltavam.

**Por que:** a correção anterior resolveu o bug de merge, mas o usuário reportou "ainda não mostra
pra TODOS" — sinal de que havia mais de uma causa. Em vez de assumir que o merge bastava, rodei o
app de novo e varri sistematicamente cada modelo do seletor em vez de testar só um. Achado
importante: a lista de modelos TTS realmente disponíveis via API muda (o OpenRouter já oferece
`microsoft/mai-voice-2-flash` e os dois modelos Qwen, que não estavam em nenhuma pesquisa
anterior) — o catálogo estático precisa ser tratado como uma superfície que pode ficar desatualizada
conforme o provedor evolui, não como uma lista fechada definida uma vez.

**Validação:** suíte completa (458 Python, 60 Electron) e `ruff`/`npm run check` limpos.
Verificação real no app: varredura de todos os 15 modelos de `pf-tts-model` confirmou que **todos**
agora retornam pelo menos uma opção de voz com idioma visível no texto (ex.: `"Conversational A ·
conversacional (en)"`, `"American Female · feminina (en-us)"`, `"En Paul Sad · masculina, triste
(en-us)"`, `"Loongjohn · masculina (en)"`).

**Risco que sobrou:** a lista de modelos TTS do OpenRouter pode continuar mudando — se um novo
modelo aparecer com `supported_voices`, ele ainda vai cair em vozes sem descrição (`""`) até
alguém catalogar manualmente, exatamente como o comportamento de fallback já documentado. `none`
(CSM-1B) e `random` (Zonos) são opções especiais sem idioma fixo — descritas como tal em vez de
receber um idioma inventado.

## 2026-07-28 — Gemini TTS também sem indicação de idioma: faltava tag "multilíngue"

**O que mudou:** `GEMINI_VOICES` em `src/audiofy/providers/openrouter.py` tinha só o tom de cada
voz (ex.: `"Zephyr": "brilhante"`), sem nenhuma indicação de idioma — cada uma das 30 entradas
ganhou o sufixo `" (multilíngue)"`.

**Por que:** o usuário apontou que o Gemini continuava sem mostrar idioma depois das duas rodadas
anteriores. Diferente dos outros provedores, o Gemini TTS não tem uma voz por idioma: a mesma voz
fala qualquer um dos 24+ idiomas suportados pelo modelo, detectado a partir do texto de entrada
(documentado em `ai.google.dev/gemini-api/docs/speech-generation`) — não existe um código de
idioma fixo do tipo `(pt-BR)` para associar a cada voz, como fizemos para Kokoro/Deepgram/MAI. A
tag `(multilíngue)` comunica isso explicitamente em vez de deixar o campo vazio (que parecia
"esquecido") ou inventar um idioma que não é real para aquela voz.

**Validação:** suíte completa (458 Python) e `ruff` limpos — nenhum teste depende do texto exato
de `GEMINI_VOICES`. Verificação real no app (mesmo driver Playwright/xvfb): perfil editado, modelo
trocado para `google/gemini-3.1-flash-tts-preview`, opções do campo Apresentadores confirmadas
como `"Zephyr · brilhante (multilíngue)"`, `"Puck · animada (multilíngue)"` etc.

**Risco que sobrou:** nenhum novo — mesma superfície de risco das entradas anteriores (catálogo
estático pode ficar desatualizado se o provedor mudar a lista de vozes ou idiomas suportados).

## 2026-07-29 — Separação de superfícies por branches

**Audiofy Content AI - Criar a separação de branches (uso interno, uso público e uso por API)**
documentou `docs/ESTRATEGIA-DE-BRANCHES.md` e criou `feat/uso-interno`, `feat/uso-publico` e
`feat/uso-api` a partir de `main`. O núcleo permanece canônico no `main`; o Meu-Ecoo-Prisma foi
inspecionado e hoje só possui documentação/mockups de “Áudio-revisão”, então o contrato da API
ficou explicitamente pendente de validação do consumidor. Validação: `git diff --check` e
`python3 scripts/check_quality.py --quick` executados; a régua confirmou lint e testes, mas
mantém avisos de formatação pré-existentes em quatro arquivos não tocados.

## 2026-07-29 — Guias de uso das três superfícies

**Audiofy Content AI - Criar a separação de branches (uso interno, uso público e uso por API)**
adicionou `docs/USO-INTERNO.md`, `docs/USO-PUBLICO.md` e `docs/USO-API.md`, além de links no
README. Os guias delimitam público, responsabilidades, limites e relação com o núcleo, sem
duplicar a implementação. Validação: links locais conferidos pela régua de qualidade.

## 2026-07-30 — Fundação React do renderer + piloto da aba Custos

**O que mudou:** criou `electron/renderer-react/` (Vite + React, JS puro, `package.json`/testes/lint
isolados) e migrou a aba Custos como piloto: `CostsTab.jsx` reproduz `renderCosts`/`loadCosts` de
`electron/renderer/renderer.js` (mesmos dados, texto e formatos), com `audiofyClient.js` envolvendo
`window.audiofy.bridge` em funções por comando (`getStatus`, `getCosts`). Nova página
`electron/renderer/index-react.html` carrega o build estático (`dist-react/app.js`/`app.css`, nomes
fixos sem hash) com a mesma CSP restritiva do `index.html` vanilla. `main.js` ganhou as variáveis de
ambiente `AUDIOFY_RENDERER=react` (opcional) e `AUDIOFY_RENDERER_DEV_URL` (dev/HMR do Vite, CSP
relaxada só nesse caso) sem alterar o comportamento padrão. `electron/eslint.config.cjs` passou a
ignorar `renderer-react/**` e `renderer/dist-react/**` (projeto e build isolados, com seu próprio
lint). `.gitignore` ganhou `electron/renderer-react/node_modules/` e `electron/renderer/dist-react/`.

**Por que:** tarefa do Notion "Passar o AudioFy pra React", escopada só na `feat/uso-publico`
(`docs/ESTRATEGIA-DE-BRANCHES.md`) — `feat/uso-interno`/`feat/uso-api` continuam com o renderer
vanilla. Migração incremental: fundação + tela mais simples (leitura pura, sem formulário/modal/
polling) antes de enfrentar telas com estado complexo, seguindo TDD (teste Vitest/Testing Library
escrito junto do componente, cobrindo carregamento, estado vazio, erro e o botão Atualizar).

**Validação:** `cd electron/renderer-react && npm run build && npm test && npm run lint` (4 testes
Vitest passando, build gera `app.js`/`app.css`/`index.html` em `../renderer/dist-react`, oxlint sem
erros, `npm audit` sem vulnerabilidades). `cd electron && npm run check` continua verde (lint +
`node --check` + 71 testes `node --test`, 1 skip pré-existente no Windows) — nada no vanilla/main
process quebrou.

**Risco que sobrou:** só a aba Custos está migrada; as demais (Chat, Conteúdo, Episódios,
Configurações) são telas maiores (formulário, modal, polling, upload) que ainda vão precisar de
`audiofyClient.js` expandido e do mesmo padrão de teste, uma de cada vez. O carregamento do bundle
React via `file://` dentro do Electron empacotado (fora do modo dev) não foi verificado
visualmente nesta entrada — só build + testes automatizados.
