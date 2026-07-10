const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");

function readBootConfig() {
  try {
    const configPath = process.env.BLACKBOX_DESKTOP_CONFIG_PATH;
    if (!configPath) return { apiBase: "", apiToken: "" };
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      apiBase: String(parsed.serverUrl || "").trim().replace(/\/+$/, ""),
      apiToken: String(parsed.apiToken || "").trim()
    };
  } catch {
    return { apiBase: "", apiToken: "" };
  }
}

const bootConfig = readBootConfig();
contextBridge.exposeInMainWorld("BLACKBOX_CONFIG", bootConfig);

contextBridge.exposeInMainWorld("BlackBoxDesktop", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  openApp: () => ipcRenderer.invoke("app:open"),
  openSetup: () => ipcRenderer.invoke("app:setup")
});
