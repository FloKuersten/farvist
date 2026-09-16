// =============================================================================
// Farvist · scripts/check-validator.mjs
// Tests `npx farvist check` (bin/farvist.mjs) both ways:
//   1. Deliberate mistakes in scripts/fixtures/validator/ must produce EXACTLY
//      the expected problems — no more (false positives), no fewer (misses).
//   2. Farvist's own site must validate with zero errors, so the checker and
//      the shipped templates keep agreeing.
//
// Run: node scripts/check-validator.mjs
// =============================================================================
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/farvist.mjs');

function run(args) {
  try {
    return { code: 0, out: JSON.parse(execFileSync(process.execPath, [bin, 'check', ...args, '--json'], { cwd: root, encoding: 'utf8' })) };
  } catch (e) {
    if (e.status == null || !e.stdout) throw e;
    return { code: e.status, out: JSON.parse(e.stdout) };
  }
}

// file -> sorted "rule:class" (class '' for non-class rules)
const EXPECTED = {
  'full-mistakes.html': [
    'cross-origin-icon:', 'unknown-class:btn-gradient-primay', 'unknown-class:flex',
    'unknown-class:font-bold', 'unknown-class:items-center', 'unpinned-cdn:',
  ],
  'slim-with-ai.html': ['wrong-build:chat', 'wrong-build:message', 'wrong-build:message-bubble'],
  'ai-on-bootstrap.html': ['missing-compat:', 'unknown-class:message-bubbel'],
  'component.tsx': ['unknown-class:btn-glas'],
};
const SUGGESTIONS = {
  'btn-gradient-primay': 'btn-gradient-primary', flex: 'd-flex', 'items-center': 'align-items-center',
  'font-bold': 'fw-bold', 'message-bubbel': 'message-bubble', 'btn-glas': 'btn-glass',
};

const failures = [];
const fx = run(['scripts/fixtures/validator']);
if (fx.code !== 1) failures.push(`fixtures: expected exit code 1, got ${fx.code}`);
for (const f of fx.out.files) {
  const name = f.file.split(/[\\/]/).pop();
  const got = f.problems.map((p) => `${p.rule}:${p.class || ''}`).sort();
  const want = (EXPECTED[name] || []).slice().sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${name}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);
  }
  for (const p of f.problems) {
    if (p.class && SUGGESTIONS[p.class] && p.suggestion !== SUGGESTIONS[p.class]) {
      failures.push(`${name}: suggestion for "${p.class}" should be "${SUGGESTIONS[p.class]}", got "${p.suggestion}"`);
    }
  }
}
if (fx.out.summary.dynamicAttrs !== 1) failures.push(`fixtures: expected 1 unchecked dynamic expression, got ${fx.out.summary.dynamicAttrs}`);

const SITE = ['index.html', 'docs', 'blog', 'examples', 'templates', 'themer', 'pro', 'about', 'contact', 'privacy', 'terms'];
const site = run(SITE);
const siteErrors = site.out.files.flatMap((f) => f.problems.filter((p) => p.severity === 'error').map((p) => `${f.file}:${p.line} ${p.message}`));
if (siteErrors.length) failures.push(`site markup has ${siteErrors.length} error(s):\n      ${siteErrors.join('\n      ')}`);

if (failures.length) {
  console.error(`✘ check-validator: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✔ check-validator: fixtures produce exactly the expected ${Object.values(EXPECTED).flat().length} problems; site markup clean (${site.out.summary.checkedClasses} class uses in ${site.out.summary.files} files)`);
