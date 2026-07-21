// Ponte segura entre renderer e processo principal (contextIsolation).

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("audiofy", {
  bridge: (args, stdinData) => ipcRenderer.invoke("bridge", args, stdinData),
  openPath: (target) => ipcRenderer.invoke("open-path", target),
  chooseBackgroundMusic: () => ipcRenderer.invoke("choose-background-music"),
  chooseContentFiles: () => ipcRenderer.invoke("choose-content-files"),
});
