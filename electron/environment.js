"use strict";

const DOTENV_PROVENANCE_ENV = "AUDIOFY_DOTENV_LOADED_KEYS";
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function buildBridgeEnvironment(baseEnvironment = process.env) {
  const environment = { ...baseEnvironment, PYTHONPATH: "src" };
  const dotenvKeys = (environment[DOTENV_PROVENANCE_ENV] || "").split(",");
  for (const key of dotenvKeys) {
    if (ENV_NAME.test(key)) delete environment[key];
  }
  delete environment[DOTENV_PROVENANCE_ENV];
  return environment;
}

module.exports = { buildBridgeEnvironment, DOTENV_PROVENANCE_ENV };
