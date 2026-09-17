// =============================================================================
// Farvist · scripts/check-theming.mjs
// v1.3 "Bring Your Brand" gate: the compiled CSS must not bake brand colors
// into component rules. Brand hexes may appear ONLY as custom-property
// definitions (--fv-*: #hex) — everything else must derive via var()/color-mix
// so a runtime override re-brands the whole framework.
// Run: node scripts/check-theming.mjs   (wired into CI)
// =============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'dist/farvist.css'), 'utf8');

// The brand palette (from scss/abstracts/_variables.scss). If a token changes
// there, update it here — the gate exists to catch *derivations*, and a
// renamed token would surface as a build diff anyway.
const BRAND = {
  '#6d4af5': 'primary', '#7c8aa5': 'secondary', '#34d399': 'success',
  '#fb5b78': 'danger', '#fbbf24': 'warning', '#22d3ee': 'info', '#e879f9': 'accent',
};
// Also catch their rgb()/rgba() compiled forms.
const RGB = {
  'primary': [109, 74, 245], 'secondary': [124, 138, 165], 'success': [52, 211, 153],
  'danger': [251, 91, 120], 'warning': [251, 191, 36], 'info': [34, 211, 238], 'accent': [232, 121, 249],
};

const lines = css.split('\n');
const offenders = [];
let inAllowedBlock = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Custom-property definitions are the allowed home for brand literals.
  const isVarDef = /^\s*--fv-[\w-]+:/.test(line);
  const lower = line.toLowerCase();

  for (const [hex, name] of Object.entries(BRAND)) {
    if (lower.includes(hex) && !isVarDef) offenders.push(`${i + 1}: [${name} hex] ${line.trim().slice(0, 110)}`);
  }
  for (const [name, [r, g, b]] of Object.entries(RGB)) {
    const re = new RegExp(`rgba?\\(\\s*${r}(?:\\.\\d+)?\\s*,\\s*${g}(?:\\.\\d+)?\\s*,\\s*${b}(?:\\.\\d+)?`);
    if (re.test(line) && !isVarDef) offenders.push(`${i + 1}: [${name} rgb] ${line.trim().slice(0, 110)}`);
  }
}

// Readable-text companions are custom-property definitions too, so the scan
// above allows literals there. But the DEFAULT themes' companions must derive
// from their brand token, or `:root { --fv-primary: … }` re-brands buttons while
// .text-primary and alert headings keep the old hue (1.8.0 compiled
// --fv-primary-text to a constant). Skins may keep hand-tuned literals.
const block = (selector) => {
  const at = css.indexOf(selector + ' {');
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const derived = [
  [':root', ['primary-text', 'primary'], ['secondary-text', 'secondary']],
  [":root[data-theme=light],\n  [data-theme=light]", ['success-text', 'success'], ['danger-text', 'danger'], ['warning-text', 'warning'], ['info-text', 'info'], ['accent-text', 'accent'], ['secondary-text', 'secondary']],
];
for (const [selector, ...pairs] of derived) {
  const body = block(selector);
  if (!body) { offenders.push(`[derived] no "${selector.replace(/\s+/g, ' ')}" block found in dist/farvist.css`); continue; }
  for (const [token, brand] of pairs) {
    const value = (body.match(new RegExp(`--fv-${token}:\\s*([^;]+);`)) || [])[1];
    if (!value) offenders.push(`[derived] ${selector.split(',')[0]} defines no --fv-${token}`);
    else if (!value.includes(`var(--fv-${brand})`)) offenders.push(`[derived] ${selector.split(',')[0]} --fv-${token}: ${value.trim()} — must derive from var(--fv-${brand}) so a re-brand follows`);
  }
}

if (offenders.length) {
  console.error(`✘ check-theming: ${offenders.length} problem(s) — baked brand colours outside --fv-* definitions, or [derived] text companions that don't follow a re-brand:\n`);
  for (const o of offenders.slice(0, 25)) console.error('  ' + o);
  if (offenders.length > 25) console.error(`  … and ${offenders.length - 25} more`);
  process.exit(1);
}
console.log('✔ check-theming: no baked brand colors outside --fv-* definitions, and the default themes\' text companions derive from their brand tokens — runtime re-branding is complete');
