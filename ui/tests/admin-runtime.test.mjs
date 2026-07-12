import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  assertProcessElevated,
  isProcessElevated,
  setWindowsStartupTask,
  WINDOWS_STARTUP_TASK_NAME
} = require('../backend-runtime.js');

test('elevation probe fails closed and reports access denied', () => {
  assert.equal(isProcessElevated({ platform: 'linux' }), false);
  assert.throws(
    () => assertProcessElevated({ platform: 'win32', spawnSync: () => ({ status: 1, stdout: '' }) }),
    (error) => error.code === 'administrator_required' && error.exitCode === 5
  );
  assert.equal(
    isProcessElevated({
      platform: 'win32',
      spawnSync: () => ({ status: 0, stdout: 'ELEVATED\r\n' })
    }),
    true
  );
});

test('startup task launches the app at highest run level with dev arguments', () => {
  const calls = [];
  const executable = 'C:\\Program Files\\UltraIsolator\\UltraIsolator.exe';
  const project = 'C:\\Programs\\Projects\\ultraisolator\\ui';

  setWindowsStartupTask(true, executable, {
    platform: 'win32',
    arguments: [project],
    spawnSync: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(WINDOWS_STARTUP_TASK_NAME, '\\UltraIsolator\\LaunchAtLogon');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'schtasks.exe');
  assert.deepEqual(calls[0].args.slice(0, 3), ['/Create', '/TN', WINDOWS_STARTUP_TASK_NAME]);
  assert.equal(calls[0].args[calls[0].args.indexOf('/SC') + 1], 'ONLOGON');
  assert.equal(calls[0].args[calls[0].args.indexOf('/RL') + 1], 'HIGHEST');
  assert.ok(calls[0].args.includes('/IT'));
  assert.equal(calls[0].args[calls[0].args.indexOf('/TR') + 1], `"${executable}" "${project}"`);
});
