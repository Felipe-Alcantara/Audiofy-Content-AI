# Uso público — `feat/uso-publico`

## Para quem é

Pessoas que desejam transformar texto, URL pública ou conteúdo próprio em podcast ou
leitura fiel, sem conhecer a arquitetura interna do Audiofy.

## O que esta frente pode fazer

- oferecer onboarding e configuração local claros;
- orientar sobre chaves, modelos, vozes, custos e limites;
- expor somente fontes e operações autorizadas para distribuição;
- preservar a experiência cross-platform por `start_app.py` e Electron;
- comunicar falhas e pendências sem expor segredos ou detalhes internos.

## O que não deve entrar aqui

- fontes privadas da Vitis Souls;
- credenciais, conversas pessoais ou artefatos locais no repositório;
- APIs específicas de um consumidor externo;
- cópia própria da lógica de pipeline.

## Entrada e operação

O caminho recomendado é `python3 start_app.py`. A interface deve manter menu
interativo, validação de entradas, navegação externa bloqueada no Electron, CSP
restritiva, `contextIsolation` e acessibilidade nas telas.

## Relação com o núcleo

Esta branch adapta apresentação, configuração e políticas públicas. O processamento,
a auditoria, a retomada e o cálculo de custo continuam vindo do núcleo no `main`.

## Renderer React (padrão desta branch)

O renderer do Electron foi migrado do JS vanilla para React — decisão do produto
"Passar o AudioFy pra React", escopada só nesta branch (`feat/uso-interno` e
`feat/uso-api` continuam com o renderer vanilla).

- **Código:** `electron/renderer-react/` — projeto Vite + React isolado (JS puro,
  sem TypeScript), com `package.json`, testes (Vitest + Testing Library) e lint
  (oxlint) próprios. Builda para `electron/renderer/dist-react/` (gerado, fora do
  controle de versão). Organização: `src/lib/` (bridge, formatadores, vozes),
  `src/state/` (providers de player, status e configurações) e `src/components/`
  (uma pasta por tela + modais).
- **Camada de dados:** `src/lib/audiofyClient.js` envolve `window.audiofy`
  (exposta por `preload.js`, sem mudança) em uma função por comando da bridge.
  As regras de erro/progresso continuam em `renderer/status-view.js`, importado
  pelo bundle (`src/lib/statusView.js`) — uma implementação para as duas
  superfícies, não duas cópias.
- **Como abrir:** `npm start` (dentro de `electron/`) já abre o React.
  `AUDIOFY_RENDERER=vanilla npm start` volta ao renderer antigo, que segue no
  repositório como escape hatch e como base das outras superfícies.
  `AUDIOFY_RENDERER_DEV_URL=http://localhost:5173 npm start` usa o servidor de dev
  do Vite (HMR) — único modo com a CSP do próprio Vite, nunca no app empacotado.
  A escolha vive em `resolveRendererTarget()` (`electron/environment.js`), coberta
  por teste.
- **Paridade:** todas as telas (Chat, Conteúdo, Episódios, Custos, Configurações),
  o dock do player, a revisão de chunks e o teleprompter estão em React, com os
  mesmos textos, formatos e CSS (`renderer/styles.css` é reaproveitado).
- **Critério de "pronto" por tela:** componente React equivalente com os mesmos
  dados/textos/formatos da versão vanilla, teste Vitest + Testing Library cobrindo
  carregamento e casos de erro/vazio, e nenhuma regressão em `electron/tests/`
  (`cd electron && npm run check`).
