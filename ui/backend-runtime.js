const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function backendRoot(app, projectRoot) {
  return app.isPackaged ? path.join(process.resourcesPath, 'backend') : projectRoot;
}

function backendConfigPath(app, projectRoot) {
  const root = backendRoot(app, projectRoot);
  if (app.isPackaged) {
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- Electron userData path is app-controlled; filename is fixed.
    return path.join(app.getPath('userData'), 'config.json');
  }
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- projectRoot is the application root; filename is fixed.
  return path.join(root, 'config.json');
}

function resolvePythonCommand(env = process.env) {
  return env.EII_PYTHON || 'python';
}

function backendLogPath(app) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- Electron userData path is app-controlled; filename is fixed.
  return path.join(app.getPath('userData'), 'backend.log');
}

function createBackendLogStream(app) {
  if (!app.isPackaged) {
    return null;
  }
  try {
    const target = backendLogPath(app);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const stream = fs.createWriteStream(target, { flags: 'a' });
    stream.write(`[${new Date().toISOString()}] starting backend\n`);
    return stream;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function appendBackendStartupLog(app, message) {
  if (!app.isPackaged) {
    console.error(message);
    return;
  }
  try {
    const target = backendLogPath(app);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch (error) {
    console.error(error);
  }
}

function closeBackendLogStream(stream) {
  if (!stream) {
    return null;
  }
  stream.end(`[${new Date().toISOString()}] backend exited\n`);
  return null;
}

function runPythonProbe(app, projectRoot, pythonCommand, args) {
  return new Promise((resolve, reject) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- documented EII_PYTHON runtime selector; spawn uses fixed args without a shell.
    const child = spawn(pythonCommand, args, {
      cwd: backendRoot(app, projectRoot),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim()
      });
    });
  });
}

async function preflightPythonRuntime(app, projectRoot, pythonCommand) {
  const version = await runPythonProbe(app, projectRoot, pythonCommand, ['--version']);
  const versionText = `${version.stdout} ${version.stderr}`.trim();
  const match = versionText.match(/Python\s+(\d+)\.(\d+)/);
  if (!match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) < 12)) {
    throw new Error(`Python 3.12 or newer is required. Found: ${versionText || 'unavailable'}. Set EII_PYTHON to a valid interpreter.`);
  }

  const psutil = await runPythonProbe(app, projectRoot, pythonCommand, ['-c', 'import psutil; print(psutil.__version__)']);
  if (psutil.code !== 0) {
    throw new Error(`Python dependency psutil is missing for ${pythonCommand}. Run: python -m pip install -r requirements.txt`);
  }
}

module.exports = {
  appendBackendStartupLog,
  backendConfigPath,
  backendLogPath,
  backendRoot,
  closeBackendLogStream,
  createBackendLogStream,
  preflightPythonRuntime,
  resolvePythonCommand,
  runPythonProbe
};
