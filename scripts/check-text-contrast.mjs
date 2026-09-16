// =============================================================================
// Farvist · scripts/check-text-contrast.mjs
// WCAG AA gate for every COLOURED TEXT treatment, measured in a real browser,
// in every theme and skin.
//
// Why this exists: check-skins validates tokens, check-ai-contrast only sees
// the AI-kit selectors that happen to be on the example pages, and pa11y runs
// with axe's color-contrast rule off. So `.text-success` shipped at 1.70:1 on
// the light theme and nothing noticed. This renders a fixture that puts every
// coloured-text class on the page surface AND on glass, then measures each
// against the composited background.
//
// Run: node scripts/check-text-contrast.mjs            (gate)
//      node scripts/check-text-contrast.mjs --report   (print every ratio)
// =============================================================================
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const REPORT = process.argv.includes('--report');

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('✘ check-text-contrast: puppeteer not installed — run `npm ci`.'); process.exit(1); }

const MIN = 4.5;
// '' is the default dark theme. Skins come from the compiled CSS so a new skin
// is covered without editing this list.
const { readFileSync } = await import('node:fs');
const css = readFileSync(join(root, 'dist/farvist.css'), 'utf8');
const THEMES = ['', ...new Set([...css.matchAll(/\[data-theme=['"]?([\w-]+)['"]?\]/g)].map((m) => m[1]))];

const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = (s) => {
  const m = (s.match(/-?[\d.]+/g) || []).map(Number);
  // color-mix() computes to color(srgb r g b / a) with 0-1 components
  const c = /color\(\s*srgb/i.test(s) ? m.slice(0, 3).map((v) => v * 255).concat(m[3] == null ? 1 : m[3]) : m;
  return c.length === 3 ? [...c, 1] : c;
};
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };

const fixture = pathToFileURL(join(root, 'scripts/fixtures/text-contrast.html')).href;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const failures = [];
let measured = 0;

for (const theme of THEMES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(fixture + (theme ? '#' + theme : ''), { waitUntil: 'load', timeout: 30000 });

  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-contrast]')].map((el) => {
    const cs = getComputedStyle(el);
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') stack.push(bg);
    }
    const rootBg = getComputedStyle(document.documentElement).backgroundColor;
    return { label: el.getAttribute('data-contrast'), color: cs.color, stack,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      pageBg: rootBg !== 'rgba(0, 0, 0, 0)' ? rootBg : 'rgb(255,255,255)' };
  }));

  for (const r of rows) {
    // EXEMPT, by design: a `-dark` variant on a dark scheme names a colour, not
    // a role — dark ink on a dark page (Bootstrap's `.btn-outline-dark` / the
    // `.text-light`-on-white convention). Everything else is gated.
    if (/\bdark\b/.test(r.scheme) && /-dark\b/.test(r.label)) continue;
    // the body is in the stack already; the canvas colour sits beneath it
    let bg = parse(r.pageBg).slice(0, 3);
    for (const layer of [...r.stack].reverse()) bg = over(parse(layer), bg);
    const c = ratio(parse(r.color).slice(0, 3), bg);
    measured++;
    const line = `[${theme || 'dark'}] ${r.label} = ${c.toFixed(2)}:1`;
    if (REPORT) console.log((c < MIN ? '✘ ' : '  ') + line);
    if (c < MIN) failures.push(line);
  }
  await page.close();
}
await browser.close();

if (failures.length) {
  console.error(`✘ check-text-contrast: ${failures.length} of ${measured} coloured-text measurements below ${MIN}:1`);
  if (!REPORT) for (const f of failures) console.error('  ' + f);
  console.error('  Fix by pointing the rule at --fv-{color}-text (mixed toward --fv-body-color on light surfaces).');
  process.exit(1);
}
console.log(`✔ check-text-contrast: ${measured} coloured-text measurements ≥${MIN}:1 across ${THEMES.length} themes (page surface + glass)`);
