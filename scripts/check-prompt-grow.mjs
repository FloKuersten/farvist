// =============================================================================
// Farvist · scripts/check-prompt-grow.mjs
// Gate for the prompt composer's auto-grow in engines WITHOUT native
// `field-sizing: content` (Firefox <152, Safari <26.2), where farvist.js does
// the sizing.
//
// Chromium has the native feature, so the older engine is simulated: window.CSS
// is replaced so CSS.supports('field-sizing', …) reports false (injected with
// evaluateOnNewDocument, which only runs on a real navigation — page.setContent
// skips it), and the textarea is given
// `field-sizing: fixed` so the native sizing is off. The same scenarios then run
// natively, and the JS fallback must match native within 2px:
//   empty on load · typed · cleared in a submit handler · form.reset()
//   · pre-filled while hidden, then shown · narrowed and widened
// plus: an author-set height is never overridden, and in a native engine an
// author's `field-sizing: fixed` opt-out is left alone.
//
// Run: node scripts/check-prompt-grow.mjs
// =============================================================================
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('✘ check-prompt-grow: puppeteer not installed — run `npm ci`.'); process.exit(1); }

const url = pathToFileURL(join(root, 'scripts/fixtures/prompt-grow.html')).href;
// A broken composer must FAIL this gate, never hang CI: cap every browser action
// and the whole run.
const WATCHDOG_MS = 120000;
setTimeout(() => { console.error('✘ check-prompt-grow: timed out after ' + WATCHDOG_MS / 1000 + 's — a scenario never completed (treat as a failure).'); process.exit(1); }, WATCHDOG_MS).unref();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, fallback) {
  // Each run gets an isolated context. Pages are not closed individually:
  // page.close() after a modal <dialog> was shown can hang in Chromium, and the
  // whole browser is torn down (time-boxed) at the end anyway.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1200, height: 900 });
  if (fallback) {
    await page.evaluateOnNewDocument(() => {
      const real = window.CSS;
      const fake = Object.create(real);
      fake.supports = (a, v) => (String(a).includes('field-sizing') ? false : real.supports(a, v));
      Object.defineProperty(window, 'CSS', { value: fake, configurable: true, writable: true });
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '.prompt-field { field-sizing: fixed !important; }';
        document.head.appendChild(s);
      });
    });
  }
  await page.goto(url, { waitUntil: 'load' });
  await wait(300);
  const h = (id) => page.$eval('#' + id, (el) => Math.round(el.getBoundingClientRect().height));
  const r = {};

  r.detected = await page.evaluate(() => CSS.supports('field-sizing', 'content'));
  r.empty = await h('p-empty');

  await page.evaluate(() => document.getElementById('dlg').showModal());
  await wait(200);
  r.hiddenThenShown = await h('p-hidden');
  await page.evaluate(() => document.getElementById('dlg').close());

  await page.evaluate(() => { document.getElementById('wrap').style.width = '420px'; });
  await wait(200);
  r.narrowed = await h('p-resize');
  await page.evaluate(() => { document.getElementById('wrap').style.width = '900px'; });
  await wait(200);
  r.widened = await h('p-resize');

  await page.focus('#p-type');
  for (let i = 1; i <= 5; i++) { await page.keyboard.type('line ' + i); if (i < 5) await page.keyboard.press('Enter'); }
  r.typed = await h('p-type');
  await page.evaluate(() => document.getElementById('f-type').requestSubmit()); // fires the app's submit handler, like a click
  await wait(150);
  r.clearedOnSubmit = await h('p-type');

  await page.focus('#p-reset');
  for (let i = 1; i <= 4; i++) { await page.keyboard.type('row ' + i); if (i < 4) await page.keyboard.press('Enter'); }
  await page.evaluate(() => document.getElementById('f-reset').reset());
  await wait(150);
  r.reset = await h('p-reset');

  r.authorHeight = await h('p-author');
  r.authorInline = await page.$eval('#p-author', (el) => el.style.height);
  r.optoutInline = await page.$eval('#p-optout', (el) => el.style.height);
  return r;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const native = await run(browser, false);
const fallback = await run(browser, true);
await Promise.race([browser.close(), wait(10000)]);
// a hung close leaves Chromium keeping Node alive: end the browser we launched
try { browser.process()?.kill(); } catch { /* already gone */ }

const failures = [];
if (native.detected !== true) failures.push(`native run should detect field-sizing (got ${native.detected})`);
if (fallback.detected !== false) failures.push(`simulation failed: fallback run still detects field-sizing (${fallback.detected})`);
for (const k of ['empty', 'hiddenThenShown', 'narrowed', 'widened', 'typed', 'clearedOnSubmit', 'reset']) {
  if (Math.abs(native[k] - fallback[k]) > 2) failures.push(`${k}: JS fallback ${fallback[k]}px vs native ${native[k]}px`);
}
// sanity: the scenarios must actually exercise growth, or matching proves nothing
if (!(native.typed > native.empty + 40)) failures.push(`fixture broken: typing 5 lines did not grow the native composer (${native.empty} -> ${native.typed})`);
if (!(native.narrowed > native.widened)) failures.push(`fixture broken: narrowing did not re-wrap (${native.widened} -> ${native.narrowed})`);
if (fallback.authorHeight !== 128 || fallback.authorInline) failures.push(`author height overridden in the fallback: ${fallback.authorHeight}px, inline "${fallback.authorInline}"`);
if (native.optoutInline) failures.push(`an author's field-sizing:fixed opt-out got an inline height in a native engine: "${native.optoutInline}"`);

const table = Object.keys(native).filter((k) => typeof native[k] === 'number').map((k) => `${k} ${native[k]}/${fallback[k]}`).join(' · ');
if (failures.length) {
  console.error(`✘ check-prompt-grow: ${failures.length} problem(s)   [native/fallback px: ${table}]`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✔ check-prompt-grow: JS fallback matches native field-sizing in 7 scenarios; author heights and opt-outs respected   [native/fallback px: ${table}]`);
process.exit(0);
