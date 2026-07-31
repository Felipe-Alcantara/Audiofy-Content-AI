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

## Migração do renderer para React

O renderer do Electron (`electron/renderer/`) está em transição, tela por tela, do
JS vanilla atual para React — decisão do produto "Passar o AudioFy pra React",
escopada só nesta branch (`feat/uso-interno` e `feat/uso-api` continuam com o
renderer vanilla).

- **Código novo:** `electron/renderer-react/` — projeto Vite + React isolado (JS puro,
  sem TypeScript), com `package.json`, testes (Vitest + Testing Library) e lint
  (oxlint) próprios. Builda para `electron/renderer/dist-react/` (gerado, fora do
  controle de versão).
- **Camada de dados:** `electron/renderer-react/src/audiofyClient.js` envolve
  `window.audiofy.bridge` (exposta por `preload.js`, sem mudança) em funções por
  comando (`getStatus`, `getCosts`, ...) — mesma bridge, casca mais ergonômica para
  componentes React.
- **Como abrir a versão React:** `AUDIOFY_RENDERER=react npm start` (dentro de
  `electron/`) abre `renderer/index-react.html` (build estático, mesma CSP restritiva
  do `index.html` vanilla). Com `AUDIOFY_RENDERER_DEV_URL=http://localhost:5173`
  também setada, abre o servidor de dev do Vite (HMR) em vez do build — único modo em
  que a CSP é a do próprio Vite, nunca no app empacotado. Sem essas variáveis, o
  comportamento padrão (`renderer/index.html` vanilla) não muda.
- **Progresso:** só a aba **Custos** foi migrada até aqui (piloto — leitura simples,
  sem formulário/modal/polling). As demais abas (Chat, Conteúdo, Episódios,
  Configurações) continuam no renderer vanilla até serem migradas, uma por vez.
- **Critério de "pronto" por tela:** componente React equivalente com os mesmos
  dados/textos/formatos da versão vanilla, teste Vitest + Testing Library cobrindo
  carregamento e casos de erro/vazio, e nenhuma regressão em `electron/tests/`
  (`cd electron && npm run check`).
