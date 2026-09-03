// =============================================================================
// Farvist · scripts/check-ai-contrast.mjs
// WCAG AA gate for the AI kit's SMALL TEXT, measured in a real browser.
//
// Why a browser and not a stylesheet parse: these strings sit on translucent
// glass over a mesh gradient, so their effective background is a composite that
// only the renderer knows. `check-skins` resolves tokens statically and cannot
// see it — which is how `.cite` shipped at 3.85:1 in the dark theme while every
// static gate passed. pa11y cannot see it either: `.pa11yci.json` disables
// axe's color-contrast rule on purpose (it false-positives through gradient text
// and glass), so this is the only thing watching these selectors.
//
// TRAP, learned the hard way: `body` carries `transition: background-color .2s`.
// Sampling sooner than that returns the PREVIOUS theme's background under the
// NEW theme's text colour, which reports catastrophic ratios that are not real.
// SETTLE_MS is deliberately generous.
//
// Run: node scripts/check-ai-contrast.mjs
// =============================================================================
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('✘ check-ai-contrast: puppeteer not installed — run `npm ci`.'); process.exit(1); }

const SETTLE_MS = 1600;
const MIN = 4.5;

// Every AI-kit string small enough to need the 4.5:1 floor.
const SELECTORS = ['.cite', '.tool-call-status', '.message-meta', '.command-group',
  '.command-hint', '.prompt-meta', '.snippet-lang', '.attachment-meta'];

// Every shipped page that renders the AI kit.
const PAGES = readdirSync(join(root, 'examples'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `examples/${f}`);

const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = (s) => {
  const m = (s.match(/[\d.]+/g) || []).map(Number);
  // color-mix() computes to color(srgb r g b) with 0-1 components
  const c = /color\(\s*srgb/i.test(s) ? m.slice(0, 3).map((v) => v * 255).concat(m[3] == null ? 1 : m[3]) : m;
  return c.length === 3 ? [...c, 1] : c;
};
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const failures = [];
let measured = 0;

for (const file of PAGES) {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    // offline: the Google Fonts link would hang the load
    page.on('request', (r) => (r.url().startsWith('file://') ? r.continue() : r.abort()));
    try {
      await page.goto(pathToFileURL(join(root, file)).href, { waitUntil: 'load', timeout: 30000 });
    } catch { await page.close(); continue; }
    if (theme === 'light') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    // lay out the command palette so its strings are measurable
    await page.evaluate(() => {
      const d = document.querySelector('dialog.command');
      if (d && d.showModal && !d.open) { try { d.showModal(); } catch (e) { /* not on this page */ } }
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    const rows = await page.evaluate((sels) => sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return { sel, missing: true };
      const stack = [];
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)') stack.push(bg);
      }
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      return { sel, color: cs.color, size: cs.fontSize, stack,
        pageBg: bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : 'rgb(255,255,255)' };
    }), SELECTORS);

    for (const r of rows) {
      if (r.missing) continue;
      let bg = parse(r.pageBg).slice(0, 3);
      for (const layer of [...r.stack].reverse()) bg = over(parse(layer), bg);
      const c = ratio(parse(r.color).slice(0, 3), bg);
      measured++;
      if (c < MIN) failures.push(`${file} [${theme}] ${r.sel} (${r.size}) = ${c.toFixed(2)}:1`);
    }
    await page.close();
  }
}
await browser.close();

if (failures.length) {
  console.error(`✘ check-ai-contrast: ${failures.length} of ${measured} measurements below ${MIN}:1`);
  for (const f of failures) console.error('  ' + f);
  console.error('  Fix by mixing the colour toward --fv-body-color (see .cite in scss/components/_chat.scss),');
  console.error('  or page-scoped in the template if the page adds a translucent layer the kit does not assume.');
  process.exit(1);
}
console.log(`✔ check-ai-contrast: ${measured} AI-kit text measurements ≥${MIN}:1 across ${PAGES.length} pages, both themes`);
