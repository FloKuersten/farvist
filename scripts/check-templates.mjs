// Exercise the actual exported HTML in empty consumer folders and the gallery UI.
// FARVIST_LIVE_CDN=1 additionally checks published CDN bytes instead of local fixtures.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import packageMetadata from '../package.json' with { type: 'json' };
import { renderTemplate, templateNames } from './gen-templates.mjs';
import { startPreview } from './lib/site-preview.mjs';

const root = new URL('../', import.meta.url);
const version = packageMetadata.version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const cdn = `https://cdn.jsdelivr.net/npm/farvist@${version}/`;
const live = process.env.FARVIST_LIVE_CDN === '1';
const types = { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png' };
const assetPaths = [
  'dist/farvist.min.css', 'dist/farvist-ai.min.css', 'assets/farvist.js',
  'assets/favicon.svg', 'assets/favicon-32.png', 'assets/apple-touch-icon.png',
];
let browser, site, temporary;
const sources = new Map();
const dependencies = new Map();

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'farvist-starters-'));
  // Network requests come only from this fixed asset list and package version.
  // Exported HTML can select a known dependency, never supply a request URL.
  for (const path of assetPaths) {
    const url = cdn + path;
    let body = await readFile(new URL(path, root));
    if (live) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      assert.equal(response.status, 200, `published asset ${path}`);
      const published = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(published, body, `published ${path} must match the bytes used for SRI`);
      body = published;
    }
    dependencies.set(url, { body, contentType: types[path.split('.').pop()] });
  }
  for (const name of templateNames) {
    const html = await readFile(new URL(`templates/starters/${name}.html`, root), 'utf8');
    sources.set(name, html);
    const folder = join(temporary, name);
    await mkdir(folder);
    await writeFile(join(folder, 'index.html'), html);
    for (const match of html.matchAll(/(?:href|src)="(https:\/\/cdn\.jsdelivr\.net\/npm\/farvist@[^"#]+)"/g)) {
      assert.ok(match[1].startsWith(cdn), 'every dependency must pin the current exact version');
      assert.ok(dependencies.has(match[1]), `unexpected exported dependency: ${match[1]}`);
    }
  }
  site = await startPreview();
  browser = await puppeteer.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (site) await site.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

async function pageFor(run, { width = 1440, javascript = true, beforeLoad, request } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  const missing = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  await page.setViewport({ width, height: 1000 });
  await page.setJavaScriptEnabled(javascript);
  await page.setRequestInterception(true);
  page.on('request', async incoming => {
    if (request && await request(incoming)) return;
    const url = incoming.url();
    if (dependencies.has(url)) return incoming.respond({ status: 200, headers: { 'access-control-allow-origin': '*' }, ...dependencies.get(url) });
    if (url.startsWith(site.origin + '/') || url.startsWith('file:') || url.startsWith('data:')) return incoming.continue();
    // Typography is optional; blocking it keeps these behavior tests deterministic.
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return incoming.abort();
    missing.push(url);
    return incoming.abort();
  });
  try {
    if (beforeLoad) await beforeLoad(page);
    await run(page, context);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    assert.deepEqual(missing, [], 'no missing or unexpected assets');
  } finally { await context.close(); }
}

async function noOverflow(page) {
  const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.width + 1, `horizontal overflow: ${JSON.stringify(size)}`);
}

