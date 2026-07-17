// Processo principal do Audiofy Desktop.
// Toda a lógica vive no backend Python; esta camada só chama a bridge JSON
// (python3 -m audiofy.bridge <cmd>) e repassa o resultado ao renderer.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.AUDIOFY_PYTHON || "python3";

function bridge(args, stdinData) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-m", "audiofy.bridge", ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: "src" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop()));
      } catch (parseError) {
        resolve({ ok: false, error: (stderr || String(parseError)).slice(0, 500) });
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
    title: "Audiofy Content AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile("renderer/index.html");
}

app.whenReady().then(() => {
  ipcMain.handle("bridge", (_event, args, stdinData) => bridge(args, stdinData));
  ipcMain.handle("open-path", (_event, target) => shell.openPath(target));
  ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
