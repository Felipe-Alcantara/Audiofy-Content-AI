#!/usr/bin/env node
"use strict";

/**
 * Verificação visual do app Electron: abre o aplicativo de verdade, percorre as
 * abas, mede o layout nas larguras exigidas pelo AGENTS.md e salva capturas.
 *
 * Existe porque o `AGENTS.md` pede verificação manual em 600 px e 380 px a cada
 * mudança visual, e porque os testes de componente (Vitest) rodam sobre jsdom:
 * eles não abrem o bundle real, não carregam a bridge e não enxergam estouro
 * horizontal. Automatizar essa passagem evita repetir o roteiro à mão.
 *
 * Fica fora de `check_quality.py` de propósito: precisa de servidor gráfico
 * (use `xvfb-run -a` em ambiente headless) e sobe o app completo, o que é lento
 * demais para a régua rodada a cada commit.
 *
 * Uso:
 *   node scripts/verify_app_ui.js [--out=<pasta>] [--widths=600,380] [--keep-open]
 *   xvfb-run -a node scripts/verify_app_ui.js        # ambiente sem display
 *
 * Saída: um JSON no stdout com abas visitadas, medidas por largura, capturas
 * geradas e erros de console. Código de saída 1 quando alguma verificação falha.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ELECTRON_DIR = path.join(PROJECT_ROOT, "electron");
/** Larguras exigidas pelo AGENTS.md para toda mudança visual no Electron. */
const DEFAULT_WIDTHS = [600, 380];
const VIEWPORT_HEIGHT = 900;
/** O primeiro carregamento sobe a bridge Python e consulta perfil e chaves. */
const BOOT_TIMEOUT_MS = 30_000;
const TAB_SETTLE_MS = 1_200;

function parseArguments(argv) {
  const options = {
    out: path.join(os.tmpdir(), "audiofy-ui-check"),
    widths: DEFAULT_WIDTHS,
    keepOpen: false,
  };
  for (const argument of argv) {
    if (argument.startsWith("--out=")) {
      options.out = path.resolve(argument.slice("--out=".length));
    } else if (argument.startsWith("--widths=")) {
      options.widths = argument
        .slice("--widths=".length)
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10));
      if (options.widths.some((width) => !Number.isInteger(width) || width < 200)) {
        throw new Error("--widths aceita apenas larguras inteiras a partir de 200.");
      }
    } else if (argument === "--keep-open") {
      options.keepOpen = true;
    } else {
      throw new Error(`Opção desconhecida: ${argument}`);
    }
  }
  return options;
}

/**
 * O playwright-core é dependência de desenvolvimento do Electron, não da raiz:
 * resolvê-lo a partir de `electron/` mantém o script funcionando de qualquer
 * diretório de trabalho e dá uma mensagem útil quando o `npm install` falta.
 */
function loadPlaywright() {
  try {
    return require(require.resolve("playwright-core", { paths: [ELECTRON_DIR] }));
  } catch (error) {
    throw new Error(
      "playwright-core não encontrado. Rode 'npm install' dentro de electron/ antes " +
        `da verificação visual. Detalhe: ${error.message}`
    );
  }
}

async function collectTabs(page) {
  const tabs = page.getByRole("tab");
  const total = await tabs.count();
  const names = [];
  for (let index = 0; index < total; index += 1) {
    names.push((await tabs.nth(index).innerText()).trim());
  }
  return names;
}

async function measure(page, width, outputDir, label) {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.waitForTimeout(TAB_SETTLE_MS);
  // `globalThis` em vez de `document`/`window` diretos: a função roda no
  // contexto da página, mas é lintada aqui como código Node.
  const metrics = await page.evaluate(() => ({
    scrollWidth: globalThis.document.documentElement.scrollWidth,
    innerWidth: globalThis.innerWidth,
  }));
  const screenshot = path.join(outputDir, `${label}-${width}px.png`);
  await page.screenshot({ path: screenshot });
  return {
    width,
    ...metrics,
    overflow: metrics.scrollWidth > metrics.innerWidth,
    screenshot,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });
  const { _electron: electron } = loadPlaywright();

  const app = await electron.launch({ args: [ELECTRON_DIR], cwd: PROJECT_ROOT });
  const consoleErrors = [];
  let report;
  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("tab").first().waitFor({ timeout: BOOT_TIMEOUT_MS });

    const tabs = await collectTabs(page);
    const measurements = [];
    for (const name of tabs) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
      const label = name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
      for (const width of options.widths) {
        measurements.push({ tab: name, ...(await measure(page, width, options.out, label)) });
      }
    }

    const overflowing = measurements.filter((entry) => entry.overflow);
    report = {
      tabs,
      widths: options.widths,
      measurements,
      consoleErrors,
      ok: overflowing.length === 0 && consoleErrors.length === 0,
      output: options.out,
    };
  } finally {
    if (!options.keepOpen) await app.close();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(
      "Verificação visual reprovada: layout com estouro horizontal ou erro de console."
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Verificação visual falhou: ${error.message}`);
  process.exitCode = 1;
});
