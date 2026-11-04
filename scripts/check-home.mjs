// Browser regressions for the homepage's motion controls and progressive enhancement.
// Run with Node's test runner: node --test scripts/check-home.mjs.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';

let browser;
let server;
let origin;

before(async () => {
  // Snapshot only these public files before opening a listener. Request paths
  // never become filesystem paths, and this server cannot expose the checkout.
  const files = new Map(await Promise.all([
    ['index.html', 'text/html; charset=utf-8'],
    ['dist/farvist.min.css', 'text/css; charset=utf-8'],
    ['assets/home.css', 'text/css; charset=utf-8'],
    ['assets/home.js', 'text/javascript; charset=utf-8'],
    ['assets/farvist.js', 'text/javascript; charset=utf-8'],
    ['assets/icons/farvist-icons.svg', 'image/svg+xml'],
    ['assets/favicon.svg', 'image/svg+xml'],
    ['assets/favicon-32.png', 'image/png'],
    ['assets/apple-touch-icon.png', 'image/png'],
  ].map(async ([file, type]) => [
    `/${file}`, { type, body: await readFile(new URL(`../${file}`, import.meta.url)) },
  ])));
  server = createServer((request, response) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400).end(); return; }
    const file = files.get(pathname === '/' ? '/index.html' : pathname);
    if (!file || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : file.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function withPage(run, options = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  const failedAssets = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin + '/') && response.status() >= 400) {
      failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });
  try {
    await page.setViewport({ width: options.width || 1440, height: 1000, hasTouch: !!options.touch });
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Font CDNs and third-party services are unnecessary to prove behavior.
      if (request.url().startsWith(origin + '/')) request.continue();
      else request.abort();
    });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: options.reduced ? 'reduce' : 'no-preference' }]);
    if (options.pointer) {
      // Headless hosts disagree about available pointing hardware. Control only
      // these capability queries; reduced motion and every other query stay native.
      await page.evaluateOnNewDocument((pointer) => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        const fine = pointer === 'fine';
        const capabilities = new Map([
          ['(hover:hover)', fine], ['(hover:none)', !fine],
          ['(pointer:fine)', fine], ['(pointer:coarse)', !fine],
          ['(hover:hover)and(pointer:fine)', fine],
        ]);
        window.matchMedia = (query) => {
          const result = nativeMatchMedia(query);
          const normalized = String(query).replace(/\s+/g, '').toLowerCase();
          if (capabilities.has(normalized)) {
            Object.defineProperty(result, 'matches', { value: capabilities.get(normalized) });
          }
          return result;
        };
      }, options.pointer);
    }
    if (options.javascript === false) await page.setJavaScriptEnabled(false);
    if (options.beforeLoad) await options.beforeLoad(page);
    const response = await page.goto(origin, { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await run(page);
    assert.deepEqual(errors, [], 'homepage scripts must not throw');
    assert.deepEqual(failedAssets, [], 'all local homepage assets must load');
  } finally {
    await context.close();
  }
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function assertStopped(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
}

async function assertFullyVisible(page, selector) {
  const state = await page.$eval(selector, (node) => {
    const box = node.getBoundingClientRect();
    const ancestors = [];
    for (let element = node; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      ancestors.push({
        element: element.id || element.tagName,
        opacity: Number(style.opacity),
        visibility: style.visibility,
        display: style.display,
      });
    }
    return { width: box.width, height: box.height, ancestors };
  });
  assert.ok(state.width > 0 && state.height > 0, `${selector} must have a visible box`);
  for (const ancestor of state.ancestors) {
    assert.equal(ancestor.opacity, 1, `${selector} must not be transparent through ${ancestor.element}`);
    assert.equal(ancestor.visibility, 'visible', `${selector} visibility through ${ancestor.element}`);
    assert.notEqual(ancestor.display, 'none', `${selector} display through ${ancestor.element}`);
  }
}

async function checkPreset(page, preset) {
  await page.click(`[data-motion-preset="${preset}"]`);
  const state = await page.evaluate(() => ({
    preset: document.getElementById('motion-stage').dataset.preset,
    pressed: Array.from(document.querySelectorAll('[data-motion-preset]'))
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.dataset.motionPreset),
    status: document.getElementById('motion-status').textContent.toLowerCase(),
  }));
  assert.equal(state.preset, preset);
  assert.deepEqual(state.pressed, [preset]);
  assert.ok(state.status.includes(preset), `status must describe ${preset}: ${state.status}`);
}

test('motion presets and keyboard-adjusted ranges produce usable CSS', async () => {
  await withPage(async (page) => {
    const defaults = await page.evaluate(() => ['motion-duration', 'motion-distance'].map((id) => {
      const input = document.getElementById(id);
      return { min: input.min, max: input.max, value: input.value };
    }));
    assert.deepEqual(defaults, [
      { min: '2', max: '10', value: '6' },
      { min: '8', max: '32', value: '20' },
    ]);
    for (const preset of ['orbit', 'stack', 'drift']) await checkPreset(page, preset);

    await page.focus('#motion-duration');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.focus('#motion-distance');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    const adjusted = await page.evaluate(() => ({
      duration: document.getElementById('motion-duration').value,
      distance: document.getElementById('motion-distance').value,
      code: document.getElementById('motion-css').textContent,
    }));
    assert.equal(adjusted.duration, '3');
    assert.equal(adjusted.distance, '30');
    assert.match(adjusted.code, /\b3s\b/);
    assert.match(adjusted.code, /\b30px\b/);
    await assertNoOverflow(page);
  });
});

