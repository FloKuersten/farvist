// =============================================================================
// Farvist · scripts/patch-brace-expansion.mjs  (runs from "postinstall")
// -----------------------------------------------------------------------------
// The 2026 unbounded-expansion advisory considers only brace-expansion >=5.0.8
// patched, so package.json overrides force v5 tree-wide. But v5's CommonJS
// build exports an object ({ expand, EXPANSION_MAX, ... }) while minimatch@3 —
// still what serve and pa11y-ci resolve — calls the module directly:
// `require('brace-expansion')(pattern)`. Without this patch any brace glob
// (e.g. '*.{css,js}') throws TypeError.
//
// This appends a small marker-guarded wrapper to the installed CJS entry that
// re-exports `expand` as a callable default while keeping the named exports
// and the v5 expansion caps. Idempotent; no-ops for brace-expansion < 5.
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/* farvist: callable default export for minimatch@3 consumers */';

function patchDir(dir) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== 'brace-expansion' || parseInt(pkg.version, 10) < 5) return false;
  const entry = join(dir, 'dist/commonjs/index.js');
  if (!existsSync(entry)) throw new Error(`patch-brace-expansion: ${entry} missing — upstream layout changed, update this script.`);
  const src = readFileSync(entry, 'utf8');
  if (src.includes(MARKER)) return true; // already patched
  writeFileSync(entry, src + `\n${MARKER}\nmodule.exports = Object.assign(function (str) { return expand(str); }, module.exports);\n`);
  return true;
}

// The override dedupes to a single root copy, but walk one nesting level too
// so a future npm layout change can't silently skip the patch.
let patched = 0;
const candidates = [join(root, 'node_modules/brace-expansion')];
const nm = join(root, 'node_modules');
if (existsSync(nm)) {
  for (const scope of readdirSync(nm)) {
    const nested = join(nm, scope, 'node_modules/brace-expansion');
    if (existsSync(nested)) candidates.push(nested);
  }
}
for (const dir of candidates) if (patchDir(dir)) patched++;
console.log(`patch-brace-expansion: ${patched} install(s) patched callable`);
