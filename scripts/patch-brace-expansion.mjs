// =============================================================================
// Farvist · scripts/patch-brace-expansion.mjs  (runs from "prepare" — NOT postinstall: scripts/ is excluded from the
// published tarball, so a postinstall hook here breaks every consumer install)
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
import { readFileSync, writeFileSync, openSync, closeSync, fstatSync, constants, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/* farvist: callable default export for minimatch@3 consumers */';

export function patchDir(dir) {
  const pkgPath = join(dir, 'package.json');
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (pkg.name !== 'brace-expansion' || parseInt(pkg.version, 10) < 5) return false;
  const entry = join(dir, 'dist/commonjs/index.js');
  // Bind the read and write to the same inode; never reopen a checked path or
  // create a missing upstream file. O_NOFOLLOW also rejects symlinks on Unix.
  const fd = openSync(entry, constants.O_RDWR | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    if (!fstatSync(fd).isFile()) throw new Error('brace-expansion entry must be a regular file');
    const src = readFileSync(fd, 'utf8');
    if (src.includes(MARKER)) return true;
    // readFileSync left this descriptor at EOF; append only the wrapper.
    writeFileSync(fd, `\n${MARKER}\nmodule.exports = Object.assign(function (str) { return expand(str); }, module.exports);\n`);
  } finally { closeSync(fd); }
  return true;
}

// The override dedupes to a single root copy, but walk one nesting level too
// so a future npm layout change can't silently skip the patch.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let patched = 0;
  const candidates = [join(root, 'node_modules/brace-expansion')];
  const nm = join(root, 'node_modules');
  let entries;
  try { entries = readdirSync(nm, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
  for (const scope of entries) {
    if (!scope.isDirectory()) continue;
    const nested = join(nm, scope.name, 'node_modules/brace-expansion');
    candidates.push(nested);
  }
  for (const dir of candidates) if (patchDir(dir)) patched++;
  console.log(`patch-brace-expansion: ${patched} install(s) patched callable`);
}
