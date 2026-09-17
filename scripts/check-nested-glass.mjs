// =============================================================================
// Farvist · scripts/check-nested-glass.mjs
// Regression gate for glass-inside-glass, measured in a real browser.
//
// Any element with backdrop-filter becomes a Backdrop Root: glass nested inside
// it can only blur the root's own content. A dropdown hanging BELOW the navbar
// therefore blurred nothing and rendered unfrosted — sharp page detail right
// behind the menu text (luma spread 114.5 vs 22 for standalone glass).
// 1.8.0 moved the navbar's frost to a ::before layer; that layer painted over
// .bg-* utilities, inline backgrounds and rounded corners. 1.8.1 restored the
// bar and gives menus inside it the solid surface instead. So this gate checks
// both: no nested menu shows sharp page detail, AND the navbar paints its own
// background utilities, inline backgrounds and border-radius.
//
// Method: over a black/white stripe backdrop, sample a strip of each surface
// and take the standard deviation of luma. Frosted glass smears the stripes
// (low spread); unfrosted glass shows them (high spread). Renderers blur very
// differently (standalone glass measured 22 on Windows Chromium, 4.5 on CI's
// Linux Chromium), so both ends are calibrated ON THE RUNNING RENDERER: a
// standalone .glass (frosted) and the same fill with no backdrop-filter
// (unfrosted). Nested glass fails if it sits closer to unfrosted than frosted.
//
// Run: node scripts/check-nested-glass.mjs
// =============================================================================
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('✘ check-nested-glass: puppeteer not installed — run `npm ci`.'); process.exit(1); }

// A stuck browser must FAIL this gate, never hang CI.
const WATCHDOG_MS = 120000;
setTimeout(() => { console.error('✘ check-nested-glass: timed out after ' + WATCHDOG_MS / 1000 + 's (treat as a failure).'); process.exit(1); }, WATCHDOG_MS).unref();

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
await page.setViewport({ width: 900, height: 900 });
await page.goto(pathToFileURL(join(root, 'scripts/fixtures/nested-glass.html')).href, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));

async function lumaSpread(id) {
  const r = await page.$eval('#' + id, (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  // a strip in the bottom padding, clear of text glyphs
  const clip = { x: Math.round(r.x + 4), y: Math.round(r.y + r.h - 6), width: Math.max(20, Math.round(r.w - 8)), height: 3 };
  const png = Buffer.from(await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const m = L.reduce((a, v) => a + v, 0) / L.length;
    return Math.sqrt(L.reduce((a, v) => a + (v - m) * (v - m), 0) / L.length);
  }, png);
}

async function meanRgb(clip) {
  const png = Buffer.from(await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return s.map((v) => Math.round(v / (d.length / 4)));
  }, png);
}
const box = (id) => page.$eval('#' + id, (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bg: getComputedStyle(el).backgroundColor }; });
const rgbOf = (css) => page.evaluate((c) => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }, css);

const frosted = await lumaSpread('standalone');
const unfrosted = await lumaSpread('unfrosted');
const inNavbar = await lumaSpread('nested');
const inCard = await lumaSpread('in-card');

// The navbar paints what the author put on it: a strip in its bottom padding
// must be the element's own (opaque) background colour, and the corner outside
// a rounded bar's curve must be the black panel behind it.
const paint = [];
for (const id of ['nav-bg', 'nav-inline']) {
  const b = await box(id);
  const want = await rgbOf(b.bg);
  const got = await meanRgb({ x: Math.round(b.x + 8), y: Math.round(b.y + b.h - 6), width: Math.round(b.w - 16), height: 3 });
  paint.push([`.navbar ${id === 'nav-bg' ? 'with .bg-dark' : 'with an inline background'}: painted rgb(${got}) vs its background rgb(${want})`, Math.max(...got.map((v, i) => Math.abs(v - want[i]))) <= 8]);
}
{
  const b = await box('nav-round');
  const corner = await meanRgb({ x: Math.round(b.x + 1), y: Math.round(b.y + 1), width: 3, height: 3 });
  paint.push([`.navbar.rounded-2xl corner outside the curve: rgb(${corner}) vs the black panel`, Math.max(...corner) <= 8]);
}
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]);
try { browser.process()?.kill(); } catch { /* already gone */ }

// The calibration itself must show a clear gap, or the page didn't render the
// stripes / the blur and the comparison below would be meaningless.
if (unfrosted - frosted < 30) {
  console.error(`✘ check-nested-glass: calibration failed — frosted ${frosted.toFixed(1)} vs unfrosted ${unfrosted.toFixed(1)} (need a gap ≥ 30).`);
  process.exit(1);
}
const limit = (frosted + unfrosted) / 2;
const rows = [['dropdown inside .navbar', inNavbar], ['dropdown inside .card', inCard]];
const failures = rows.filter(([, v]) => v > limit);
const paintFailures = paint.filter(([, ok]) => !ok);
console.log(`  calibration: frosted .glass ${frosted.toFixed(1)} · unfrosted fill ${unfrosted.toFixed(1)} · fail above ${limit.toFixed(1)}`);
for (const [label, v] of rows) console.log(`  ${v > limit ? '✘' : '✔'} ${label}: luma spread ${v.toFixed(1)}`);
for (const [label, ok] of paint) console.log(`  ${ok ? '✔' : '✘'} ${label}`);
if (failures.length) {
  console.error(`✘ check-nested-glass: ${failures.length} nested menu(s) render closer to unfrosted than frosted — a Backdrop Root is back.`);
  console.error('  An ancestor with backdrop-filter stops nested glass from blurring the page; give menus inside it the solid surface (see .navbar .dropdown-menu).');
}
if (paintFailures.length) {
  console.error(`✘ check-nested-glass: the navbar paints over ${paintFailures.length} author style(s) — a layer is covering its own background or ignoring its border-radius.`);
}
if (failures.length || paintFailures.length) process.exit(1);
console.log('✔ check-nested-glass: no nested menu shows sharp page detail (navbar menus solid, card menus frosted); the navbar paints its background utilities, inline backgrounds and radius');
process.exit(0);
