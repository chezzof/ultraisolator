#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const runtime = require('../backend-runtime');

const uiRoot = path.resolve(__dirname, '..');
const packageConfig = require('../package.json');

function extractAsarFile(asarPath, filePath) {
  const asar = require('@electron/asar');
  return asar.extractFile(asarPath, filePath);
}

function findPackagedBackendRoot(outputDir = path.join(uiRoot, packageConfig.build.directories.output || 'dist-packaged')) {
  const candidates = [
    path.join(outputDir, 'win-unpacked', 'resources', 'backend'),
    path.join(outputDir, 'win-ia32-unpacked', 'resources', 'backend'),
    path.join(outputDir, 'win-arm64-unpacked', 'resources', 'backend')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No packaged resources/backend directory found under ${outputDir}. Run npm --prefix ui run pack or build first.`);
}

function findPackagedManifestPath(backendRoot) {
  const resourcesRoot = path.dirname(backendRoot);
  const appAsar = path.join(resourcesRoot, 'app.asar');
  if (fs.existsSync(appAsar)) {
    const bytes = extractAsarFile(appAsar, 'backend-manifest.json');
    return {
      manifestPath: path.join(appAsar, 'backend-manifest.json'),
      manifest: JSON.parse(Buffer.from(bytes).toString('utf8'))
    };
  }

  const unpackedManifest = path.join(resourcesRoot, 'app', 'backend-manifest.json');
  if (fs.existsSync(unpackedManifest)) {
    return {
      manifestPath: unpackedManifest,
      manifest: JSON.parse(fs.readFileSync(unpackedManifest, 'utf8'))
    };
  }

  throw new Error(`No packaged backend-manifest.json found in app.asar or resources/app under ${resourcesRoot}.`);
}

function assertManifestCoversBuildConfig() {
  const files = packageConfig.build.files || [];
  if (!files.includes('backend-manifest.json')) {
    throw new Error('backend-manifest.json must be included in the trusted app bundle files.');
  }
  const scripts = packageConfig.scripts || {};
  if (!scripts['build:backend-manifest'] || !scripts['verify:packaged-runtime']) {
    throw new Error('package scripts must declare build:backend-manifest and verify:packaged-runtime.');
  }
  const buildScript = scripts.build || '';
  if (!buildScript.includes('build:backend-manifest')) {
    throw new Error('production build must generate the backend manifest before packaging.');
  }
}

function assertPackagedPythonPolicy(resourcesRoot, options = {}) {
  const writableCheck = options.isPathWritableByStandardUsers || runtime.isPathWritableByStandardUsers;
  const command = 'C:\\Users\\attacker\\python.exe';
  let rejectedArbitraryPython = false;
  try {
    runtime.resolvePackagedPythonCommand({
      env: { EII_PYTHON: command },
      app: { isPackaged: true },
      trustedRoots: ['C:\\Program Files\\Esports Isolator PRO\\python'],
      isPathWritableByStandardUsers: () => false
    });
  } catch (error) {
    if (String(error.message).toLowerCase().includes('trusted')) {
      rejectedArbitraryPython = true;
    } else {
      throw error;
    }
  }
  if (!rejectedArbitraryPython) {
    throw new Error('production packaged runtime accepted arbitrary EII_PYTHON.');
  }

  const bundledPythonPath = path.join(resourcesRoot, 'python', 'python.exe');
  try {
    runtime.resolvePackagedPythonCommand({
      env: {},
      app: { isPackaged: true },
      bundledPythonPath,
      trustedRoots: [path.dirname(bundledPythonPath)],
      isPathWritableByStandardUsers: writableCheck
    });
  } catch (error) {
    if (!fs.existsSync(bundledPythonPath) && String(error.message).toLowerCase().includes('missing')) {
      return;
    }
    throw error;
  }
}

function verifyPackagedRuntime(backendRoot, options = {}) {
  assertManifestCoversBuildConfig();
  const resolvedBackendRoot = backendRoot ? path.resolve(backendRoot) : findPackagedBackendRoot();
  assertPackagedPythonPolicy(path.dirname(resolvedBackendRoot), options);
  const packagedManifest = findPackagedManifestPath(resolvedBackendRoot);
  runtime.verifyBackendResourceIntegrity({
    backendRoot: resolvedBackendRoot,
    manifestPath: packagedManifest.manifestPath,
    manifest: packagedManifest.manifest,
    isPathWritableByStandardUsers: options.isPathWritableByStandardUsers || runtime.isPathWritableByStandardUsers
  });
  return resolvedBackendRoot;
}

function main() {
  const backendRoot = verifyPackagedRuntime(process.argv[2]);
  console.log(`packaged runtime verified: ${backendRoot}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  assertManifestCoversBuildConfig,
  assertPackagedPythonPolicy,
  extractAsarFile,
  findPackagedBackendRoot,
  findPackagedManifestPath,
  main,
  verifyPackagedRuntime
};
