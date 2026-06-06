const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_RENDERER_WIDTH = 1280;
const DEFAULT_RENDERER_HEIGHT = 820;
const SHUTDOWN_TIMEOUT_MS = 5000;
const APP_SETTINGS_FILE = 'app-settings.json';
const APP_SETTINGS_VERSION = 2;
const DEFAULT_APP_SETTINGS = {
  settingsVersion: APP_SETTINGS_VERSION,
  language: 'en',
  launchAtWindowsStartup: false,
  minimizeToTrayOnStart: false,
  startIsolatorAutomatically: false,
  notificationToastsEnabled: true,
  firstRunCompleted: false
};

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');

const singleInstanceLock = app.requestSingleInstanceLock();

let mainWindow = null;
let tray = null;
let backendProcess = null;
let backendUrl = null;
let isQuitting = false;
let lastStatus = { running: false, game_mode: false };
let rendererLoaded = false;
let rendererLoadPromise = null;
let trayStatusTimer = null;
let backendLogStream = null;
let backendRestartCount = 0;
let backendRestartTimer = null;
let ipcHandlersRegistered = false;
const MAX_BACKEND_RESTARTS = 4;
const FALLBACK_PYTHON_COMMANDS = ['py', 'python3'];
const backendApiToken = crypto.randomBytes(32).toString('hex');

function backendRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'backend') : PROJECT_ROOT;
}

function backendConfigPath() {
  return app.isPackaged ? path.join(app.getPath('userData'), 'config.json') : path.join(backendRoot(), 'config.json');
}

function backendLogPath() {
  return path.join(app.getPath('userData'), 'backend.log');
}

function createBackendLogStream() {
  if (!app.isPackaged) {
    return null;
  }
  try {
    const target = backendLogPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const stream = fs.createWriteStream(target, { flags: 'a' });
    stream.write(`[${new Date().toISOString()}] starting backend\n`);
    return stream;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function closeBackendLogStream() {
  if (!backendLogStream) {
    return;
  }
  backendLogStream.end(`[${new Date().toISOString()}] backend exited\n`);
  backendLogStream = null;
}

function normalizeAppSettings(candidate = {}) {
  const language = candidate.language === 'ru' ? 'ru' : 'en';
  return {
    settingsVersion: APP_SETTINGS_VERSION,
    language,
    launchAtWindowsStartup: Boolean(candidate.launchAtWindowsStartup),
    minimizeToTrayOnStart: Boolean(candidate.minimizeToTrayOnStart),
    startIsolatorAutomatically: Boolean(candidate.startIsolatorAutomatically),
    notificationToastsEnabled: candidate.notificationToastsEnabled !== false,
    firstRunCompleted: Boolean(candidate.firstRunCompleted)
  };
}

function appSettingsPath() {
  return path.join(app.getPath('userData'), APP_SETTINGS_FILE);
}

function readStoredAppSettings() {
  try {
    const raw = fs.readFileSync(appSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.settingsVersion !== APP_SETTINGS_VERSION) {
      parsed.minimizeToTrayOnStart = false;
    }
    return normalizeAppSettings({ ...DEFAULT_APP_SETTINGS, ...parsed });
  } catch (_error) {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function readAppSettings() {
  const settings = readStoredAppSettings();
  try {
    settings.launchAtWindowsStartup = Boolean(app.getLoginItemSettings().openAtLogin);
  } catch (_error) {
    settings.launchAtWindowsStartup = false;
  }
  return settings;
}

function applyLoginItemSetting(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath
  });
}

function writeAppSettings(candidate) {
  const settings = normalizeAppSettings({ ...DEFAULT_APP_SETTINGS, ...candidate });
  try {
    applyLoginItemSetting(settings.launchAtWindowsStartup);
    settings.launchAtWindowsStartup = Boolean(app.getLoginItemSettings().openAtLogin);
  } catch (_error) {
    settings.launchAtWindowsStartup = false;
  }
  const target = appSettingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Fix: atomic write (write to .tmp then rename) so a crash mid-write cannot
  // corrupt app-settings.json and silently reset the user's settings.
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return settings;
}

function createTrayIcon(state) {
  const iconPath = path.join(__dirname, `assets/tray-${state}.ico`);
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image;
    }
  }

  const colors = {
    idle: '#6F7782',
    game: '#00D4AA',
    error: '#FF4757'
  };
  const color = colors[state] || colors.idle;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    '<rect width="32" height="32" rx="6" fill="#0A0A0A"/>',
    `<path d="M16 4 26 9v7c0 6.3-4 10.8-10 12-6-1.2-10-5.7-10-12V9l10-5Z" fill="${color}" opacity="0.95"/>`,
    '<path d="M16 8 22 11.1v4.7c0 3.7-2.2 6.4-6 7.4-3.8-1-6-3.7-6-7.4v-4.7L16 8Z" fill="#0A0A0A" opacity="0.88"/>',
    `<path d="M16 11.2 19.8 13.1v3.1c0 2.2-1.3 3.8-3.8 4.6-2.5-.8-3.8-2.4-3.8-4.6v-3.1l3.8-1.9Z" fill="${color}"/>`,
    '</svg>'
  ].join('');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function setTrayState(state) {
  if (!tray) {
    return;
  }
  tray.setImage(createTrayIcon(state));
  tray.setToolTip(`Esports Isolator PRO - ${state}`);
}

