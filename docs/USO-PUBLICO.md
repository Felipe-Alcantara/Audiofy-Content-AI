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
