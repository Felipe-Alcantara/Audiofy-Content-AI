# Renderer React do Audiofy

Interface do app desktop (Electron) em React + Vite. É o renderer **padrão** da
branch `feat/uso-publico`; o renderer vanilla (`../renderer/renderer.js`) segue no
repositório como escape hatch (`AUDIOFY_RENDERER=vanilla`) e como base das outras
superfícies. Contexto e critérios: [`docs/USO-PUBLICO.md`](../../docs/USO-PUBLICO.md).

## Comandos

```bash
npm install          # uma vez
npm test             # Vitest + Testing Library
npm run lint         # oxlint
npm run build        # gera ../renderer/dist-react/{app.js,app.css}
npm run dev          # servidor Vite (use com AUDIOFY_RENDERER_DEV_URL no Electron)
```

Depois de `npm run build`, `cd .. && npm start` abre o app com este renderer.

## Organização

| Pasta | Papel |
| --- | --- |
| `src/lib/` | Borda com o mundo externo: `audiofyClient.js` (uma função por comando da bridge), `formatters.js`, `voices.js` e `statusView.js` (importa `../renderer/status-view.js`, compartilhado com o vanilla). |
| `src/state/` | Providers de estado compartilhado entre header, abas e modais: player (o único `<audio>`, que nunca sai do dock), status (com polling de 2 s durante a geração) e configurações do perfil ativo. |
| `src/components/` | Uma tela por arquivo (`ChatTab`, `ContentTab`, `EpisodesTab`, `CostsTab`, `SettingsTab`), mais `Header`, os modais e os pedaços grandes do detalhe de conteúdo. |
| `src/testing/` | Bridge falsa roteada por comando e wrapper de render com os providers. |

## Regras da casa

- **Sem lógica de negócio aqui.** Tudo passa pela bridge Python; o renderer só
  apresenta e coleta escolhas.
- **Paridade de texto e formato** com o renderer vanilla: os mesmos rótulos,
  arredondamentos e classes CSS (`../renderer/styles.css` é importado direto).
- **Teste antes do componente** (TDD), cobrindo carregamento, vazio e erro.
- Toda ação que gasta créditos continua exigindo confirmação explícita, com o
  custo estimado à vista.
