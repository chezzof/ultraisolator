#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const target = path.resolve(__dirname, '..', 'dist-packaged');

function run(command, args) {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error ? result.error.message : result.stderr}`);
  }
}

function restoreWritableAccess() {
  if (process.platform !== 'win32' || !fs.existsSync(target)) {
    return;
  }
  const user = `${os.userInfo().domain || process.env.USERDOMAIN || ''}\\${os.userInfo().username}`.replace(/^\\/, '');
  run('icacls', [target, '/grant', `${user}:(OI)(CI)(F)`, '/T', '/C']);
}

function resolveRemovalTarget(value) {
  const resolved = path.resolve(value);
  if (resolved !== target && !resolved.startsWith(`${target}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside packaged output: ${resolved}`);
  }
  return resolved;
}

function main() {
  if (!fs.existsSync(target)) {
    return;
  }
  const removalTargets = process.argv.slice(2).map(resolveRemovalTarget);
  restoreWritableAccess();
  if (removalTargets.length === 0) {
    fs.rmSync(target, { recursive: true, force: true });
    return;
  }
  for (const removalTarget of removalTargets) {
    if (fs.existsSync(removalTarget)) {
      fs.rmSync(removalTarget, { recursive: true, force: true });
    }
  }
}

main();
