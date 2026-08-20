// Casca ergonômica sobre window.audiofy (exposto por electron/preload.js).
// Uma função por comando da bridge Python (audiofy.bridge), na mesma ordem em
// que o renderer vanilla os usa. Mantém o formato de retorno original:
// { ok: true, ...dados } ou { ok: false, error: "..." } — quem chama trata os dois.

const BRIDGE_UNAVAILABLE = "Ponte com o processo principal (window.audiofy) indisponível.";

function callBridge(args, stdinData) {
  if (!window.audiofy || typeof window.audiofy.bridge !== "function") {
    return Promise.resolve({ ok: false, error: BRIDGE_UNAVAILABLE });
  }
  return window.audiofy.bridge(args, stdinData);
}

function withLanguage(args, language) {
  if (language) args.push(`--language=${language}`);
  return args;
}

// ── Estado, custos e episódios ────────────────────────────────────────────

export function getStatus() {
  return callBridge(["status"]);
}

export function getCosts() {
  return callBridge(["costs"]);
}

export function abortEpisode(episodeId, language) {
  return callBridge(withLanguage(["abort", episodeId], language));
}

export function getAudioChunks(episodeId, language) {
  return callBridge(withLanguage(["audio-chunks", episodeId], language));
}

export function getGenerationLog(episodeId, language) {
  return callBridge(withLanguage(["generation-log", episodeId], language));
}

// Refaz apenas os trechos indicados; o resto do episódio já está pago e é
// reaproveitado pela retomada.
export function regenerateChunks(source, itemId, chunkIndexes, language) {
  return callBridge(
    withLanguage(["regenerate-chunks", source, itemId, chunkIndexes.join(",")], language)
  );
}

export function repairEpisode(source, itemId, language) {
  return callBridge(withLanguage(["repair", source, itemId], language));
}

export function generateEpisode(args) {
  return callBridge(args);
}

export function exportNotebookLm(source, itemId) {
  return callBridge(["notebooklm", source, itemId]);
}

// ── Posição de reprodução ─────────────────────────────────────────────────

export function savePlaybackPosition(source, seconds) {
  return callBridge(["playback-position-save", source, String(seconds)]);
}

export async function getPlaybackPosition(source) {
  const result = await callBridge(["playback-position-get", source]);
  return result.ok && typeof result.seconds === "number" ? result.seconds : null;
}

// ── Chat ──────────────────────────────────────────────────────────────────

export function sendChatMessage(message) {
  return callBridge(["chat", "principal"], message);
}

export function clearChat() {
  return callBridge(["chat-clear", "principal"]);
}

export function getChatHistory() {
  return callBridge(["chat-history", "principal"]);
}

// ── Fontes e itens ────────────────────────────────────────────────────────

export function getSources() {
  return callBridge(["sources"]);
}

export function syncSource(source) {
  return callBridge(["sync", source]);
}

export function getItems(source) {
  return callBridge(["items", source]);
}

export function searchItems(source, query) {
  return callBridge(["search", source, query]);
}

export function getItem(source, itemId) {
  return callBridge(["item", source, itemId]);
}

export function addUrl(url) {
  return callBridge(["add-url", url]);
}

export function addText(title, text) {
  return callBridge(["add-text"], JSON.stringify({ title, text }));
}

export function addFile(filePath) {
  return callBridge(["add-file", filePath]);
}

export function reextractFile(itemId) {
  return callBridge(["reextract-file", itemId]);
}

// ── Configurações, chaves, setup e perfis ─────────────────────────────────

export function getSettingsInfo() {
  return callBridge(["settings-info"]);
}

export function listKeys() {
  return callBridge(["keys-list"]);
}

export function addKey(name, value) {
  return callBridge(["keys-add", name], value);
}

export function removeKey(name) {
  return callBridge(["keys-remove", name]);
}

export function moveKey(name, direction) {
  return callBridge(["keys-move", name, direction]);
}

export function activateKey(name) {
  return callBridge(["keys-use", name]);
}

export function activateEnvironmentKey() {
  return callBridge(["keys-use-environment"]);
}

export function checkKey(name) {
  return callBridge(["keys-check", name]);
}

export function checkEnvironmentKey() {
  return callBridge(["keys-check-environment"]);
}

export function getBalance() {
  return callBridge(["balance"]);
}

export function setupCheck() {
  return callBridge(["setup-check"]);
}

export function setupInstall() {
  return callBridge(["setup-install"]);
}

export function getTtsCatalog() {
  return callBridge(["tts-catalog"]);
}

export function listModels() {
  return callBridge(["models-list"]);
}

export function listProfiles() {
  return callBridge(["profiles-list"]);
}

export function activateProfile(name) {
  return callBridge(["profiles-activate", name]);
}

export function removeProfile(name) {
  return callBridge(["profiles-remove", name]);
}

export function saveProfile(payload) {
  return callBridge(["profiles-save"], JSON.stringify(payload));
}

// ── Fora da bridge: diálogos e shell do processo principal ────────────────

export function openProjectPath(target) {
  if (!window.audiofy || typeof window.audiofy.openPath !== "function") {
    return Promise.resolve(BRIDGE_UNAVAILABLE);
  }
  return window.audiofy.openPath(target);
}

export function chooseBackgroundMusic() {
  if (!window.audiofy || typeof window.audiofy.chooseBackgroundMusic !== "function") {
    return Promise.resolve(null);
  }
  return window.audiofy.chooseBackgroundMusic();
}

export function chooseContentFiles() {
  if (!window.audiofy || typeof window.audiofy.chooseContentFiles !== "function") {
    return Promise.resolve([]);
  }
  return window.audiofy.chooseContentFiles();
}
