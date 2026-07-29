# Uso interno — `feat/uso-interno`

## Para quem é

Operação privada da Vitis Souls para preparar, revisar e acompanhar episódios com
fontes, perfis e configurações internas.

## O que esta frente pode fazer

- usar fontes e perfis internos autorizados;
- executar o pipeline auditável e retomar trabalhos interrompidos;
- acompanhar custo, status, auditoria e artefatos;
- testar fluxos operacionais antes de transformá-los em contratos públicos.

## O que não deve entrar aqui

- chaves, tokens, conteúdo privado ou dados pessoais versionados;
- regras que só fazem sentido para um consumidor externo;
- alterações no pipeline que deveriam ser comuns às três superfícies.

## Entrada e operação

Use `python3 start_app.py` para instalar, configurar, iniciar e acompanhar o Audiofy.
As credenciais ficam em `.env` ou `.audiofy/`, fora do Git. Episódios e logs devem
continuar retomáveis e auditáveis.

## Relação com o núcleo

Correções de fontes, provedores, pipeline, runtime, segurança ou artefatos devem ser
propostas no `main`. Esta branch contém somente configuração e fluxos internos.
