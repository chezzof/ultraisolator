import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  expectedArtifactNames,
  verifyReleaseArtifacts
} = require('../scripts/verify-installed-artifacts.js');

test('release verification expects only the NSIS installer', () => {
  assert.deepEqual(expectedArtifactNames('1.2.3'), [
    'Esports Isolator PRO Setup 1.2.3.exe'
  ]);
});

test('single-installer checksum manifest is accepted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eii-release-manifest-'));
  try {
    const artifact = expectedArtifactNames('1.2.3')[0];
    const bytes = Buffer.from('verified-installer');
    fs.writeFileSync(path.join(root, artifact), bytes);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), `${digest}  ${artifact}\n`, 'utf8');

    assert.doesNotThrow(() => verifyReleaseArtifacts({
      distDir: root,
      version: '1.2.3'
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
