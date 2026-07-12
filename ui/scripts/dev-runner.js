const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { assertProcessElevated } = require('../backend-runtime');

const UI_ROOT = path.resolve(__dirname, '..');
const DEFAULT_RENDERER_PORT = 5173;
const DEFAULT_API_PORT = 8765;
const rendererPort = Number(process.env.EII_RENDERER_PORT) || DEFAULT_RENDERER_PORT;
const apiPort = Number(process.env.EII_API_PORT) || DEFAULT_API_PORT;
const rendererUrl = process.env.EII_RENDERER_URL || `http://127.0.0.1:${rendererPort}`;
const viteBin = path.join(UI_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const electronCommand = path.join(UI_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const rendererOnly = process.argv.includes('--renderer-only');

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, { timeout: 800 }, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
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
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 150);
    };
    attempt();
  });
}

function spawnChild(label, command, args, options) {
  const child = spawn(command, args, {
    cwd: UI_ROOT,
    stdio: 'inherit',
    windowsHide: true,
    ...options
  });
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[dev] ${label} exited (${signal || code}).`);
      shutdown(code || 0);
    }
  });
  return child;
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGINT');
  setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }, 3000).unref();
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  stopChild(electronProcess);
  stopChild(viteProcess);
  setTimeout(() => process.exit(exitCode), 3500).unref();
}

async function main() {
  assertProcessElevated();
  viteProcess = spawnChild('vite', process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
    '--port',
    String(rendererPort),
    '--strictPort'
  ]);

  await waitForHttp(rendererUrl);

  if (rendererOnly) {
    return;
  }

  electronProcess = spawnChild('electron', electronCommand, [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '.'
  ], {
    env: {
      ...process.env,
      EII_RENDERER_URL: rendererUrl,
      EII_API_PORT: String(apiPort),
      EII_BACKEND_LOG_STDIO: process.env.EII_BACKEND_LOG_STDIO || '1'
    }
  });
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

main().catch((error) => {
  if (error && error.code === 'administrator_required') {
    console.error('[dev] administrator_required: run this command from an Administrator terminal.');
    process.exit(5);
  }
  console.error(error);
  shutdown(1);
});
