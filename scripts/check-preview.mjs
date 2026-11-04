import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { auditPages } from './check-accessibility.mjs';
import { snapshotSite, startPreview } from './lib/site-preview.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'farvist-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  const files = {
    'index.html': '<h1>Public home</h1>', 'docs/index.html': '<h1>Documentation</h1>',
    'assets/home.css': 'body { color: black; }', '.well-known/skills/farvist/SKILL.md': 'Public skill',
    'package.json': '{"private":true}', '.env': 'LOCAL_SECRET', 'assets/private.php.txt': 'PRIVATE_SCRIPT',
    'assets/private.pem': 'PRIVATE_KEY', 'assets/.hidden.txt': 'HIDDEN', 'assets/home.css.map': 'SOURCE_MAP',
  };
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  execFileSync('git', ['-C', root, 'add', '--', ...Object.keys(files)]);
  writeFileSync(join(root, 'assets/untracked.html'), 'UNTRACKED_LOCAL_DATA');
  return root;
}

test('preview snapshots only tracked public files and serves no private paths', async (t) => {
  const root = fixture(t);
  const files = snapshotSite(root);
  assert.deepEqual([...files.keys()].sort(), [
    '/.well-known/skills/farvist/SKILL.md', '/assets/home.css', '/docs/index.html', '/index.html',
  ]);
  const site = await startPreview({ files });
  try {
    writeFileSync(join(root, 'index.html'), 'CHANGED_AFTER_START');
    assert.equal(await (await fetch(site.origin + '/?v=1.9.0')).text(), '<h1>Public home</h1>');
    const head = await fetch(site.origin + '/assets/home.css', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('x-content-type-options'), 'nosniff');
    const redirect = await fetch(site.origin + '/docs', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/docs/');
    assert.equal(await (await fetch(site.origin + '/docs/')).text(), '<h1>Documentation</h1>');
    for (const path of ['/.env', '/package.json', '/.git/config', '/assets/untracked.html',
      '/assets/private.php.txt', '/assets/private.pem', '/assets/.hidden.txt', '/assets/home.css.map',
      '/assets/%2e%2e/.env', '/assets/%2e%2e%2f.env']) {
      assert.equal((await fetch(site.origin + path)).status, 404, path);
    }
    assert.equal((await fetch(site.origin + '/', { method: 'POST' })).status, 405);
    const foreignHost = await new Promise((resolve, reject) => {
      const req = request(site.origin, { headers: { Host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.end();
    });
    assert.equal(foreignHost, 400);
  } finally { await site.close(); }
});

test('a public file replaced by an external symlink is rejected', { skip: process.platform === 'win32' }, (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'farvist-private-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'secret'), 'PRIVATE');
  rmSync(join(root, 'assets/home.css'));
  symlinkSync(join(outside, 'secret'), join(root, 'assets/home.css'));
  assert.throws(() => snapshotSite(root), /escapes repository/);
});

test('a public file cannot alias a private file inside the repository', { skip: process.platform === 'win32' }, (t) => {
  const root = fixture(t);
  rmSync(join(root, 'assets/home.css'));
  symlinkSync(join(root, '.env'), join(root, 'assets/home.css'));
  assert.throws(() => snapshotSite(root), /symlink alias/);
});

test('accessibility runner preserves settings, checks every URL, and reports all failure types', async () => {
  const files = new Map(['/', '/issues/', '/throws/'].map((path) => [path + 'index.html', {
    type: 'text/html', body: Buffer.from('<h1>Test</h1>'),
  }]));
  const site = await startPreview({ files });
  const config = { defaults: { runners: ['axe'], ignore: ['color-contrast'], standard: 'WCAG2AA', wait: 600,
    chromeLaunchConfig: { headless: true } },
  urls: ['/', '/issues/', '/throws/', '/missing/'].map((path) => 'http://localhost:4000' + path) };
  const checked = [];
  let closed = 0;
  const browser = { close: async () => { closed++; } };
  try {
    const report = await auditPages(config, site.origin, {
      launch: async (options) => { assert.deepEqual(options, config.defaults.chromeLaunchConfig); return browser; },
      audit: async (url, options) => {
        assert.equal(options.browser, browser);
        assert.deepEqual(options.runners, ['axe']);
        assert.deepEqual(options.ignore, ['color-contrast']);
        assert.equal(options.standard, 'WCAG2AA');
        assert.equal(options.wait, 600);
        const path = new URL(url).pathname;
        checked.push(path);
        if (path === '/throws/') throw new Error('Audit crashed');
        return { issues: path === '/issues/' ? [{ code: 'fixture', message: 'Missing label', selector: 'input' }] : [] };
      }, log: () => {},
    });
    assert.deepEqual(checked, ['/', '/issues/', '/throws/']);
    assert.equal(report.total, 4);
    assert.equal(report.passes, 1);
    assert.equal(report.issues, 1);
    assert.equal(report.errors, 2);
    assert.equal(report.results.length, 4);
    assert.equal(closed, 1);
  } finally { await site.close(); }
});

test('empty, duplicate or external accessibility targets cannot silently pass', async () => {
  const deps = { launch: async () => { throw new Error('Browser must not launch for invalid configuration'); }, log: () => {} };
  for (const urls of [[], ['https://example.com/'], ['http://localhost:4000//example.com/path'],
    ['http://localhost:4000/', 'http://localhost:4000/']]) {
    await assert.rejects(auditPages({ urls }, 'http://127.0.0.1:12345', deps), (error) => error.code === 'ERR_ASSERTION');
  }
});
