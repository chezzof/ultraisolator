#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const uiRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(uiRoot, '.runtime', 'python');
const buildPython = process.env.EII_BUILD_PYTHON || 'python';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr || result.stdout).trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function inspectBuildPython() {
  const script = [
    'import json, pathlib, psutil, sys, sysconfig',
    'print(json.dumps({',
    '  "base_executable": str(pathlib.Path(getattr(sys, "_base_executable", sys.executable)).resolve()),',
    '  "base_prefix": str(pathlib.Path(sys.base_prefix).resolve()),',
    '  "purelib": str(pathlib.Path(sysconfig.get_path("purelib")).resolve()),',
    '  "stdlib": str(pathlib.Path(sysconfig.get_path("stdlib")).resolve()),',
    '  "version": [sys.version_info.major, sys.version_info.minor, sys.version_info.micro],',
    '  "psutil_version": psutil.__version__',
    '}))'
  ].join('\n');
  return JSON.parse(run(buildPython, ['-c', script]));
}

function copyRequiredFile(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Required Python runtime file is missing: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyOptionalFile(source, destination) {
  if (fs.existsSync(source) && fs.statSync(source).isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function copyTree(source, destination, filter = () => true) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Required Python runtime directory is missing: ${source}`);
  }
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (sourcePath) => filter(path.relative(source, sourcePath))
  });
}

function standardLibraryFilter(relativePath) {
  const normalized = relativePath.split(path.sep).join('/').toLowerCase();
  const parts = normalized.split('/');
  if (parts.includes('site-packages') || parts.includes('__pycache__')) {
    return false;
  }
  return !normalized.endsWith('.pyc') && !normalized.endsWith('.pyo');
}

function dependencyFilter(relativePath) {
  const normalized = relativePath.split(path.sep).join('/').toLowerCase();
  return !normalized.split('/').includes('__pycache__') && !normalized.endsWith('.pyc');
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('The packaged Python runtime can only be assembled on Windows.');
  }

  const info = inspectBuildPython();
  const [major, minor, patch] = info.version;
  if (major !== 3 || minor < 12) {
    throw new Error(`Python 3.12 or newer is required to build the desktop runtime; found ${major}.${minor}.${patch}.`);
  }

  fs.rmSync(path.dirname(outputRoot), { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const versionDll = `python${major}${minor}.dll`;
  copyRequiredFile(info.base_executable, path.join(outputRoot, 'python.exe'));
  copyRequiredFile(path.join(info.base_prefix, versionDll), path.join(outputRoot, versionDll));
  copyRequiredFile(path.join(info.base_prefix, 'LICENSE.txt'), path.join(outputRoot, 'LICENSE.txt'));
  for (const filename of ['python3.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
    copyOptionalFile(path.join(info.base_prefix, filename), path.join(outputRoot, filename));
  }

  copyTree(path.join(info.base_prefix, 'DLLs'), path.join(outputRoot, 'DLLs'), dependencyFilter);
  copyTree(info.stdlib, path.join(outputRoot, 'Lib'), standardLibraryFilter);

  const dependencyEntries = fs.readdirSync(info.purelib, { withFileTypes: true })
    .filter((entry) => entry.name.toLowerCase().startsWith('psutil'));
  if (!dependencyEntries.some((entry) => entry.name.toLowerCase() === 'psutil' && entry.isDirectory())) {
    throw new Error(`psutil ${info.psutil_version} is not installed under ${info.purelib}.`);
  }
  const targetSitePackages = path.join(outputRoot, 'Lib', 'site-packages');
  fs.mkdirSync(targetSitePackages, { recursive: true });
  for (const entry of dependencyEntries) {
    const source = path.join(info.purelib, entry.name);
    const destination = path.join(targetSitePackages, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, destination, dependencyFilter);
    } else if (entry.isFile()) {
      copyRequiredFile(source, destination);
    }
  }

  fs.writeFileSync(path.join(outputRoot, 'runtime-build.json'), `${JSON.stringify({
    python: `${major}.${minor}.${patch}`,
    psutil: info.psutil_version
  }, null, 2)}\n`, 'utf8');

  const packagedPython = path.join(outputRoot, 'python.exe');
  const smokeOutput = run(packagedPython, ['-I', '-c', [
    'import ctypes, http.server, json, pathlib, psutil, sys',
    'print(json.dumps({"prefix": sys.prefix, "psutil": psutil.__version__}))'
  ].join('; ')], { cwd: outputRoot });
  const smoke = JSON.parse(smokeOutput);
  if (path.resolve(smoke.prefix).toLowerCase() !== path.resolve(outputRoot).toLowerCase()) {
    throw new Error(`Packaged Python resolved outside its runtime root: ${smoke.prefix}`);
  }

  console.log(`prepared Python ${major}.${minor}.${patch} + psutil ${smoke.psutil}: ${outputRoot}`);
}

main();
