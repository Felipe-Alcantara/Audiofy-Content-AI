// Processo principal do Audiofy Desktop.
// Toda a lógica vive no backend Python; esta camada só chama a bridge JSON
// (python3 -m audiofy.bridge <cmd>) e repassa o resultado ao renderer.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { buildBridgeEnvironment } = require("./environment");
const { resolveProjectPath, validateBridgeRequest } = require("./security");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.AUDIOFY_PYTHON || "python3";
const MAX_OUTPUT_LENGTH = 2 * 1024 * 1024;

function bridge(args, stdinData) {
  return new Promise((resolve) => {
    try {
      validateBridgeRequest(args, stdinData);
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }
    const child = spawn(PYTHON, ["-m", "audiofy.bridge", ...args], {
      cwd: PROJECT_ROOT,
      env: buildBridgeEnvironment(),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: "A operação excedeu o limite de 15 minutos." });
    }, 15 * 60 * 1000);
    const append = (current, chunk) => {
      const next = current + chunk;
      if (next.length > MAX_OUTPUT_LENGTH) {
        child.kill();
        finish({ ok: false, error: "A resposta do backend excedeu o limite seguro." });
      }
      return next.slice(0, MAX_OUTPUT_LENGTH);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: `Não foi possível iniciar o backend: ${error.message}` });
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") {
        finish({ ok: false, error: `Falha ao enviar dados ao backend: ${error.message}` });
      }
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (settled) return;
      try {
        finish(JSON.parse(stdout.trim().split("\n").pop()));
      } catch (parseError) {
        finish({ ok: false, error: (stderr || String(parseError)).slice(0, 500) });
      }
    });
    if (stdinData) child.stdin.write(stdinData);
    child.stdin.end();
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    title: "Audiofy Content AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile("renderer/index.html");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
}

async function openProjectPath(target) {
  try {
    const candidate = resolveProjectPath(target, PROJECT_ROOT);
    const [realRoot, realTarget] = await Promise.all([
      fs.promises.realpath(PROJECT_ROOT),
      fs.promises.realpath(candidate),
    ]);
    resolveProjectPath(realTarget, realRoot);
    return await shell.openPath(realTarget);
  } catch (error) {
    return `Não foi possível abrir o caminho: ${error.message}`;
  }
}

app.whenReady().then(() => {
  ipcMain.handle("bridge", (_event, args, stdinData) => bridge(args, stdinData));
  ipcMain.handle("open-path", (_event, target) => openProjectPath(target));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
