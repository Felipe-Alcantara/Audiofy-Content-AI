// Casca ergonômica sobre window.audiofy.bridge (exposto por electron/preload.js).
// Mesma API do backend Python (audiofy.bridge), uma função por comando.
// Mantém o formato de retorno da bridge original: { ok: true, ...dados } ou
// { ok: false, error: "..." } — os componentes tratam os dois casos.

function callBridge(args, stdinData) {
  if (!window.audiofy || typeof window.audiofy.bridge !== "function") {
    return Promise.resolve({
      ok: false,
      error: "Ponte com o processo principal (window.audiofy) indisponível.",
    });
  }
  return window.audiofy.bridge(args, stdinData);
}

export function getStatus() {
  return callBridge(["status"]);
}

export function getCosts() {
  return callBridge(["costs"]);
}

export function abortEpisode(episodeId, language) {
  const args = ["abort", episodeId];
  if (language) args.push(`--language=${language}`);
  return callBridge(args);
}

// Fora da bridge: abre um caminho do projeto no gerenciador de arquivos do SO
// (preload.js expõe openPath). Devolve a mensagem de erro, ou vazio em sucesso.
export function openProjectPath(target) {
  if (!window.audiofy || typeof window.audiofy.openPath !== "function") {
    return Promise.resolve("Ponte com o processo principal (window.audiofy) indisponível.");
  }
  return window.audiofy.openPath(target);
}
