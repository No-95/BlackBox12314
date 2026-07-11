const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
let mainWindow = null;
let authFilterRegistered = false;
let tunnelProcess = null;

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function getBuiltInDefaults() {
  try {
    const defaultsPath = path.join(__dirname, "defaults.json");
    const parsed = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
    return {
      serverUrl: String(parsed.serverUrl || "").trim().replace(/\/+$/, ""),
      apiToken: String(parsed.apiToken || "").trim()
    };
  } catch {
    return {
      serverUrl: "",
      apiToken: ""
    };
  }
}

function readConfig() {
  const defaults = getBuiltInDefaults();
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      serverUrl: String(parsed.serverUrl || defaults.serverUrl || "").trim().replace(/\/+$/, ""),
      apiToken: String(parsed.apiToken || defaults.apiToken || "").trim()
    };
  } catch {
    return defaults;
  }
}

function ensureConfigFile() {
  const config = readConfig();
  if (!fs.existsSync(getConfigPath())) {
    writeConfig(config);
  }
  return config;
}

function writeConfig(config) {
  const defaults = getBuiltInDefaults();
  const next = {
    serverUrl: String(config.serverUrl || defaults.serverUrl || "").trim().replace(/\/+$/, ""),
    apiToken: String(config.apiToken || defaults.apiToken || "").trim()
  };
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function getUiRoot() {
  if (isDev) {
    return path.join(__dirname, "../sales-dashboard/public");
  }
  return path.join(process.resourcesPath, "ui");
}

function getTunnelLogPath() {
  const candidates = [
    path.join(app.getPath("userData"), "blackbox-ssh.log"),
    path.join(app.getPath("appData"), "BlackBox", "blackbox-ssh.log"),
    path.join(process.env.USERPROFILE || "C:\\Users\\Default", "AppData", "Roaming", "BlackBox", "blackbox-ssh.log")
  ];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      return candidate;
    } catch {}
  }

  return candidates[0];
}

function appendTunnelLog(message) {
  try {
    const logPath = getTunnelLogPath();
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, "utf8");
  } catch {}
}

function notifyTunnelFailure(message) {
  try {
    dialog.showErrorBox("BlackBox connection failed", `${message}\n\nCheck the log file at ${getTunnelLogPath()} for details.`);
  } catch {}
}

function startTunnel() {
  if (tunnelProcess || process.platform !== "win32") {
    return null;
  }

  try {
    const sshPath = "C:\\Windows\\System32\\OpenSSH\\ssh.exe";
    const child = spawn(sshPath, [
      "-N",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=10",
      "-L",
      "5178:127.0.0.1:5177",
      "blackbox@171.225.204.101"
    ], {
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk) => appendTunnelLog(chunk.toString()));
    child.stderr?.on("data", (chunk) => appendTunnelLog(chunk.toString()));
    child.on("error", (error) => {
      appendTunnelLog(`ssh spawn error: ${error.message}`);
      notifyTunnelFailure(`SSH tunnel failed to start.\n${error.message}`);
    });
    child.on("exit", (code, signal) => {
      appendTunnelLog(`ssh exited code=${code} signal=${signal}`);
      if (code !== 0 && code !== null) {
        notifyTunnelFailure(`SSH tunnel disconnected unexpectedly.\nExit code: ${code}`);
      }
    });

    child.unref();
    tunnelProcess = child;
    appendTunnelLog("ssh tunnel launch requested");
    return child;
  } catch (error) {
    appendTunnelLog(`ssh launch exception: ${error && error.message ? error.message : String(error)}`);
    return null;
  }
}

function stopTunnel() {
  if (!tunnelProcess) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(tunnelProcess.pid), "/T", "/F"], {
        stdio: "ignore"
      });
    }
  } catch {}
  tunnelProcess = null;
}

function getAppIconPath() {
  const packaged = path.join(__dirname, "icon.png");
  const dev = path.join(__dirname, "../icon.png");
  if (fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(dev)) return dev;
  return undefined;
}

function createWindow() {
  process.env.BLACKBOX_DESKTOP_CONFIG_PATH = getConfigPath();

  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "BlackBox",
    backgroundColor: "#f4f1ea",
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerAuthHeaderInjection(config) {
  if (authFilterRegistered || !config.serverUrl || !config.apiToken) {
    return;
  }

  const filter = {
    urls: [`${config.serverUrl}/*`]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${config.apiToken}`;
    }
    callback({ requestHeaders: headers });
  });

  authFilterRegistered = true;
}

async function showApp() {
  const config = ensureConfigFile();
  process.env.BLACKBOX_DESKTOP_CONFIG_PATH = getConfigPath();
  registerAuthHeaderInjection(config);

  if (!mainWindow) createWindow();

  const uiIndex = path.join(getUiRoot(), "index.html");
  if (!fs.existsSync(uiIndex)) {
    throw new Error(`UI bundle missing at ${uiIndex}`);
  }

  await mainWindow.loadFile(uiIndex);

  await mainWindow.webContents.executeJavaScript(`
    (function () {
      const frame = document.getElementById("visionistFrame");
      if (frame && window.BlackBox?.visionistAppUrl) {
        frame.src = window.BlackBox.visionistAppUrl();
      }
      true;
    })();
  `);
}

ipcMain.handle("config:get", () => readConfig());

ipcMain.handle("config:save", (_event, config) => {
  const saved = writeConfig(config || {});
  authFilterRegistered = false;
  registerAuthHeaderInjection(saved);
  return saved;
});

ipcMain.handle("app:open", async () => {
  await showApp();
  return true;
});

ipcMain.handle("app:setup", async () => {
  // Setup UI disabled for single-user install; always open the app.
  await showApp();
  return true;
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  startTunnel();
  createWindow();
  await showApp();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      await showApp();
    }
  });
});

app.on("window-all-closed", () => {
  stopTunnel();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopTunnel();
});
