// =============================================================================
// Farvist · scripts/check-forced-colors.mjs
// Gate: a .form-select must still show that it is a select in forced-colors
// mode (Windows High Contrast).
//
// The chevron is drawn with linear-gradient() backgrounds so it follows the
// --fv-muted token. Forced-colors mode removes every background-image that is
// not a url(), and the select has `appearance: none`, so in 1.8.0 it rendered
// exactly like a text input there. Under `forced-colors: active` each select
// must now either keep a url() image or get the native arrow back
// (appearance: auto). Outside that mode the native arrow must stay off, or it
// would double up with the token chevron.
//
// Run: node scripts/check-forced-colors.mjs
// =============================================================================
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch { console.error('✘ check-forced-colors: puppeteer not installed — run `npm ci`.'); process.exit(1); }

const WATCHDOG_MS = 60000;
setTimeout(() => { console.error('✘ check-forced-colors: timed out after ' + WATCHDOG_MS / 1000 + 's (treat as a failure).'); process.exit(1); }, WATCHDOG_MS).unref();

const IDS = ['plain', 'grouped', 'light'];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
await page.goto(pathToFileURL(join(root, 'scripts/fixtures/forced-colors.html')).href, { waitUntil: 'load' });

const read = () => page.evaluate((ids) => ({
  forced: matchMedia('(forced-colors: active)').matches,
  selects: ids.map((id) => { const cs = getComputedStyle(document.getElementById(id)); return { id, appearance: cs.appearance, image: cs.backgroundImage }; }),
}), IDS);

const normal = await read();
// puppeteer's emulateMediaFeatures() rejects forced-colors; the CDP command accepts it.
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
const forced = await read();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]);
try { browser.process()?.kill(); } catch { /* already gone */ }

const failures = [];
if (normal.forced || !forced.forced) failures.push(`emulation failed: forced-colors matched ${normal.forced} normally and ${forced.forced} when emulated`);
for (const s of normal.selects) {
  if (s.appearance !== 'none') failures.push(`#${s.id}: native arrow shown outside forced-colors (appearance ${s.appearance}) — it would double up with the chevron`);
  if (!/gradient|url\(/.test(s.image)) failures.push(`#${s.id}: no chevron outside forced-colors (background-image ${s.image})`);
}
for (const s of forced.selects) {
  if (s.appearance === 'none' && !/url\(/.test(s.image)) failures.push(`#${s.id}: no chevron in forced-colors mode — appearance none, background-image ${s.image}`);
}

if (failures.length) {
  console.error(`✘ check-forced-colors: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✔ check-forced-colors: ${IDS.length} .form-select variants keep an arrow in forced-colors mode (appearance ${forced.selects[0].appearance}) and show only the token chevron otherwise`);
process.exit(0);
