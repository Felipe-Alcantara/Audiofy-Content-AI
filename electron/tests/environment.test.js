"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildBridgeEnvironment, resolveRendererTarget } = require("../environment");

test("bridge remove somente valores que vieram do dotenv", () => {
  const environment = buildBridgeEnvironment({
    OPENROUTER_API_KEY: "chave-antiga",
    AUDIOFY_TEXT_MODEL: "modelo-antigo",
    AUDIOFY_DOTENV_LOADED_KEYS: "OPENROUTER_API_KEY,AUDIOFY_TEXT_MODEL",
    PATH: "/usr/bin",
  });

  assert.equal(environment.OPENROUTER_API_KEY, undefined);
  assert.equal(environment.AUDIOFY_TEXT_MODEL, undefined);
  assert.equal(environment.AUDIOFY_DOTENV_LOADED_KEYS, undefined);
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.PYTHONPATH, "src");
});

test("bridge preserva chave definida explicitamente no shell", () => {
  const environment = buildBridgeEnvironment({
    OPENROUTER_API_KEY: "chave-do-shell",
    AUDIOFY_DOTENV_LOADED_KEYS: "AUDIOFY_TEXT_MODEL",
  });

  assert.equal(environment.OPENROUTER_API_KEY, "chave-do-shell");
});

test("bridge ignora nomes inválidos na marca de procedência", () => {
  const environment = buildBridgeEnvironment({
    PATH: "/usr/bin",
    "../TOKEN": "preservado",
    "CHAVE COM ESPAÇO": "preservada",
    AUDIOFY_DOTENV_LOADED_KEYS: "PATH,../TOKEN,CHAVE COM ESPAÇO",
  });

  assert.equal(environment.PATH, undefined);
  assert.equal(environment["../TOKEN"], "preservado");
  assert.equal(environment["CHAVE COM ESPAÇO"], "preservada");
});

test("bridge força UTF-8 para não corromper acentos em caminhos", () => {
  const environment = buildBridgeEnvironment({ PATH: "/usr/bin" });

  // Sem isso o Python usa o encoding do console (cp1252 no Windows) e devolve
  // caminhos corrompidos, que o app rejeita por não casarem com a raiz.
  assert.equal(environment.PYTHONIOENCODING, "utf-8");
});

test("renderer padrão desta branch é o React, com escape hatch para o vanilla", () => {
  assert.deepEqual(resolveRendererTarget({}), { type: "file", target: "renderer/index-react.html" });
  assert.deepEqual(resolveRendererTarget({ AUDIOFY_RENDERER: "react" }),
    { type: "file", target: "renderer/index-react.html" });
  assert.deepEqual(resolveRendererTarget({ AUDIOFY_RENDERER: "vanilla" }),
    { type: "file", target: "renderer/index.html" });
});

test("servidor de dev do Vite só é usado quando explicitamente configurado", () => {
  assert.deepEqual(
    resolveRendererTarget({ AUDIOFY_RENDERER_DEV_URL: "http://localhost:5173" }),
    { type: "url", target: "http://localhost:5173" }
  );
  // No vanilla a URL de dev não faz sentido e é ignorada.
  assert.deepEqual(
    resolveRendererTarget({
      AUDIOFY_RENDERER: "vanilla",
      AUDIOFY_RENDERER_DEV_URL: "http://localhost:5173",
    }),
    { type: "file", target: "renderer/index.html" }
  );
});
