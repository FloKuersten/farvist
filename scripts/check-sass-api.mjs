// =============================================================================
// Farvist · scripts/check-sass-api.mjs
// Gate for the DOCUMENTED Sass API. README and the docs both tell people to
// re-theme at build time with
//     @use 'farvist/scss/farvist' with ($primary: …);
// which only works if each entry file @forwards the token layer. It silently
// did not from v0.5.0 to v1.7.4 — the snippet failed with "This variable was
// not declared with !default in the @used module" and nothing tested it.
// Compiles the documented form against every entry and asserts the override
// actually reaches the compiled custom properties. Run: node scripts/check-sass-api.mjs
// =============================================================================
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sassBin = join(root, 'node_modules/sass/sass.js');
const ENTRIES = ['farvist', 'farvist-slim', 'farvist-ai'];
const OVERRIDES = { '$primary': '#00e0ff', '$accent': '#ff4dd2' };
const EXPECT = { '--fv-primary': '#00e0ff', '--fv-accent': '#ff4dd2' };

const tmp = mkdtempSync(join(tmpdir(), 'fv-sass-api-'));
const failures = [];

for (const entry of ENTRIES) {
  const cfg = Object.entries(OVERRIDES).map(([k, v]) => `  ${k}: ${v}`).join(',\n');
  // NOT named after the entry: `@use 'farvist'` from a file called farvist.scss
  // resolves to itself and Sass reports a module loop.
  const src = join(tmp, `probe-${entry}.scss`);
  const out = join(tmp, `probe-${entry}.css`);
  writeFileSync(src, `@use '${entry}' with (\n${cfg}\n);\n`, 'utf8');
  try {
    execFileSync(process.execPath,
      [sassBin, `--load-path=${join(root, 'scss')}`, src, out, '--no-source-map'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr || Buffer.from('')).toString().split('\n').slice(0, 3).join(' ').trim();
    failures.push(`${entry}: documented \`@use … with (…)\` failed to compile — ${msg}`);
    continue;
  }
  const css = readFileSync(out, 'utf8');
  for (const [prop, val] of Object.entries(EXPECT)) {
    if (!css.includes(`${prop}: ${val}`)) {
      failures.push(`${entry}: compiled, but ${prop} is not ${val} — the override did not reach the tokens`);
    }
  }
}

rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error(`✘ check-sass-api: ${failures.length} failure(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`✔ check-sass-api: documented \`@use … with (…)\` theming works on all ${ENTRIES.length} entries`);
