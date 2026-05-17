import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('generated documentation register is current', async () => {
  const { stdout, stderr } = await execFileAsync('node', [
    'scripts/generate-doc-register.mjs',
    '--check',
  ]);

  assert.equal(stderr, '');
  assert.match(stdout, /docs\/generated\/register\.md is current/);
});
