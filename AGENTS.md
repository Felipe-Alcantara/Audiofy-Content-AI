# AGENTS.md — guia operacional do Audiofy

Este arquivo orienta agentes de IA e pessoas que automatizam mudanças neste repositório.

## Antes de alterar

1. Leia `README.md` para entender o produto e `IA.md` para recuperar as decisões anteriores.
2. Preserve a separação existente: fontes, provedores, pipeline, runtime, bridge e interfaces.
3. Procure testes e automações relacionados antes de editar manualmente.
4. Nunca versione `.env`, `.audiofy/`, conversas de `data/chat/` ou conteúdo de `data/inbox/`.

## Contratos obrigatórios

- `start_app.py` é a porta de entrada para usuários e precisa continuar cross-platform.
- A bridge aceita somente comandos declarados e dados limitados; mudanças de contrato exigem
  teste Python e teste Electron quando alcançarem o IPC.
- Operações de rede devem ter timeout, validar entradas e não expor chaves em erros ou logs.
- Artefatos de episódio são retomáveis e auditáveis; não quebre formatos existentes sem migração.
- O Electron mantém `contextIsolation`, sandbox, CSP restritiva e navegação externa bloqueada.

## Critério de pronto

Execute, a partir da raiz:

```bash
python scripts/check_quality.py
```

Durante iterações sem rede, use `python scripts/check_quality.py --quick`. Mudanças visuais no
Electron também exigem verificação nas larguras de 600 px e 380 px — use
`xvfb-run -a node scripts/verify_app_ui.js`, que abre o app real, percorre as abas, mede o
layout e reprova em estouro horizontal ou erro de console. Mudanças que afetem a síntese de voz
(tamanho de trecho, direção vocal, modelo) exigem `python scripts/audit_audio_consistency.py
<episódio>` sobre uma geração real: brilho e volume da voz decaem dentro de cada geração, e nem
os testes nem a auditoria de silêncio enxergam isso. Registre mudanças de
arquitetura, comportamento, dependências ou riscos em uma nova entrada datada no fim de `IA.md`.

Commits seguem Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
