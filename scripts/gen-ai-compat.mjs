// =============================================================================
// Farvist · scripts/gen-ai-compat.mjs
// Generates dist/farvist-ai-compat.css — a small UN-layered stylesheet for
// Tailwind v3 hosts. farvist-ai.css is emitted entirely in @layer; Tailwind
// v3's preflight is un-layered, and un-layered author CSS beats layered CSS
// for any property both declare. Preflight zeroes borders globally (and sets
// border-color #e5e7eb), strips button padding/font/background, and removes
// margins/list styles from prose elements — visually gutting the kit.
//
// This file re-asserts exactly those properties, un-layered, with values
// EXTRACTED from the compiled dist/farvist-ai.css so they can never drift
// from the build. Class selectors (0,1,0) beat preflight's element/universal
// selectors on specificity; a host's own class rules still win by load order
// when loaded after this file.
//
// Run after build:prefix (values are read post-autoprefixer). Fails loudly if
// a spec'd selector or property vanishes from the build.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'dist/farvist-ai.css'), 'utf8');

// ---- tiny rule collector (expanded, autoprefixed output; skips @keyframes) --
const rules = new Map(); // selector -> merged { prop: value } in source order
{
  const noKeyframes = css.replace(/@(?:-webkit-)?keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  for (const m of noKeyframes.matchAll(re)) {
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    for (let sel of m[1].split(',')) {
      sel = sel.trim().replace(/\s+/g, ' ');
      if (!sel) continue;
      const prev = rules.get(sel) || {};
      rules.set(sel, { ...prev, ...decls });
    }
  }
}

// ---- what preflight breaks, per selector ------------------------------------
const CONTROL = ['padding', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border'];
const SPEC = [
  // Buttons & control-shaped elements (preflight strips padding/font/background/border)
  ['.btn', CONTROL],
  ['.btn-sm', ['padding', 'font-size']],
  ['.btn-lg', ['padding', 'font-size']],
  ['.btn-glass', ['color', 'background-color', 'border']],
  ['.btn-gradient-primary', ['color', 'background-image']],
  ['.btn-gradient-sunset', ['color', 'background-image']],
  ['.btn-gradient-aurora', ['color', 'background-image']],
  ['.copy-btn', CONTROL],
  ['.toast-close', CONTROL],
  ['.attachment-remove', CONTROL],
  ['.suggestion', CONTROL],
  ['.command-input', ['padding', 'font-size', 'color', 'border']],
  ['.prompt-field', ['padding', 'font', 'color', 'border']],
  // Borders preflight zeroes globally (and recolors to #e5e7eb)
  ['.message-bubble', ['border']],
  ['.prompt', ['border']],
  ['.tool-call', ['border', 'border-left']],
  ['.toast', ['border', 'border-left']],
  ['.attachment', ['border']],
  ['.command', ['border']],
  ['.command-search', ['border-bottom']],
  ['.diff', ['border']],
  ['.diff-header', ['border-bottom']],
  ['.snippet-header', ['border']],
  ['pre.snippet', ['border']],
  ['.prose pre', ['border']],
  ['.tool-call-result pre', ['border']],
  ['.prose th', ['border-bottom']],
  ['.prose td', ['border-bottom']],
  ['.prose blockquote', ['border-left']],
  ['.prose code', ['border']],
  ['.prose kbd', ['border']],
  ['.command kbd', ['border']],
  ['.avatar', ['border']],
  // Prose structure (preflight strips margins, list styles, heading font)
  ['.prose p', ['margin']],
  ['.prose ul', ['margin', 'padding-left', 'list-style']],
  ['.prose ol', ['margin', 'padding-left', 'list-style']],
  ['.prose pre', ['margin']],
  ['.prose blockquote', ['margin', 'padding-left']],
  ['.prose table', ['margin']],
  ['.prose li + li', ['margin-top']],
  ['.prose h1', ['font-size']],
  ['.prose h2', ['font-size']],
  ['.prose h1', ['margin-top', 'margin-bottom', 'font-weight']],
  ['.prose h2', ['margin-top', 'margin-bottom', 'font-weight']],
  ['.prose h3', ['font-size', 'margin-top', 'margin-bottom', 'font-weight']],
  ['.prose h4', ['font-size', 'margin-top', 'margin-bottom', 'font-weight']],
  ['.prose h5', ['font-size', 'margin-top', 'margin-bottom', 'font-weight']],
  ['.prose h6', ['font-size', 'margin-top', 'margin-bottom', 'font-weight']],
  // Preflight makes svg display:block and links inherit color/decoration
  ['.icon', ['display']],
  ['.cite', ['color', 'text-decoration']],
];

// Property lists are candidates: a prop the kit never declares needs no
// re-assertion (preflight can't take away what was never set). But a missing
// SELECTOR, or a selector yielding zero props, means the build changed under
// the spec — fail loudly.
const out = new Map(); // selector -> {prop: value}
const missing = [];
for (const [sel, props] of SPEC) {
  const found = rules.get(sel);
  if (!found) { missing.push(`${sel} (selector not in build)`); continue; }
  let hits = 0;
  for (const p of props) {
    if (found[p] == null) continue;
    const cur = out.get(sel) || {};
    cur[p] = found[p];
    out.set(sel, cur);
    hits++;
  }
  if (!hits) missing.push(`${sel} (none of [${props.join(', ')}] declared)`);
}
if (missing.length) {
  throw new Error(`gen-ai-compat: spec entries not found in dist/farvist-ai.css — the build changed; update the SPEC:\n  ${missing.join('\n  ')}`);
}

const banner = `/*! Farvist AI · Tailwind v3 preflight compat — GENERATED by scripts/gen-ai-compat.mjs, do not edit.
 * Load AFTER your Tailwind v3 build, alongside farvist-ai(.min).css. Un-layered on purpose:
 * v3's un-layered preflight beats the kit's @layer rules for shared properties; these
 * class-selector re-assertions win back exactly the properties preflight zeroes.
 * Tailwind v4 (layered preflight) and Bootstrap hosts do NOT need this file. */\n`;
let body = '';
for (const [sel, decls] of out) {
  body += `${sel}{${Object.entries(decls).map(([p, v]) => `${p}:${v}`).join(';')}}\n`;
}
writeFileSync(join(root, 'dist/farvist-ai-compat.css'), banner + body);
console.log(`gen-ai-compat: ${out.size} selectors re-asserted -> dist/farvist-ai-compat.css (${(banner + body).length} bytes)`);