test('pause stops motion, survives reload, and permits deliberate resume', async () => {
  await withPage(async (page) => {
    await page.click('#motion-toggle');
    assert.equal(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused');
    assert.equal(await page.$eval('#motion-toggle', (node) => node.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('fv-home-motion')), 'paused');
    assert.match(await page.$eval('#motion-status', (node) => node.textContent), /paused/i);
    await assertStopped(page);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused');
    await assertStopped(page);
    // A paused CSS entrance must not strand newly rendered content at opacity 0.
    await assertFullyVisible(page, '#hero-preview');
    await page.click('[data-fv-tab="#hero-code"]');
    await assertFullyVisible(page, '#hero-code');
    await page.click('[data-fv-open="#demo-modal"]');
    assert.equal(await page.$eval('#demo-modal', (node) => node.open), true);
    await assertFullyVisible(page, '#demo-modal');
    await page.click('#demo-modal [data-fv-dismiss]');
    assert.equal(await page.$eval('#demo-modal', (node) => node.open), false);
    await page.click('button[onclick^="Farvist.toast"]');
    await assertFullyVisible(page, '.toast-container .toast');
    await page.click('.toast-container .toast-close');
    await page.waitForSelector('.toast-container .toast', { hidden: true });
    await checkPreset(page, 'orbit');
    await assertStopped(page);
    await page.click('#motion-toggle');
    assert.notEqual(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused');
    assert.equal(await page.$eval('#motion-toggle', (node) => node.getAttribute('aria-pressed')), 'false');
  });
});

test('OS reduced motion is honored on load and when the preference changes', async () => {
  await withPage(async (page) => {
    assert.equal(await page.$eval('#motion-toggle', (node) => node.disabled), true);
    await assertStopped(page);
    await checkPreset(page, 'stack');
    await assertStopped(page);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.waitForFunction(() => !document.getElementById('motion-toggle').disabled);
    await page.click('#motion-toggle');
    assert.equal(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(() => document.getElementById('motion-toggle').disabled);
    await assertStopped(page);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.waitForFunction(() => !document.getElementById('motion-toggle').disabled);
    assert.equal(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused', 'OS changes must preserve a visitor’s pause');
    await assertStopped(page);
  }, { reduced: true });
});

test('blocked storage does not break motion, theme, or tabs', async () => {
  await withPage(async (page) => {
    await page.click('#motion-toggle');
    assert.equal(await page.$eval('html', (node) => node.dataset.homeMotion), 'paused');
    await page.click('#motion-toggle');
    await checkPreset(page, 'orbit');
    await page.click('#theme-toggle');
    assert.equal(await page.$eval('html', (node) => node.dataset.theme), 'light');
    await page.click('[data-fv-tab="#hero-code"]');
    assert.equal(await page.$eval('#hero-code', (node) => node.hidden), false);
    assert.equal(await page.$eval('[data-fv-tab="#hero-code"]', (node) => node.getAttribute('aria-selected')), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$eval('[data-fv-tab="#hero-preview"]', (node) => node.getAttribute('aria-selected')), 'true');
  }, {
    beforeLoad: (page) => page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    }),
  });
});

test('mobile menu and motion controls remain usable without horizontal overflow', async () => {
  await withPage(async (page) => {
    await assertNoOverflow(page);
    await page.click('[data-fv-nav-toggle]');
    assert.equal(await page.$eval('[data-fv-nav-toggle]', (node) => node.getAttribute('aria-expanded')), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('[data-fv-nav-toggle]', (node) => node.getAttribute('aria-expanded')), 'false');
    await checkPreset(page, 'stack');
    await assertNoOverflow(page);
  }, { width: 390 });
});

test('pointer tilt is available to precise pointers and stops when motion is paused', async () => {
  await withPage(async (page) => {
    assert.equal(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), true);
    const card = await page.$('.showcase');
    const bounds = await card.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.3);
    await page.waitForFunction(() => {
      const style = getComputedStyle(document.querySelector('.showcase'));
      return ['--tilt-x', '--tilt-y'].some((name) => Math.abs(parseFloat(style.getPropertyValue(name))) > 0);
    });
    await page.click('#motion-toggle');
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
    const tilt = await page.$eval('.showcase', (card) => {
      const style = getComputedStyle(card);
      return ['--tilt-x', '--tilt-y'].map((name) => parseFloat(style.getPropertyValue(name)) || 0);
    });
    assert.deepEqual(tilt, [0, 0]);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(() => document.getElementById('motion-toggle').disabled);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  }, { pointer: 'fine' });
  await withPage(async (page) => {
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    const card = await page.$('.showcase');
    const bounds = await card.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.3);
    const tilt = await page.$eval('.showcase', (card) => {
      const style = getComputedStyle(card);
      return ['--tilt-x', '--tilt-y'].map((name) => parseFloat(style.getPropertyValue(name)) || 0);
    });
    assert.deepEqual(tilt, [0, 0]);
  }, { touch: true, pointer: 'coarse' });
});

test('homepage content remains visible without JavaScript on desktop and mobile', async () => {
  for (const width of [390, 1440]) {
    await withPage(async (page) => {
      const hiddenHeadings = await page.evaluate(() => Array.from(document.querySelectorAll('main h1, main section h2'))
        .filter((heading) => {
          if (!heading.getClientRects().length) return true;
          for (let element = heading; element; element = element.parentElement) {
            const style = getComputedStyle(element);
            if (style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
          }
          return false;
        }).map((heading) => heading.textContent.trim()));
      assert.deepEqual(hiddenHeadings, [], 'headings must not wait for an animation script to reveal them');
      assert.ok(await page.$('#motion'), 'the motion example must render as HTML');
      await assertNoOverflow(page);
    }, { width, javascript: false });
  }
});
