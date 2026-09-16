// =============================================================================
// Farvist · scripts/check-nested-glass.mjs
// Regression gate for glass-inside-glass, measured in a real browser.
//
// Any element with backdrop-filter becomes a Backdrop Root: glass nested inside
// it can only blur the root's own content. A dropdown hanging BELOW the navbar
// therefore blurred nothing and rendered unfrosted — sharp page detail right
// behind the menu text (luma spread 114.5 vs 22 for standalone glass). The fix
// frosts a ::before layer instead of the bar; this keeps it fixed.
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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });
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

const frosted = await lumaSpread('standalone');
const unfrosted = await lumaSpread('unfrosted');
const inNavbar = await lumaSpread('nested');
const inCard = await lumaSpread('in-card');
await browser.close();

// The calibration itself must show a clear gap, or the page didn't render the
// stripes / the blur and the comparison below would be meaningless.
if (unfrosted - frosted < 30) {
  console.error(`✘ check-nested-glass: calibration failed — frosted ${frosted.toFixed(1)} vs unfrosted ${unfrosted.toFixed(1)} (need a gap ≥ 30).`);
  process.exit(1);
}
const limit = (frosted + unfrosted) / 2;
const rows = [['dropdown inside .navbar', inNavbar], ['dropdown inside .card', inCard]];
const failures = rows.filter(([, v]) => v > limit);
console.log(`  calibration: frosted .glass ${frosted.toFixed(1)} · unfrosted fill ${unfrosted.toFixed(1)} · fail above ${limit.toFixed(1)}`);
for (const [label, v] of rows) console.log(`  ${v > limit ? '✘' : '✔'} ${label}: luma spread ${v.toFixed(1)}`);
if (failures.length) {
  console.error(`✘ check-nested-glass: ${failures.length} nested glass surface(s) render closer to unfrosted than frosted — a Backdrop Root is back.`);
  console.error('  An ancestor with backdrop-filter stops nested glass from blurring the page; frost a ::before layer instead (see .navbar).');
  process.exit(1);
}
console.log('✔ check-nested-glass: glass nested in the navbar and cards stays frosted');