function updateTrayFromStatus(status) {
  lastStatus = {
    running: Boolean(status && status.running),
    game_mode: Boolean(status && status.game_mode)
  };
  if (lastStatus.game_mode) {
    setTrayState('game');
  } else {
    setTrayState('idle');
  }
  updateTrayMenu();
}

function postJson(urlPath) {
  return new Promise((resolve, reject) => {
    if (!backendUrl) {
      reject(new Error('Backend is not ready.'));
      return;
    }
    const url = new URL(urlPath, backendUrl);
    const request = http.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      timeout: 2000,
      headers: {
        Authorization: `Bearer ${backendApiToken}`
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch (_error) {
          resolve({});
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    if (!backendUrl) {
      reject(new Error('Backend is not ready.'));
      return;
    }
    const url = new URL(urlPath, backendUrl);
    const request = http.get({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      timeout: 2000,
      headers: {
        Authorization: `Bearer ${backendApiToken}`
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch (_error) {
          resolve({});
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForBackendReady(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`${url}/api/status`, {
        timeout: 800,
        headers: { Authorization: `Bearer ${backendApiToken}` }
      }, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      request.on('timeout', () => {
        request.destroy();
        retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error('API server did not become ready.'));
        return;
      }
      setTimeout(attempt, 150);
    };
    attempt();
  });
}

// Spawn the Python backend once. Returns a promise that resolves when the
// process spawns successfully and rejects on a spawn 'error' (e.g. ENOENT).
// Fix #1: attach an 'error' handler so an ENOENT (python not on PATH) rejects
// instead of throwing an uncaught exception that crashes the main process
// before the window is created.
function spawnBackendOnce(pythonCommand, args, root, backendStdio) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(pythonCommand, args, {
      cwd: root,
      windowsHide: true,
      stdio: backendStdio
    });

    child.once('error', (err) => {
      // Spawn failure (commonly ENOENT). Never let this crash the process.
      console.error(`[api] failed to launch '${pythonCommand}': ${err.message}`);
      if (backendLogStream) {
        backendLogStream.write(`[${new Date().toISOString()}] spawn error (${pythonCommand}): ${err.message}\n`);
      }
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    // 'spawn' fires once the child process is successfully spawned.
    child.once('spawn', () => {
      if (!settled) {
        settled = true;
        resolve(child);
      }
    });
  });
}

async function launchBackendProcess(port) {
  const root = backendRoot();
  const args = [
    '-m', 'server',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--config', backendConfigPath(),
    '--api-token', backendApiToken
  ];
  const backendStdio = app.isPackaged ? ['ignore', 'ignore', 'pipe'] : (
    process.env.EII_BACKEND_LOG_STDIO === '1' ? ['ignore', 'pipe', 'pipe'] : 'ignore'
  );

  if (app.isPackaged) {
    const configuredPython = process.env.EII_PYTHON || '';
    if (!configuredPython || !path.isAbsolute(configuredPython)) {
      throw new Error('Packaged builds require EII_PYTHON to point at a trusted absolute Python 3.12+ interpreter path.');
    }
    return await spawnBackendOnce(fs.realpathSync(configuredPython), args, root, backendStdio);
  }

  // In development, try the configured interpreter first, then fall back to
  // common Windows names ('py', 'python3') if the first spawn fails with ENOENT.
  const candidates = [process.env.EII_PYTHON || 'python', ...FALLBACK_PYTHON_COMMANDS];
  const tried = new Set();
  let lastError = null;
  for (const pythonCommand of candidates) {
    if (tried.has(pythonCommand)) {
      continue;
    }
    tried.add(pythonCommand);
    try {
      return await spawnBackendOnce(pythonCommand, args, root, backendStdio);
    } catch (error) {
      lastError = error;
      if (error && error.code !== 'ENOENT') {
        // Non-ENOENT errors are not interpreter-name problems; stop trying.
        break;
      }
    }
  }
  throw lastError || new Error('Unable to launch Python backend.');
}

function attachBackendHandlers() {
  backendProcess.on('exit', (code, signal) => {
    closeBackendLogStream();
    backendProcess = null;
    if (isQuitting) {
      return;
    }
    // Fix #2: bounded auto-restart with backoff on unexpected backend exit so
    // a crash does not leave a permanently dead app. Guard against loops and
    // against restarting during quit.
    if (backendRestartCount < MAX_BACKEND_RESTARTS) {
      backendRestartCount += 1;
      const delay = Math.min(8000, 1000 * backendRestartCount);
      console.error(`[api] backend exited (code=${code}, signal=${signal}); restart ${backendRestartCount}/${MAX_BACKEND_RESTARTS} in ${delay}ms`);
      setTrayState('error');
      updateTrayMenu();
      if (backendRestartTimer) {
        clearTimeout(backendRestartTimer);
      }
      backendRestartTimer = setTimeout(() => {
        backendRestartTimer = null;
        if (isQuitting) {
          return;
        }
        startBackend().then(() => {
          startTrayStatusPolling();
          refreshStatusOnce();
        }).catch((error) => {
          console.error(`[api] backend restart failed: ${error.message}`);
          setTrayState('error');
          updateTrayMenu();
        });
      }, delay);
      if (typeof backendRestartTimer.unref === 'function') {
        backendRestartTimer.unref();
      }
    } else {
      console.error(`[api] backend exited and exhausted ${MAX_BACKEND_RESTARTS} restart attempts; giving up.`);
      setTrayState('error');
      updateTrayMenu();
    }
  });

  if (backendProcess.stderr) {
    if (backendLogStream) {
      backendProcess.stderr.pipe(backendLogStream, { end: false });
    } else {
      backendProcess.stderr.on('data', (chunk) => {
        console.error(`[api] ${chunk.toString().trim()}`);
      });
    }
  }
  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (chunk) => {
      console.log(`[api] ${chunk.toString().trim()}`);
    });
  }
}

async function startBackend() {
  const port = Number(process.env.EII_API_PORT) || await findFreePort();
  backendUrl = `http://127.0.0.1:${port}`;
  backendLogStream = createBackendLogStream();

  // The actual spawn(pythonCommand, args, ...) call lives in spawnBackendOnce
  // so it can be retried across interpreter fallbacks with an error handler.
  backendProcess = await launchBackendProcess(port);
  attachBackendHandlers();

  await waitForBackendReady(backendUrl);
  return backendUrl;
}

function rendererUrl() {
  if (!app.isPackaged && process.env.EII_RENDERER_URL) {
    return { type: 'url', target: process.env.EII_RENDERER_URL };
  }
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    return { type: 'file', target: distIndex };
  }
  const fallback = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Esports Isolator PRO</title>',
    '<style>body{margin:0;background:#0A0A0A;color:#E8E8EC;font-family:Inter,Segoe UI,sans-serif}',
    '.shell{display:grid;place-items:center;min-height:100vh}.mark{color:#00D4AA;font:700 20px Consolas,monospace;letter-spacing:.08em}',
    '.sub{margin-top:10px;color:#AAAAAA;font-size:13px}</style></head>',
    '<body><main class="shell"><div><div class="mark">ESPORTS ISOLATOR PRO</div>',
    '<div class="sub">API bridge is running. React dashboard build is not installed yet.</div></div></main></body></html>'
  ].join('');
  return { type: 'url', target: `data:text/html;charset=utf-8,${encodeURIComponent(fallback)}` };
}

function rendererFailureUrl(detail) {
  const safeDetail = String(detail || 'Renderer failed to mount. Rebuild the dashboard and reopen the app.')
    .replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
  const fallback = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Esports Isolator PRO</title>',
    '<style>body{margin:0;background:#0A0A0A;color:#E8E8EC;font-family:Inter,Segoe UI,sans-serif}',
    '.shell{display:grid;place-items:center;min-height:100vh}.mark{color:#FF4757;font:700 20px Consolas,monospace;letter-spacing:.08em}',
    '.sub{margin-top:10px;color:#AAAAAA;font-size:13px;max-width:560px;line-height:1.5}</style></head>',
    `<body><main class="shell"><div><div class="mark">RENDERER LOAD FAILED</div><div class="sub">${safeDetail}</div></div></main></body></html>`
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(fallback)}`;
}

function waitForRendererMount(timeoutMs = 5000) {
  if (!mainWindow) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        resolve(false);
        return;
      }
      mainWindow.webContents.executeJavaScript(
        'Boolean(document.querySelector("#root") && document.querySelector("#root").children.length)',
        true
      ).then((mounted) => {
        if (mounted || Date.now() >= deadline) {
          resolve(Boolean(mounted));
          return;
        }
        setTimeout(check, 100);
      }).catch(() => resolve(false));
    };
    check();
  });
}

function ensureRendererLoaded() {
  if (!mainWindow || rendererLoaded) {
    return Promise.resolve();
  }
  if (rendererLoadPromise) {
    return rendererLoadPromise;
  }
  const target = rendererUrl();
  rendererLoadPromise = (target.type === 'file'
    ? mainWindow.loadFile(target.target, { hash: 'dashboard' })
    : mainWindow.loadURL(target.target))
    .then(async () => {
      const mounted = await waitForRendererMount();
      if (!mounted) {
        await mainWindow.loadURL(rendererFailureUrl('React did not mount from the packaged renderer build. Run npm --prefix ui run build:renderer and check ui/dist/index.html asset paths.'));
      }
      rendererLoaded = true;
    })
    .finally(() => {
      rendererLoadPromise = null;
    });
  return rendererLoadPromise;
}

async function refreshStatusOnce() {
  try {
    const status = await getJson('/api/status');
    updateTrayFromStatus(status);
    return status;
  } catch (_error) {
    setTrayState('error');
    updateTrayMenu();
    return null;
  }
}

function startTrayStatusPolling() {
  if (trayStatusTimer) {
    return;
  }
  trayStatusTimer = setInterval(refreshStatusOnce, 15000);
  if (typeof trayStatusTimer.unref === 'function') {
    trayStatusTimer.unref();
  }
}

function stopTrayStatusPolling() {
  if (!trayStatusTimer) {
    return;
  }
  clearInterval(trayStatusTimer);
  trayStatusTimer = null;
}

async function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  try {
    await ensureRendererLoaded();
  } catch (_error) {
    setTrayState('error');
    return;
  }
  // Fix #7: a minimized window won't reappear from show()+focus() alone;
  // restore it (and clear skip-taskbar) before focusing.
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('tray:show-window', { backendUrl });
  refreshStatusOnce();
}

function hideMainWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }
}

async function startIsolator() {
  try {
    const result = await postJson('/api/start');
    updateTrayFromStatus(result.status || { running: result.ok, game_mode: false });
  } catch (_error) {
    setTrayState('error');
  }
}

async function stopIsolator() {
  try {
    const result = await postJson('/api/stop');
    updateTrayFromStatus(result.status || { running: false, game_mode: false });
  } catch (_error) {
    setTrayState('error');
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }
  const lifecycleLabel = lastStatus.running ? 'Stop Isolator' : 'Start Isolator';
  const lifecycleClick = lastStatus.running ? stopIsolator : startIsolator;
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: showMainWindow },
    { type: 'separator' },
    { label: lifecycleLabel, click: lifecycleClick },
    { type: 'separator' },
    { label: 'Exit', click: quitApplication }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(createTrayIcon('idle'));
  tray.on('double-click', showMainWindow);
  tray.on('click', showMainWindow);
  updateTrayMenu();
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: DEFAULT_RENDERER_WIDTH,
    height: DEFAULT_RENDERER_HEIGHT,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Esports Isolator PRO',
    icon: path.join(__dirname, 'assets/icon.ico'),
    backgroundColor: '#0A0A0A',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(rendererFailureUrl(`Renderer process exited: ${details.reason || 'unknown reason'}.`)).catch(() => {});
    }
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const target = rendererUrl();
    if (target.type === 'file') {
      event.preventDefault();
      return;
    }
    if (targetUrl !== target.target) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Fix #3: forcibly kill a spawned backend (used when bootstrap fails after a
// spawn but before the API is ready) so no orphaned Python process is left
// holding the port. Detaches handlers first so it does not trigger auto-restart.
function killBackendProcess() {
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
  const child = backendProcess;
  backendProcess = null;
  closeBackendLogStream();
  if (!child) {
    return;
  }
  try {
    child.removeAllListeners('exit');
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32' && child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        } catch (_error) {
          child.kill();
        }
      } else {
        child.kill('SIGKILL');
      }
    }
  } catch (error) {
    console.error(`[api] failed to kill backend: ${error.message}`);
  }
}

async function gracefulShutdownBackend() {
  try {
    await postJson('/api/stop');
  } catch (_error) {
    // Best effort: the backend may have exited before Electron shutdown.
  }
  if (!backendProcess) {
    return;
  }
  const child = backendProcess;
  // Don't let the unexpected-exit auto-restart fire during a deliberate quit.
  child.removeAllListeners('exit');
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        // Fix #6: SIGTERM/child.kill() does not reliably kill the Python
        // process tree on Windows; escalate to taskkill /T /F (whole tree) and
        // SIGKILL elsewhere so the backend cannot orphan and hold the port.
        if (process.platform === 'win32' && child.pid) {
          try {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
          } catch (_error) {
            child.kill('SIGKILL');
          }
        } else {
          child.kill('SIGKILL');
        }
      }
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

async function quitApplication() {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  stopTrayStatusPolling();
  await gracefulShutdownBackend();
  app.quit();
}

function requestGracefulQuit() {
  quitApplication().catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

function registerIpcHandlers() {
  if (ipcHandlersRegistered) {
    return;
  }
  ipcHandlersRegistered = true;
  ipcMain.handle('backend:get-url', () => backendUrl);
  ipcMain.handle('backend:get-token', () => backendApiToken);
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  ipcMain.handle('window:close-to-tray', () => hideMainWindow());
  ipcMain.handle('window:show', () => showMainWindow());
  ipcMain.handle('app-settings:get', () => readAppSettings());
  ipcMain.handle('app-settings:update', (_event, settings) => writeAppSettings(settings));
  ipcMain.handle('tray:status', (_event, status) => {
    updateTrayFromStatus(status);
    return true;
  });
}

// Fix #3: when bootstrap fails (e.g. waitForBackendReady times out) we must not
// leave an orphaned Python process and a dead tray-only app. Kill any spawned
// backend and show a tray menu that offers a working Retry and Quit.
function setTrayErrorMenu() {
  if (!tray) {
    return;
  }
  setTrayState('error');
  const menu = Menu.buildFromTemplate([
    { label: 'Backend failed to start', enabled: false },
    { type: 'separator' },
    { label: 'Retry', click: retryBootstrap },
    { label: 'Exit', click: quitApplication }
  ]);
  tray.setContextMenu(menu);
}

function retryBootstrap() {
  // Reset restart budget for a manual retry and re-run bootstrap.
  backendRestartCount = 0;
  killBackendProcess();
  bootstrap().catch(handleBootstrapFailure);
}

function handleBootstrapFailure(error) {
  console.error(`[bootstrap] startup failed: ${error && error.message ? error.message : error}`);
  // Ensure no orphaned backend is left holding the port.
  killBackendProcess();
  stopTrayStatusPolling();
  setTrayErrorMenu();
}

async function bootstrap() {
  app.setAppUserModelId('com.esportsisolator.pro');
  const appSettings = readAppSettings();
  if (!tray) {
    createTray();
  }
  registerIpcHandlers();
  try {
    await startBackend();
  } catch (error) {
    // startBackend failed to spawn (ENOENT) or never became ready. Clean up the
    // orphan and surface a recoverable error state instead of crashing.
    handleBootstrapFailure(error);
    return;
  }
  startTrayStatusPolling();
  if (!mainWindow) {
    createWindow();
  }
  updateTrayMenu();
  if (appSettings.startIsolatorAutomatically) {
    await startIsolator();
  } else {
    refreshStatusOnce();
  }
  if (appSettings.minimizeToTrayOnStart) {
    await ensureRendererLoaded();
  } else {
    await showMainWindow();
  }
  globalShortcut.register('CommandOrControl+Q', quitApplication);
}

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(bootstrap).catch(handleBootstrapFailure);

  app.on('activate', showMainWindow);

  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      quitApplication();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });

  process.on('SIGINT', () => {
    requestGracefulQuit();
  });

  process.on('SIGTERM', () => {
    requestGracefulQuit();
  });
}
