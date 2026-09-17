// =============================================================================
// Farvist · scripts/check-cdn-pins.mjs
// Fails if any tracked file links Farvist from a CDN without a version (or @latest).
//
// An unversioned jsDelivr URL (…/npm/farvist/dist/…) follows `latest`, so the
// day a 2.0 removes a class, every page built from those snippets breaks. That
// matters most in llms.txt / llms-full.txt / ai-context.json / the rule files:
// they exist to be copied into generated code by AI assistants. Pin to the
// major version (`farvist@1`) — or an exact version plus SRI for production.
//
// Run: node scripts/check-cdn-pins.mjs
// =============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Unpinned = no version (…/farvist/dist/…, or the bare package URL, which serves
// the main stylesheet) or @latest: both follow the newest release. Same pattern
// as the unpinned-cdn rule in bin/farvist.mjs.
const UNPINNED = /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com|cdn\.jsdelivr\.net\/gh\/flokuersten)\/farvist(?:@latest)?(?![\w.@-])/gi;
const TEXT = /\.(html?|md|txt|json|mjs|js|cursorrules|mdc|xml|yml|yaml)$/i;

// scripts/fixtures/ holds deliberately-wrong markup that tests `npx farvist check`.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => f && TEXT.test(f) && !f.startsWith('scripts/check-cdn-pins.mjs') && !f.startsWith('scripts/fixtures/'));

const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => { if (UNPINNED.test(line)) hits.push(`${f}:${i + 1}`); UNPINNED.lastIndex = 0; });
}

if (hits.length) {
  console.error(`✘ check-cdn-pins: ${hits.length} unversioned Farvist CDN URL(s) — use farvist@1 (or an exact version + SRI):`);
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log(`✔ check-cdn-pins: every Farvist CDN URL in ${files.length} tracked text files is version-pinned`);
