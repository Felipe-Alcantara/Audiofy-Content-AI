# Estratégia de branches do Audiofy

## Objetivo

O Audiofy atende três superfícies com necessidades diferentes, mas não deve manter
três cópias do pipeline. O núcleo auditável permanece compartilhado; cada frente
adiciona somente a borda, as políticas e a documentação necessárias ao seu público.

## Branches

| Branch | Escopo | Não deve conter |
| --- | --- | --- |
| `feat/uso-interno` | Operação interna da Vitis Souls: perfis, fontes e fluxos privados de produção. | Contratos públicos, dados pessoais e chaves internas expostas. |
| `feat/uso-publico` | Produto distribuível: onboarding, limites seguros, configuração local e experiência externa. | Fontes privadas e regras específicas da Vitis Souls. |
| `feat/uso-api` | Borda HTTP para consumidores, incluindo o Meu-Ecoo-Prisma: autenticação, limites, jobs e artefatos. | Regra de negócio duplicada, acesso direto ao filesystem e segredos do operador. |

## Núcleo comum

O núcleo continua no `main` e é a fonte canônica para modelos de conteúdo, fontes,
provedores, pipeline, runtime, retomada, custo, auditoria, segurança, montagem de
áudio, bridge JSON e testes de contrato. As branches de superfície consomem essas
interfaces; uma regra específica não entra no pipeline sem justificativa e teste.

## Fluxo de sincronização

1. Mudanças comuns nascem no `main`, com teste e atualização do `IA.md` no mesmo passo.
2. Cada branch sincroniza periodicamente com `main`; conflitos devem preservar o
   contrato do núcleo e ser validados por `scripts/check_quality.py`.
3. Uma mudança necessária às três frentes deve ser extraída para um commit pequeno no
   `main`; não copiar arquivos manualmente entre branches.
4. Mudanças específicas permanecem na branch correspondente e têm testes da borda.
5. Antes de integrar uma branch, execute a régua completa e revise os contratos afetados.

## API para o Meu-Ecoo-Prisma

O repositório `flaviavs-commits/Meu-Ecoo-Prisma` atualmente descreve, em documentos
e mockups, materiais educacionais com recurso de “Áudio-revisão”. Não há integração
executável para copiar. A branch `feat/uso-api` deve começar pelo contrato de
casos de uso e pelos limites de segurança; o formato final depende da validação dos
fluxos reais do consumidor.

## Estado da decisão

As três branches foram criadas a partir do `main` atual. A separação de código e a
implementação do servidor HTTP ainda não foram declaradas concluídas; são próximas
unidades de trabalho, cada uma com teste e documentação próprios.
