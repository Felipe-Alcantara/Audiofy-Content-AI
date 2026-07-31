"use strict";

const DOTENV_PROVENANCE_ENV = "AUDIOFY_DOTENV_LOADED_KEYS";
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function buildBridgeEnvironment(baseEnvironment = process.env) {
  // A bridge responde em JSON com acentos e caminhos do projeto. Sem forçar
  // UTF-8, o Python usa o encoding do console (cp1252 no Windows) e devolve
  // caminhos corrompidos, que deixam de casar com a raiz validada pelo app.
  const environment = { ...baseEnvironment, PYTHONPATH: "src", PYTHONIOENCODING: "utf-8" };
  const dotenvKeys = (environment[DOTENV_PROVENANCE_ENV] || "").split(",");
  for (const key of dotenvKeys) {
    if (ENV_NAME.test(key)) delete environment[key];
  }
  delete environment[DOTENV_PROVENANCE_ENV];
  return environment;
}

// Nesta branch (feat/uso-publico) o renderer React é o padrão: ele tem paridade
// de telas com o vanilla, que continua no repositório como escape hatch
// (AUDIOFY_RENDERER=vanilla) e como base das outras superfícies. A URL de dev do
// Vite (HMR) só vale para o React e nunca está setada no app empacotado — é ela
// que justifica a CSP relaxada em modo de desenvolvimento.
function resolveRendererTarget(environment = process.env) {
  if (environment.AUDIOFY_RENDERER === "vanilla") {
    return { type: "file", target: "renderer/index.html" };
  }
  if (environment.AUDIOFY_RENDERER_DEV_URL) {
    return { type: "url", target: environment.AUDIOFY_RENDERER_DEV_URL };
  }
  return { type: "file", target: "renderer/index-react.html" };
}

module.exports = { buildBridgeEnvironment, resolveRendererTarget, DOTENV_PROVENANCE_ENV };
