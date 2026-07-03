// =============================================================================
// Farvist · scripts/check-skins.mjs
// Per-skin WCAG gate: every skin's readable-text tokens must hit AA (≥4.5:1)
// against that skin's own surface, and every -contrast token must be readable
// on its fill. Parses the [data-theme='…'] blocks out of the compiled CSS so
// the gate checks what actually ships. Run: node scripts/check-skins.mjs
// =============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'dist/farvist.css'), 'utf8');

// Defaults a skin inherits when it doesn't override a token.
const DEFAULTS = { 'body-bg': '#060912', 'muted': '#95a3c4', 'body-color': '#e6ebf5' };

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const t = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Pull every [data-theme='name'] block and its --fv-* hex tokens.
const skins = {};
for (const m of css.matchAll(/\[data-theme=['"]?([\w-]+)['"]?\][^{]*\{([^}]+)\}/g)) {
  const [, name, body] = m;
  if (name === 'light') continue; // the built-in light theme predates skins
  skins[name] = skins[name] || {};
  for (const t of body.matchAll(/--fv-([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g)) skins[name][t[1]] = t[2];
}

const failures = [];
for (const [name, tokens] of Object.entries(skins)) {
  const bg = tokens['body-bg'] || DEFAULTS['body-bg'];
  const checks = [
    ['primary-text on body-bg', tokens['primary-text'], bg],
    ['muted on body-bg', tokens['muted'] || DEFAULTS['muted'], bg],
    ['body-color on body-bg', tokens['body-color'] || DEFAULTS['body-color'], bg],
    ['primary-contrast on primary', tokens['primary-contrast'], tokens['primary']],
  ];
  for (const [label, fgc, bgc] of checks) {
    if (!fgc || !bgc) continue;
    const r = ratio(fgc, bgc);
    if (r < 4.5) failures.push(`${name}: ${label} = ${r.toFixed(2)}:1 (${fgc} on ${bgc}) — needs ≥4.5`);
  }
}

const count = Object.keys(skins).length;
if (!count) { console.error('✘ check-skins: no [data-theme] skin blocks found in dist — did the build run?'); process.exit(1); }
if (failures.length) {
  console.error(`✘ check-skins: ${failures.length} contrast failure(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`✔ check-skins: ${count} skins, all readable-text tokens ≥4.5:1 on their surfaces`);
