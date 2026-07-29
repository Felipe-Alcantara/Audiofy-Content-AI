# Uso por API — `feat/uso-api`

## Para quem é

Aplicações externas que precisam solicitar, acompanhar e consumir áudios do Audiofy.
O primeiro consumidor considerado é o Meu-Ecoo-Prisma, que hoje descreve em seus
mockups um recurso de “Áudio-revisão” para materiais educacionais.

## Responsabilidades desta frente

- definir contrato HTTP versionado e schemas de entrada/saída;
- autenticar e autorizar consumidores;
- validar texto, URLs, perfis e limites de tamanho/custo;
- criar e acompanhar jobs retomáveis;
- entregar status e artefatos sem expor o filesystem interno;
- aplicar timeout, rate limit, logs seguros e respostas de erro previsíveis.

## O que não deve entrar aqui

- regra de negócio duplicada do pipeline;
- acesso direto do cliente a `data/episodes/`;
- tokens em respostas ou logs;
- contrato fechado sem validar os fluxos reais do consumidor.

## Estado da integração

O Meu-Ecoo-Prisma atualmente possui documentação e mockups, mas não uma integração
executável para copiar. O contrato deve começar pelos casos de uso mínimos — criar,
acompanhar e obter um áudio — e ser validado antes de assumir compatibilidade estável.

## Relação com o núcleo

A API é uma borda fina. Ela chama casos de uso do núcleo e traduz os resultados para
um contrato externo; não implementa síntese, auditoria, custo ou retomada novamente.