test('all nine committed starters are reproducible, complete and integrity-pinned', async () => {
  assert.equal(templateNames.length, 9);
  assert.deepEqual((await readdir(new URL('templates/starters/', root))).sort(), templateNames.map(n => n + '.html').sort());
  for (const [name, html] of sources) {
    assert.equal(html, renderTemplate(name).html, `${name} export is stale`);
    assert.match(html, /Permission is hereby granted/);
    const tags = [...html.matchAll(/<[a-z][\w:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)].map(match => match[0]).join('\n');
    assert.doesNotMatch(tags, /(?:href|src)=["'](?:\.\.?\/|\/(?!\/))/);
    assert.doesNotMatch(html, /assets\/icons\/farvist-icons\.svg|notify\.js/);
    for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"[^>]*integrity="sha384-([^"]+)"/g)) {
      assert.equal(createHash('sha384').update(dependencies.get(match[1]).body).digest('base64'), match[2]);
    }
  }
});

for (const name of templateNames) {
  test(`${name}: downloaded index.html works alone, including icons, both widths and themes`, async () => {
    assert.deepEqual(await readdir(join(temporary, name)), ['index.html']);
    await pageFor(async page => {
      await page.goto(pathToFileURL(join(temporary, name, 'index.html')).href, { waitUntil: 'load' });
      assert.equal(await page.evaluate(() => typeof Farvist), 'object', 'runtime loaded with valid SRI');
      assert.ok(await page.$('h1'), 'page content present');
      assert.ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fv-primary').trim()), 'framework CSS loaded with valid SRI');
      const icons = await page.evaluate(() => [...document.querySelectorAll('use')].map(use => ({
        href: use.getAttribute('href'), exists: !!document.getElementById(use.getAttribute('href').slice(1)),
        area: use.getBBox().width * use.getBBox().height,
      })));
      assert.ok(icons.length > 0 && icons.some(icon => icon.area > 0), 'icons actually render');
      assert.ok(icons.every(icon => icon.href.startsWith('#') && icon.exists), 'all icons resolve in this file');
      for (const width of [1440, 390]) {
        await page.setViewport({ width, height: 1000 });
        for (const theme of ['dark', 'light']) {
          await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
          await noOverflow(page);
        }
      }
      const toggle = await page.$('[data-fv-theme-toggle]');
      if (toggle) {
        await page.evaluate(() => document.querySelector('[data-fv-theme-toggle]').click());
        assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
      }
    });
  });
}

test('gallery offers working previews, exact source and downloads for all nine templates', async () => {
  const downloads = join(temporary, 'downloads');
  await mkdir(downloads);
  await pageFor(async page => {
    const session = await page.createCDPSession();
    await session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await page.goto(site.origin + '/templates/', { waitUntil: 'load' });
    assert.equal(await page.$$eval('[data-template-source]:not([hidden])', els => els.length), 9);
    for (const name of templateNames) {
      const selector = `[data-template-source="${name}"]`;
      // Keyboard activation targets the intended card even while native focus
      // scrolling is moving it past the sticky navbar. A coordinate click can
      // land on that navbar during the page's smooth-scroll animation.
      await page.focus(selector);
      await page.keyboard.press('Enter');
      await page.waitForFunction(name => document.querySelector('#template-source-dialog').open
        && document.querySelector('[data-source-download]').getAttribute('download') === `farvist-${name}.html`
        && !document.querySelector('[data-source-copy]').disabled, {}, name).catch(async error => {
        const state = await page.evaluate(() => ({
          open: document.querySelector('#template-source-dialog').open,
          download: document.querySelector('[data-source-download]').download,
          status: document.querySelector('#template-source-status').textContent,
          focus: document.activeElement.outerHTML.slice(0, 250),
        }));
        throw new Error(`Source did not open for ${name}: ${JSON.stringify(state)}`, { cause: error });
      });
      assert.equal(await page.$eval('#template-source-code', el => el.value), sources.get(name));
      assert.equal(await page.$eval('[data-source-download]', el => el.getAttribute('download')), `farvist-${name}.html`);
      await page.click('[data-source-download]');
      const saved = join(downloads, `farvist-${name}.html`);
      for (let attempt = 0; attempt < 100; attempt++) {
        try { if (await readFile(saved, 'utf8') === sources.get(name)) break; } catch { /* browser is writing */ }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(await readFile(saved, 'utf8'), sources.get(name), 'browser download contains the entire starter');
      const response = await fetch(site.origin + `/templates/starters/${name}.html`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), sources.get(name));
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval(selector, el => document.activeElement === el), true);
    }
  });
});

test('source keyboard flow, clipboard success/failure and mobile layout', async () => {
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/', { waitUntil: 'load' });
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.focus('[data-template-source="dashboard"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[data-source-copy]').disabled);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        await noOverflow(page);
        const bounds = await page.$eval('#template-source-dialog', el => { const r = el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; });
        assert.ok(bounds.left >= 0 && bounds.right <= width + 1 && bounds.top >= 0 && bounds.bottom <= 901);
      }
      await page.click('[data-source-copy]');
      await page.waitForFunction(() => document.querySelector('#template-source-status').textContent.startsWith('Copied'));
      assert.equal(await page.evaluate(() => window.copiedSource), sources.get('dashboard'));
      await page.evaluate(() => window.rejectCopy = true);
      await page.click('[data-source-copy]');
      await page.waitForFunction(() => document.querySelector('#template-source-status').textContent.startsWith('Automatic copy'));
      assert.equal(await page.$eval('#template-source-code', el => el.selectionEnd - el.selectionStart), sources.get('dashboard').length);
      await page.evaluate(() => window.rejectCopy = false);
      await page.keyboard.press('Escape');
    }
  }, { beforeLoad: page => page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => {
      if (window.rejectCopy) throw new Error('Denied');
      window.copiedSource = text;
    } } });
  }) });
});

