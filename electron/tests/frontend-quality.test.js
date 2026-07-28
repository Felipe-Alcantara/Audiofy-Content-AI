"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererDirectory = path.resolve(__dirname, "../renderer");

function readRendererFile(name) {
  return fs.readFileSync(path.join(rendererDirectory, name), "utf8");
}

test("página usa um único landmark principal e painéis semânticos", () => {
  const html = readRendererFile("index.html");

  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.equal((html.match(/<section\b[^>]*role="tabpanel"/g) || []).length, 5);
  assert.match(html, /id="pf-presenters"[^>]*role="group"[^>]*aria-labelledby=/);
  assert.doesNotMatch(html, /<label>Apresentadores<\/label>/);
});

test("renderer não usa innerHTML para manipular a interface", () => {
  const renderer = readRendererFile("renderer.js");

  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
});

test("abas de perfil fixam a família do modelo de texto", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /"Claude Code": "claude-code"/);
  assert.match(renderer, /"Claude API": "openrouter"/);
  assert.match(renderer, /const lockedProvider = providerMap\[tabCategory\]/);
  assert.match(renderer, /pf-provider-field.*classList\.toggle\("hidden", Boolean\(lockedProvider\)\)/);
  assert.match(renderer, /providerSelect\.disabled = Boolean\(lockedProvider\)/);
  assert.match(renderer, /openProfileForm\(profile, category\)/);
});

test("TTS oferece uma lista única agrupada por tiers", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  assert.doesNotMatch(html, /id="pf-tts-vendor"/);
  assert.match(renderer, /function configureTtsPicker\(/);
  assert.match(renderer, /modelsCatalog\.tts_tiers/);
  assert.match(renderer, /Ultra-econômico — prototipagem/);
});

test("modelo TTS sem catálogo não pede uma voz inventada", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /Nenhuma voz catalogada para este modelo/);
  assert.match(renderer, /voiceElement\.disabled = true/);
  assert.doesNotMatch(renderer, /voiceElement\.type = "text"/);
});

test("vozes mostram nomes normalizados sem origem do catálogo", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /function voiceLabel\(voice, ttsModel\)/);
  assert.match(renderer, /replace\(\/\[_-\]\+\/g, " "\)/);
  assert.match(renderer, /languageNames =/);
  assert.match(renderer, /inglês \(EUA\)/);
  assert.match(renderer, /kokoroLanguages =/);
  assert.match(renderer, /português — Brasil/);
  assert.match(renderer, /function voiceToneLabel\(tone, voice\)/);
  assert.match(renderer, /character\.toUpperCase\(\)/);
  assert.doesNotMatch(renderer, /voz informada pelo OpenRouter/);
});

test("idioma da voz continua visível para provedores fora do Kokoro", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /isKokoroVoice = typeof voice === "string" && \/\^\[a-z\]\[fm\]\[_-\]\/i\.test\(voice\)/);
  assert.match(renderer, /if \(!isKokoroVoice\) return tone\.trim\(\);/);
  assert.match(renderer, /voiceToneLabel\(style, voice\)/);
  assert.match(renderer, /voiceToneLabel\(tone, name\)/);
});

test("trocar o TTS descarta voz que não pertence ao novo catálogo", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /voices\.some\(\(\[name\]\) => name === voice\) \? voice : voices\[0\]\[0\]/);
  assert.doesNotMatch(renderer, /configuração atual.*voiceLabel/);
});

test("leitura fiel usa o catálogo e os nomes normalizados do TTS ativo", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /info\.voice_catalogs\[info\.tts_model\]/);
  assert.match(renderer, /voiceLabel\(voice, info\.tts_model\)/);
  assert.match(renderer, /Nenhuma voz catalogada para este modelo/);
});

test("voz do perfil único não é perguntada novamente na geração", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /settingsInfo\.presenters\.length === 1/);
  assert.match(renderer, /!needsNarrator \|\| Boolean\(profileVoice\)/);
  assert.match(renderer, /updateGenerationMode\(\);/);
});

