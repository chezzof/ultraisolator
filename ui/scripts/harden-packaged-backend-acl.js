#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runIcacls(args) {
  const result = spawnSync('icacls', args, {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.error || result.status !== 0) {
    throw new Error(`icacls ${args.join(' ')} failed: ${result.error ? result.error.message : result.stderr}`);
  }
}

function hardenDirectoryAcl(target) {
  if (!fs.existsSync(target)) {
    return;
  }

  runIcacls([target, '/inheritance:r']);
  runIcacls([
    target,
    '/grant:r',
    '*S-1-5-32-544:(OI)(CI)(F)',
    '*S-1-5-18:(OI)(CI)(F)',
    '*S-1-5-32-545:(OI)(CI)(RX)',
    '*S-1-5-11:(OI)(CI)(RX)'
  ]);
}

function hardenFileAcl(target) {
  if (!fs.existsSync(target)) {
    return;
  }

  runIcacls([target, '/inheritance:r']);
  runIcacls([
    target,
    '/grant:r',
    '*S-1-5-32-544:(F)',
    '*S-1-5-18:(F)',
    '*S-1-5-32-545:(RX)',
    '*S-1-5-11:(RX)'
  ]);
}

function hardenPackagedRuntimeAcls(appOutDir) {
  if (process.platform !== 'win32') {
    return;
  }
  const resourcesRoot = path.join(appOutDir, 'resources');
  hardenDirectoryAcl(resourcesRoot);
  hardenDirectoryAcl(path.join(resourcesRoot, 'backend'));
  hardenDirectoryAcl(path.join(resourcesRoot, 'app.asar.unpacked'));
  hardenDirectoryAcl(path.join(resourcesRoot, 'python'));
  hardenFileAcl(path.join(resourcesRoot, 'app.asar'));
}

function hardenBackendAcl(backendRoot) {
  if (process.platform !== 'win32') {
    return;
  }
  hardenDirectoryAcl(backendRoot);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }
  hardenBackendAcl(path.join(context.appOutDir, 'resources', 'backend'));
};

module.exports.hardenBackendAcl = hardenBackendAcl;
module.exports.hardenPackagedRuntimeAcls = hardenPackagedRuntimeAcls;

function main() {
  const appOutDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', 'dist-packaged', 'win-unpacked');
  hardenPackagedRuntimeAcls(appOutDir);
  console.log(`hardened packaged runtime ACLs: ${appOutDir}`);
}

if (require.main === module) {
  main();
}
