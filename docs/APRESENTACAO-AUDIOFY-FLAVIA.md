# Audiofy Content AI — apresentação para a Flávia

> Roteiro de apresentação em português. Público: operação da Vitis Souls e estratégia do Meu Ecoo.
> Os números desta apresentação são a fonte factual compartilhada com a versão em inglês para o Cameron.

## 1. A ideia em uma frase

O Audiofy transforma conteúdo escrito em episódios de podcast ou audiolivros com leitura rastreável, voz natural e custo visível durante a geração.

## 2. O problema que resolve

Conteúdo bom costuma ficar preso em texto: difícil de consumir no celular, impossível de acompanhar em lote e caro de gerar sem saber quanto cada episódio realmente custou.

O Audiofy organiza esse caminho em um pipeline que deixa evidências: fonte original, cobertura, roteiro, auditoria, segmentos de áudio e custo.

## 3. O que já existe

- Podcast adaptado com um ou mais apresentadores.
- Leitura fiel de livros e textos longos, sem transformar o texto em resumo.
- Fontes por texto, URL, arquivos e fontes registradas.
- Idioma do episódio, apresentadores e vozes configuráveis.
- Progresso, retomada por checkpoint e custo acumulado em tempo real.
- App desktop Electron com abas de conteúdo, episódios, custos e configurações.
- Renderer React migrado e usado como padrão do desktop.
- TTS paralelizado: benchmark real de aproximadamente 8x em 12 trechos.

## 4. Demonstração prática

Abrir `python3 start_app.py` → **Abrir app desktop**.

1. Abrir um dos 12 episódios já gerados.
2. Mostrar a fonte original e o episódio final lado a lado.
3. Tocar um trecho no player.
4. Abrir os artefatos do episódio: roteiro, auditoria, segmentos e `NOTES.md`.
5. Mostrar o painel de custo e explicar que uma geração pode ser retomada sem pagar novamente os segmentos já concluídos.

### Episódios disponíveis para a demonstração

Os 12 episódios estão versionados em `data/episodes/`. Escolher o conteúdo pelo melhor encaixe com a conversa; a prova importante é o conjunto de artefatos, não um episódio específico.

## 5. Evidência de custo

Estudo real com 12 episódios já gerados:

| Métrica | Resultado |
| --- | ---: |
| Duração total | 5h 40min 55s |
| Palavras de roteiro | 50.024 |
| Custo total | US$ 6,85 |
| Custo médio por episódio | US$ 0,57 |
| Custo médio por minuto | US$ 0,02 |

O motor barato `kokoro-82m` foi descartado como padrão por qualidade de voz e ausência de PT-BR nativo. O Gemini TTS, aproximadamente US$ 0,036/minuto no cenário medido, é hoje a opção viável para português. O preço é uma decisão de qualidade, não um custo invisível.

## 6. O que ainda não está pronto

- A apresentação não deve vender o Audiofy como produto público acabado.
- A geração real depende de chave e créditos do provedor.
- A revisão humana do áudio continua sendo necessária nos pilotos.
- O STT/pós-auditoria automática ainda está no roadmap.
- O custo deve continuar sendo acompanhado quando volume e perfil mudarem.

## 7. Onde ele entra na estratégia

O Audiofy não é um projeto solto: o motor de áudio será incorporado ao Prisma como o módulo **Áudio-revisão**.

O Prisma organiza o estudo; o Audiofy torna o material consumível em áudio, preservando rastreabilidade e custo. A integração deve reutilizar o núcleo e a bridge, sem duplicar pipeline ou regras de segurança.

## 8. Próximos passos para decisão

1. Escolher um fluxo piloto do Prisma para incorporar o módulo Áudio-revisão.
2. Definir quais tipos de conteúdo merecem áudio primeiro.
3. Fixar limite de custo e revisão humana do piloto.
4. Rodar uma demonstração com conteúdo que represente o uso real da Vitis Souls.

## Mensagem de fechamento

O Audiofy já prova a parte difícil: produzir áudio natural com rastreabilidade e custo medido. A próxima decisão não é se a tecnologia funciona; é onde o áudio gera mais valor dentro do Prisma.