test('failed source requests show retry without a false copy success', async () => {
  let unavailable = true;
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/');
    await page.click('[data-template-source="auth"]');
    await page.waitForSelector('#template-source-status[data-state="error"]');
    assert.equal(await page.$eval('[data-source-copy]', el => el.disabled), true);
    unavailable = false;
    await page.click('[data-source-retry]');
    await page.waitForFunction(() => !document.querySelector('[data-source-copy]').disabled);
    assert.equal(await page.$eval('#template-source-code', el => el.value), sources.get('auth'));
  }, { request: async request => {
    if (unavailable && request.url().endsWith('/starters/auth.html')) { await request.abort(); return true; }
    return false;
  } });
});

test('reopening before the previous native close event keeps the new source request', async () => {
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/');
    await page.focus('[data-template-source="dashboard"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-source-copy]').disabled);
    await page.evaluate(() => {
      const dialog = document.querySelector('#template-source-dialog');
      dialog.close();
      document.querySelector('[data-template-source="auth"]').click();
      // A queued close event from the old opening may arrive after showModal().
      dialog.dispatchEvent(new Event('close'));
    });
    await page.waitForFunction(() => document.querySelector('#template-source-dialog').open
      && document.querySelector('[data-source-download]').download === 'farvist-auth.html'
      && !document.querySelector('[data-source-copy]').disabled);
    assert.equal(await page.$eval('#template-source-code', element => element.value), sources.get('auth'));
  });
});

test('a delayed close event does not steal focus from the next template', async () => {
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/');
    await page.focus('[data-template-source="dashboard"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-source-copy]').disabled);
    await page.evaluate(() => {
      const dialog = document.querySelector('#template-source-dialog');
      dialog.close();
      document.querySelector('[data-template-source="auth"]').focus();
      dialog.dispatchEvent(new Event('close'));
    });
    assert.equal(await page.$eval('[data-template-source="auth"]', element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#template-source-dialog').open
      && !document.querySelector('[data-source-copy]').disabled);
    assert.equal(await page.$eval('#template-source-code', element => element.value), sources.get('auth'));
  });
});

test('preview and download remain available without JavaScript', async () => {
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/');
    assert.equal(await page.$$eval('.tpl-actions a[download]', els => els.length), 9);
    assert.equal(await page.$$eval('.tpl-actions a[target="_blank"]', els => els.length), 9);
    assert.equal(await page.$$eval('[data-template-source]:not([hidden])', els => els.length), 0);
    await noOverflow(page);
  }, { width: 390, javascript: false });
});

test('open source viewer passes accessibility checks and keeps background controls inert', async () => {
  await pageFor(async page => {
    await page.goto(site.origin + '/templates/');
    await page.focus('[data-template-source="ai-addon"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#template-source-dialog').open
      && !document.querySelector('[data-source-copy]').disabled);
    await page.addScriptTag({ content: await readFile(new URL('node_modules/axe-core/axe.min.js', root), 'utf8') });
    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      // Same exclusion as the full-site audit: glass/gradient contrast is checked separately.
      rules: { 'color-contrast': { enabled: false } },
    })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })));
    assert.deepEqual(violations, []);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => ({
        inside: document.querySelector('#template-source-dialog').contains(document.activeElement),
        browserBoundary: document.activeElement === document.body, tag: document.activeElement.tagName,
      }));
      // Chromium reports BODY at the native dialog/browser-chrome Tab boundary.
      // No actual background control may receive focus.
      assert.ok(focus.inside || focus.browserBoundary, JSON.stringify(focus));
    }
    await page.focus('[data-source-close]');
    await page.evaluate(() => document.querySelector('[data-template-source="dashboard"]').focus());
    assert.equal(await page.evaluate(() => document.querySelector('#template-source-dialog').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('[data-template-source="ai-addon"]', el => document.activeElement === el), true);
  }, { width: 390 });
});
