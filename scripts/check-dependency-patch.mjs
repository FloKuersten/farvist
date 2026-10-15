import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { patchDir } from './patch-brace-expansion.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farvist-brace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'dist/commonjs'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'brace-expansion', version: '5.0.12' }));
  return { dir, entry: join(dir, 'dist/commonjs/index.js') };
}

test('patch preserves named exports, callable behavior and idempotence', (t) => {
  const { dir, entry } = fixture(t);
  writeFileSync(entry, 'function expand(s) { return [s]; }\nmodule.exports = { expand, EXPANSION_MAX: 100 };\n');
  assert.equal(patchDir(dir), true);
  const first = readFileSync(entry, 'utf8');
  assert.equal(patchDir(dir), true);
  assert.equal(readFileSync(entry, 'utf8'), first);
  const patched = createRequire(import.meta.url)(entry);
  assert.deepEqual(patched('safe'), ['safe']);
  assert.equal(patched.EXPANSION_MAX, 100);
});

test('missing upstream entry fails without creating a replacement', (t) => {
  const { dir } = fixture(t);
  assert.throws(() => patchDir(dir), { code: 'ENOENT' });
});

test('entry symlinks cannot redirect writes outside the package', { skip: process.platform === 'win32' }, (t) => {
  const { dir, entry } = fixture(t);
  const target = join(dir, 'untouched');
  writeFileSync(target, 'must remain unchanged');
  symlinkSync(target, entry);
  assert.throws(() => patchDir(dir), { code: 'ELOOP' });
  assert.equal(readFileSync(target, 'utf8'), 'must remain unchanged');
});