test("estilos preservam foco visível e preferência por menos movimento", () => {
  const styles = readRendererFile("styles.css");

  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("gerenciamento permite registrar, usar, trocar e verificar chaves", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  assert.match(html, /id="keys-summary"/);
  assert.match(html, /Registrar chave/);
  assert.match(renderer, /\["keys-use", key\.name\]/);
  assert.match(renderer, /\["keys-use-environment"\]/);
  assert.match(renderer, /\["keys-check", key\.name\]/);
  assert.match(renderer, /\["keys-check-environment"\]/);
  assert.match(renderer, /\["keys-move", key\.name, "up"\]/);
  assert.match(renderer, /#\$\{key\.priority\}/);
  assert.match(renderer, /row\.className = "key-row"/);
  assert.match(styles, /\.key-row \.row-main\s*\{[^}]*flex:\s*1 0 100%/s);
  assert.match(styles, /\.settings-grid\s*\{[^}]*grid-template-rows:\s*repeat\(2, max-content\)/s);
  assert.match(styles, /#tab-content\s*\{[^}]*grid-template-rows:\s*minmax\(280px, 45vh\)/s);
});

test("leitura fiel permite escolher um narrador sem enviar texto reescrito", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  assert.match(html, /id="generation-mode"/);
  assert.match(html, /value="verbatim">Leitura fiel, sem reescrita/);
  assert.match(html, /id="narration-voice"/);
  assert.match(renderer, /`--mode=\$\{selectedMode\}`/);
  assert.match(renderer, /`--voice=\$\{selectedVoice\}`/);
  assert.match(renderer, /O texto não será reescrito/);
  assert.match(renderer, /selectedItem\.estimates\[mode\]/);
  assert.match(renderer, /renderItemEstimate\(\)/);
});

test("abort diferencia encerramento imediato do fallback por checkpoint", () => {
  const renderer = readRendererFile("renderer.js");

  assert.match(renderer, /result\.stopped/);
  assert.match(renderer, /Geração abortada agora/);
  assert.match(renderer, /aguardando o primeiro checkpoint disponível/);
});

test("conteúdo mostra log vivo e atividade do worker sem HTML dinâmico", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  assert.match(html, /id="generation-log-panel"/);
  assert.match(html, /id="generation-log"[^>]*role="log"/s);
  assert.match(renderer, /\["generation-log", itemId\]/);
  assert.match(renderer, /result\.worker_alive/);
  assert.match(renderer, /output\.textContent/);
  assert.match(renderer, /chave efetiva:/);
  assert.match(renderer, /configChip\("Chave efetiva"/);
  assert.match(styles, /#generation-log\s*\{[^}]*max-height:\s*230px/s);
});

test("modal permite auditar e ouvir chunks individualmente", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  assert.match(html, /<dialog id="chunk-modal"/);
  assert.match(html, /id="btn-chunk-toggle"/);
  assert.match(renderer, /"audio-chunks", itemId/);
  assert.match(renderer, /projectPathToFileUrl\(chunk\.path\)/);
  assert.match(renderer, /chunk\.longest_silence_seconds/);
  assert.match(renderer, /Chunk \$\{chunkIndex\} de \$\{chunkTotal\}/);
  assert.match(renderer, /chunk\.file/);
  assert.match(renderer, /chunk-now-playing"\)\.textContent = "Escolha um chunk para ouvir\./);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
});

test("música de fundo usa seletor nativo, volume limitado e confirma direitos", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const preload = fs.readFileSync(path.resolve(__dirname, "../preload.js"), "utf8");
  const main = fs.readFileSync(path.resolve(__dirname, "../main.js"), "utf8");

  assert.match(html, /id="btn-background-music"/);
  assert.match(html, /id="background-volume"[^>]*min="1"[^>]*max="25"/s);
  assert.match(html, /direito de publicar/);
  assert.match(preload, /chooseBackgroundMusic/);
  assert.match(main, /dialog\.showOpenDialog/);
  assert.match(renderer, /`--background-music=\$\{backgroundMusic\}`/);
  assert.match(renderer, /`--background-volume=\$\{volume \|\| 0\.08\}`/);
});

test("catálogo de episódios mostra datas, duração, arquivo e auditoria", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  assert.match(html, /id="episodes-summary"/);
  assert.match(renderer, /Criação do conteúdo/);
  assert.match(renderer, /Geração do áudio/);
  assert.match(renderer, /formatEpisodeDuration\(episode\.duration_seconds\)/);
  assert.match(renderer, /formatFileSize\(episode\.file_size_bytes\)/);
  assert.match(renderer, /episode\.audio_audit\.critical/);
  assert.match(styles, /\.episode-facts\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.episode-actions\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /\.player-dock audio\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(styles, /\.player-title\s*\{[^}]*flex:\s*0 0 auto/s);
});

test("escolhas que custam crédito não mudam sozinhas com a roda do mouse", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  // A roda sobre um <select> troca a opção no Chromium sem o usuário perceber.
  assert.match(
    renderer,
    /GENERATION_OPTION_IDS = \["narration-voice", "generation-mode", "generation-language"\]/,
  );
  assert.match(renderer, /addEventListener\("wheel", \(event\) => event\.preventDefault\(\)/);

  // Só uma escolha deliberada sobrepõe a voz do perfil ao redesenhar o combo.
  assert.match(renderer, /voiceTouchedByUser && previousVoice/);
  assert.match(renderer, /voiceTouchedByUser = true/);

  // E a divergência precisa ficar visível, com volta em um clique.
  assert.match(html, /id="narration-voice-hint"/);
  assert.match(renderer, /Diferente do perfil/);
  assert.match(renderer, /markVoiceMatchesProfile/);
});

test("configuração da geração fica travada enquanto o episódio é sintetizado", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  // Trocar voz/formato/idioma no meio misturaria configurações no mesmo episódio:
  // os segmentos já sintetizados não mudam.
  assert.match(renderer, /function lockGenerationOptions\(running\)/);
  assert.match(renderer, /\$\(id\)\.disabled = running/);
  assert.match(renderer, /lockGenerationOptions\(Boolean\(running\)\)/);
  assert.match(renderer, /btn-background-music"\)\.disabled = running/);
  assert.match(renderer, /background-volume"\)\.disabled = running/);

  // Sem item selecionado não há geração para proteger — a trava precisa sair.
  assert.match(renderer, /lockGenerationOptions\(false\)/);

  // E o motivo da trava precisa estar visível, não só o campo cinza.
  assert.match(html, /id="generation-options-lock"/);
  assert.match(html, /aborte e gere novamente/);
  assert.match(styles, /\.options-lock\s*\{/);
});

test("reabrir o teleprompter sempre remove o listener de timeupdate anterior", () => {
  const renderer = readRendererFile("renderer.js");

  // Reabrir sem passar por closeTeleprompter (ex.: clicar em "acompanhar" de
  // outro episódio) deixaria um listener órfão no <audio>, que é persistente
  // no DOM — cada um retém em closure o texto/turnos inteiros do episódio
  // anterior. openTeleprompter precisa desanexar antes de registrar um novo.
  assert.match(renderer, /function detachTeleprompterTimeUpdate\(\)/);
  const openTeleprompterBody = renderer.match(
    /async function openTeleprompter\(episode\) \{([\s\S]*?)\n\}/
  )[1];
  assert.match(openTeleprompterBody, /detachTeleprompterTimeUpdate\(\);/);
  assert.match(renderer, /function closeTeleprompter\(\) \{[\s\S]*?detachTeleprompterTimeUpdate\(\);/);
});

test("acompanhar a leitura numera os parágrafos e permite pular por número", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  assert.match(html, /id="teleprompter-goto-form"/);
  assert.match(html, /id="teleprompter-goto-input"[^>]*type="number"/);
  assert.match(renderer, /makeElement\("span", "turn-number", `\$\{paragraphNumber\}`\)/);
  assert.match(renderer, /"teleprompter-goto-form"\)\.addEventListener\("submit"/);
  assert.match(
    renderer,
    /teleprompterTimingChunks\.find\(\(item\) => item\.paragraphNumber === target\)/
  );
  assert.match(renderer, /player\.currentTime = entry\.chunk\.start_seconds;/);
});

test("clicar num parágrafo do teleprompter pula o áudio para aquele trecho", () => {
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  assert.match(renderer, /turn\.setAttribute\("role", "button"\)/);
  assert.match(renderer, /player\.currentTime = chunk\.start_seconds;/);
  assert.match(renderer, /turn\.onclick = jumpToChunk;/);
  assert.match(renderer, /turn\.onkeydown = \(event\) => \{/);
  assert.match(styles, /\.teleprompter-turn\.clickable \{ cursor: pointer; \}/);

  // Sem janela temporal auditada não há como pular com precisão — não finge
  // que o clique funciona nesse caso.
  assert.match(renderer, /if \(hasTiming\) classNames\.push\("clickable"\);/);
});

test("o teleprompter só rola a tela quando o parágrafo ativo muda", () => {
  const renderer = readRendererFile("renderer.js");

  // timeupdate dispara várias vezes por segundo; chamar scrollIntoView em
  // todo tick (mesmo com o mesmo parágrafo ainda ativo) cancelava qualquer
  // tentativa do usuário de rolar manualmente — a tela "subia sozinha" de
  // volta ao centro a cada fração de segundo.
  const handlerBody = renderer.match(
    /teleprompterTimeUpdateHandler = \(\) => \{([\s\S]*?)\n {2}\};/
  )[1];
  assert.match(handlerBody, /if \(activeEntry === teleprompterLastActiveEntry\) return;/);
  assert.match(handlerBody, /teleprompterLastActiveEntry = activeEntry;/);
  assert.match(handlerBody, /activeEntry\.element\.scrollIntoView\(/);
});

test("botão 'voltar ao parágrafo atual' aparece ao rolar para longe do destaque", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  assert.match(html, /id="btn-teleprompter-follow"[^>]*class="teleprompter-follow hidden"/);
  assert.match(renderer, /function updateTeleprompterFollowButton\(\)/);
  assert.match(
    renderer,
    /"teleprompter-text"\)\.addEventListener\("scroll", updateTeleprompterFollowButton\)/
  );
  assert.match(renderer, /"btn-teleprompter-follow"\)\.onclick = \(\) => \{/);

  // O botão precisa checar se o parágrafo ativo está fora da área visível
  // do container (não só "existe um ativo") — senão ficaria sempre visível.
  assert.match(renderer, /getBoundingClientRect\(\)/);
  assert.match(styles, /\.teleprompter-follow \{/);
});

test("existe um único <audio> real e ele nunca sai do dock", () => {
  const html = readRendererFile("index.html");
  const renderer = readRendererFile("renderer.js");

  // Três elementos <audio> separados tocavam ao mesmo tempo sem se avisar —
  // clicar em "ouvir" no card e depois em "acompanhar" sobrepunha dois áudios.
  assert.equal((html.match(/<audio\b/g) || []).length, 1);
  assert.match(html, /<audio id="episode-player"/);

  // O <audio> mora no dock e fica lá. Movê-lo pelo DOM (appendChild move o
  // elemento, não copia) enquanto tocava reiniciava a mídia no Chromium e
  // deixava o player mudo ao voltar — a reprodução não pode depender de qual
  // janela está aberta.
  assert.doesNotMatch(renderer, /function movePlayerTo\b/);
  assert.doesNotMatch(renderer, /function movePlayerHome\b/);
  assert.doesNotMatch(renderer, /appendChild\(\$\("episode-player"\)\)/);
  assert.doesNotMatch(html, /id="chunk-player-slot"/);
  assert.doesNotMatch(html, /id="teleprompter-player-slot"/);
});

test("modais comandam o player do dock em vez de sequestrá-lo", () => {
  const renderer = readRendererFile("renderer.js");

  // Abrir "acompanhar" com o episódio tocando não pode pausar nem trocar a
  // fonte: o usuário só quer ver o texto do que já está ouvindo.
  const abrirTeleprompter = renderer.match(
    /async function openTeleprompter\(episode\) \{([\s\S]*?)\n\}/
  );
  assert.ok(abrirTeleprompter, "openTeleprompter deve existir");
  assert.doesNotMatch(abrirTeleprompter[1], /\$\("episode-player"\)\.pause\(\)/);

  // Fechar qualquer um dos modais devolve o controle ao dock sem destruir a
  // mídia carregada — nada de removeAttribute("src") no caminho do episódio.
  const fecharTeleprompter = renderer.match(/function closeTeleprompter\(\) \{([\s\S]*?)\n\}/);
  assert.ok(fecharTeleprompter, "closeTeleprompter deve existir");
  assert.doesNotMatch(fecharTeleprompter[1], /removeAttribute\("src"\)/);
});

test("abrir o acompanhamento nomeia o episódio no dock", () => {
  const renderer = readRendererFile("renderer.js");

  // Com o player fixo no dock, ele fica à vista ao abrir o teleprompter: sem
  // atualizar o título, o dock anunciava "Nenhum episódio selecionado" enquanto
  // o áudio daquele episódio tocava.
  const abrir = renderer.match(/async function openTeleprompter\(episode\) \{([\s\S]*?)\n\}/);
  assert.ok(abrir, "openTeleprompter deve existir");
  assert.match(abrir[1], /\$\("player-title"\)\.textContent = `🎧 \$\{title\}`/);
});

test("o dock fica visível enquanto um modal de áudio está aberto", () => {
  const renderer = readRendererFile("renderer.js");

  // Com o player fixo no dock, esconder o dock esconderia os controles do que
  // está tocando: quem abre o teleprompter precisa continuar podendo pausar.
  assert.match(renderer, /function ensurePlayerDockVisible\(\)/);
  assert.match(renderer, /\$\("player-dock"\)\.classList\.remove\("hidden"\)/);
});

test("teleprompter permite arrastar o texto para rolar, como num celular", () => {
  const renderer = readRendererFile("renderer.js");
  const styles = readRendererFile("styles.css");

  const dragSetupBody = renderer.match(
    /function setupTeleprompterDragScroll\(\) \{([\s\S]*?)\n\}/
  )[1];
  assert.match(dragSetupBody, /const container = \$\("teleprompter-text"\);/);
  assert.match(dragSetupBody, /addEventListener\("mousedown"/);
  assert.match(dragSetupBody, /addEventListener\("mousemove"/);
  assert.match(dragSetupBody, /addEventListener\("mouseup"/);
  assert.match(dragSetupBody, /addEventListener\("mouseleave"/);
  assert.match(renderer, /setupTeleprompterDragScroll\(\);\s*$/m);

  // Um clique num parágrafo (que pula o áudio) não pode virar um "arraste"
  // acidental — só ativa scroll de fato depois de um deslocamento mínimo.
  assert.match(renderer, /DRAG_THRESHOLD_PX/);
  assert.match(renderer, /Math\.abs\([^)]*\) > DRAG_THRESHOLD_PX/);

  // Enquanto arrasta, o cursor muda e cliques de parágrafo ficam suspensos —
  // senão o mouseup do fim do arraste dispararia jumpToChunk sem querer.
  assert.match(styles, /\.teleprompter-text\.dragging/);
  assert.match(renderer, /classList\.(add|toggle)\("dragging"/);

  // Soltar o mouse em movimento continua o scroll com inércia (momentum),
  // igual ao gesto de arrastar rápido num celular — não para seco.
  const dragSetupBody2 = renderer.match(
    /function setupTeleprompterDragScroll\(\) \{([\s\S]*?)\n\}/
  )[1];
  assert.match(dragSetupBody2, /requestAnimationFrame/);
  assert.match(dragSetupBody2, /cancelAnimationFrame/);
  assert.match(dragSetupBody2, /velocity/i);

  // Um novo arraste ou giro da roda do mouse durante a inércia precisa
  // cancelá-la — senão os dois scrolls competiriam entre si.
  assert.match(dragSetupBody2, /function stopInertia\(\)/);
  assert.match(dragSetupBody2, /addEventListener\("mousedown".*\n\s*stopInertia\(\);/);
  assert.match(dragSetupBody2, /addEventListener\("wheel", stopInertia/);
});

test("retoma a reprodução de onde parou, mesmo depois de fechar o app", () => {
  const renderer = readRendererFile("renderer.js");

  // Persiste via bridge Python (escrita atômica em arquivo), não o
  // armazenamento de página do Chromium: ele não garante sincronização
  // física imediata — fechar a janela abruptamente perdia todo o progresso
  // ainda não commitado, e o resume sempre voltava para o início.
  assert.doesNotMatch(renderer, /localStorage\./);
  assert.match(renderer, /function savePlaybackPosition\(source, currentTime\)/);
  assert.match(renderer, /async function readSavedPlaybackPosition\(source\)/);
  assert.match(renderer, /bridge\(\["playback-position-save", source, String\(currentTime\)\]\)/);
  assert.match(renderer, /bridge\(\["playback-position-get", source\]\)/);

  // Chamar a bridge a cada tick de timeupdate spawnaria um processo Python
  // várias vezes por segundo — precisa ser limitado no tempo.
  assert.match(renderer, /PLAYBACK_POSITION_SAVE_INTERVAL_MS/);
  assert.match(renderer, /now - lastPlaybackPositionSaveAt < PLAYBACK_POSITION_SAVE_INTERVAL_MS/);

  // seekWhenReady é compartilhada por playInApp e openTeleprompter (os dois
  // trocam a fonte do player). Definir currentTime logo após src/load() é
  // ignorado silenciosamente: o elemento ainda não resolveu metadata/
  // seekability nesse instante — por isso o resume sempre voltava para o
  // início. Precisa esperar loadedmetadata quando o player não estiver pronto.
  const seekWhenReadyBody = renderer.match(
    /function seekWhenReady\(player, seconds\) \{([\s\S]*?)\n\}/
  )[1];
  assert.match(seekWhenReadyBody, /readyState >= HTMLMediaElement\.HAVE_METADATA/);
  assert.match(seekWhenReadyBody, /addEventListener\("loadedmetadata", applyPosition, \{ once: true \}\)/);

  // playInApp precisa ler a posição ANTES de setPlayerSource trocar
  // dataset.source: assim que ele aponta pra nova URL, o listener global de
  // timeupdate já trata o player como "válido" para salvar, e load() dispara
  // timeupdate com currentTime=0 durante o await — sobrescrevendo a posição
  // salva com zero antes dela ser lida/aplicada, se a ordem for invertida.
  const playInAppBody = renderer.match(
    /async function playInApp\(path, title\) \{([\s\S]*?)\n\}/
  )[1];
  const readIndexInPlayInApp = playInAppBody.indexOf("readSavedPlaybackPosition");
  const setSourceIndexInPlayInApp = playInAppBody.indexOf("setPlayerSource(path, title)");
  assert.ok(readIndexInPlayInApp !== -1 && setSourceIndexInPlayInApp !== -1);
  assert.ok(readIndexInPlayInApp < setSourceIndexInPlayInApp);
  assert.match(playInAppBody, /isNewSource/);
  assert.match(playInAppBody, /seekWhenReady\(player, savedPosition\)/);

  // Mesma correção de ordem no teleprompter — reportado pelo usuário
  // especificamente nesse caminho ("estou abrindo pelo teleprompter"), que
  // não reusava playInApp e trocava player.src/dataset.source direto, sem
  // nenhuma lógica de resume.
  const openTeleprompterBody = renderer.match(
    /async function openTeleprompter\(episode\) \{([\s\S]*?)\n\}/
  )[1];
  const readIndexInTeleprompter = openTeleprompterBody.indexOf("readSavedPlaybackPosition");
  const setSrcIndexInTeleprompter = openTeleprompterBody.indexOf("player.src = url;");
  assert.ok(readIndexInTeleprompter !== -1 && setSrcIndexInTeleprompter !== -1);
  assert.ok(readIndexInTeleprompter < setSrcIndexInTeleprompter);
  assert.match(openTeleprompterBody, /seekWhenReady\(player, savedPosition\)/);

  // A posição é salva ao ouvir (timeupdate) e ao pausar/trocar de episódio,
  // não só ao fechar o app — não há hook de "antes de fechar" confiável o
  // bastante para não perder o progresso de um fechamento abrupto. Só
  // enquanto o player está de fato tocando: um timeupdate com currentTime=0
  // pode disparar antes do seekWhenReady aplicar a posição salva, e um
  // player pausado nunca teve progresso real desta sessão para registrar.
  const timeUpdateSaverBody = renderer.match(
    /\$\("episode-player"\)\.addEventListener\("timeupdate", \(\) => \{([\s\S]*?)\n\}\);/
  )[1];
  assert.match(timeUpdateSaverBody, /if \(player\.paused\) return;/);
  assert.match(timeUpdateSaverBody, /savePlaybackPosition/);
});
