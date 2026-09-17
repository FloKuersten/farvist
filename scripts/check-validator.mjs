// =============================================================================
// Farvist · scripts/check-validator.mjs
// Tests `npx farvist check` (bin/farvist.mjs) three ways:
//   1. Deliberate mistakes in scripts/fixtures/validator/ must produce EXACTLY
//      the expected problems at the expected line:col — no more (false
//      positives), no fewer (misses) — in both --json and text output, and
//      every fixture file (including subfolders) must actually be scanned.
//   2. A broken symlink and a symlink loop are skipped, not a crash.
//   3. Farvist's own site must validate with zero errors (code samples too), and
//      the file count must match an independent walk, so the checker and the
//      shipped pages keep agreeing.
//
// Run: node scripts/check-validator.mjs
// =============================================================================
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/farvist.mjs');
const FIXTURES = 'scripts/fixtures/validator';

function cli(args) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [bin, 'check', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    if (e.status == null) throw e;
    return { code: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}
function run(args) {
  const r = cli([...args, '--json']);
  try { return { code: r.code, out: JSON.parse(r.stdout) }; }
  catch { throw new Error(`farvist check ${args.join(' ')} printed no JSON (exit ${r.code}):\n${r.stdout}${r.stderr || ''}`); }
}

// fixture path -> sorted "rule:class@line:col" (class '' for non-class rules)
const EXPECTED = {
  'full-mistakes.html': [
    'unpinned-cdn:@3:38', 'unknown-class:btn-gradient-primay@6:22', 'unknown-class:flex@7:15',
    'unknown-class:items-center@7:20', 'unknown-class:font-bold@7:33', 'cross-origin-icon:@9:21',
  ],
  'slim-with-ai.html': ['wrong-build:chat@2:13', 'wrong-build:message@2:31', 'wrong-build:message-bubble@2:52'],
  // Bootstrap's btn-group, table-striped, is-invalid, toast-header, … are the host's.
  'ai-on-bootstrap.html': ['missing-compat:@2:74', 'unknown-class:message-bubbel@4:34', 'unknown-class:prompt-feild@13:38'],
  'component.tsx': ['unknown-class:btn-glas@5:28'],
  // :class / v-bind:class / x-bind:class / ng-class / [class] and comments are not class lists.
  'bindings.vue': ['unknown-class:card-bdy@8:33'],
  // @latest, bare package URLs and an unversioned gh/ URL; @1 and @1.8.1 pass; escaped sample unchecked.
  'cdn-pins.html': ['unpinned-cdn:@3:38', 'unpinned-cdn:@4:22', 'unpinned-cdn:@5:38', 'unpinned-cdn:@6:38', 'unpinned-cdn:@7:38'],
  // Classes from a linked (?v=2) or imported project stylesheet are the project's.
  'project/components/page.html': ['unknown-class:btn-primry@4:20'],
  'project/components/Widget.jsx': ['unknown-class:badge-sof-primary@5:41'],
};
const SUGGESTIONS = {
  'btn-gradient-primay': 'btn-gradient-primary', flex: 'd-flex', 'items-center': 'align-items-center',
  'font-bold': 'fw-bold', 'message-bubbel': 'message-bubble', 'btn-glas': 'btn-glass', 'prompt-feild': 'prompt-field',
  'card-bdy': 'card-body', 'btn-primry': 'btn-primary', 'badge-sof-primary': 'badge-soft-primary',
};
const want = Object.values(EXPECTED).flat();
const wantErrors = want.filter((p) => !/^(unpinned-cdn|missing-compat):/.test(p)).length;

const failures = [];

// ---- 1. fixtures, JSON ----------------------------------------------------------
let fx;
try { fx = run([FIXTURES]); }
catch (e) { console.error(`✘ check-validator: ${e.message}`); process.exit(1); }
if (fx.code !== 1) failures.push(`fixtures: expected exit code 1, got ${fx.code}`);
const scanned = fx.out.files.map((f) => relative(join(root, FIXTURES), join(root, f.file)).split('\\').join('/')).sort();
const expectedFiles = Object.keys(EXPECTED).sort();
if (JSON.stringify(scanned) !== JSON.stringify(expectedFiles)) {
  failures.push(`fixtures: scanned files differ\n      expected ${JSON.stringify(expectedFiles)}\n      got      ${JSON.stringify(scanned)}`);
}
let gotTotal = 0;
for (const f of fx.out.files) {
  const name = relative(join(root, FIXTURES), join(root, f.file)).split('\\').join('/');
  const got = f.problems.map((p) => `${p.rule}:${p.class || ''}@${p.line}:${p.col}`).sort();
  gotTotal += got.length;
  const exp = (EXPECTED[name] || []).slice().sort();
  if (JSON.stringify(got) !== JSON.stringify(exp)) {
    failures.push(`${name}\n      expected ${JSON.stringify(exp)}\n      got      ${JSON.stringify(got)}`);
  }
  for (const p of f.problems) {
    if (p.class && SUGGESTIONS[p.class] && p.suggestion !== SUGGESTIONS[p.class]) {
      failures.push(`${name}: suggestion for "${p.class}" should be "${SUGGESTIONS[p.class]}", got "${p.suggestion}"`);
    }
  }
}
const s = fx.out.summary;
if (gotTotal !== want.length || s.errors + s.warnings !== want.length || s.errors !== wantErrors) {
  failures.push(`fixtures: expected ${want.length} problems (${wantErrors} errors), got ${gotTotal} listed, summary ${s.errors} errors + ${s.warnings} warnings`);
}
if (s.dynamicAttrs !== 1) failures.push(`fixtures: expected 1 unchecked dynamic expression, got ${s.dynamicAttrs}`);

// ---- 1b. fixtures, text output --------------------------------------------------
const text = cli([FIXTURES]);
if (text.code !== 1) failures.push(`text output: expected exit code 1, got ${text.code}`);
// one block per file: a header line naming the file, then its problems
const blocks = new Map(text.stdout.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
  const [head, ...rest] = b.split('\n');
  return [head.split('  (')[0].split('\\').join('/'), rest.join('\n')];
}));
for (const [name, problems] of Object.entries(EXPECTED)) {
  const body = blocks.get(`${FIXTURES}/${name}`);
  if (body == null) { failures.push(`text output has no block for ${name}`); continue; }
  const lines = body.split('\n').length;
  if (lines !== problems.length) failures.push(`text output for ${name}: ${lines} problem lines, expected ${problems.length}`);
  for (const p of problems) {
    const [head, loc] = p.split('@');
    const [line, col] = loc.split(':');
    const cls = head.split(':')[1];
    const rule = head.split(':')[0];
    const re = new RegExp(`^\\s+${line}:${col}\\s.*${cls ? `"${cls}"` : ''}.*\\[${rule}\\]$`, 'm');
    if (!re.test(body)) failures.push(`text output for ${name} is missing ${p}`);
  }
}
if (!text.stdout.includes(`✖ ${wantErrors} errors, ${want.length - wantErrors} warnings`)) failures.push(`text output summary line wrong:\n${text.stdout.trim().split('\n').slice(-2).join('\n')}`);

// ---- 2. broken symlink + symlink loop ---------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'farvist-check-'));
let linkNote = '';
try {
  mkdirSync(join(tmp, 'sub'));
  writeFileSync(join(tmp, 'sub', 'a.html'), '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/farvist@1/dist/farvist.min.css">\n<div class="card-bdy"></div>\n');
  mkdirSync(join(tmp, 'gone'));
  symlinkSync(join(tmp, 'gone'), join(tmp, 'broken'), 'junction');
  rmSync(join(tmp, 'gone'), { recursive: true });
  symlinkSync(tmp, join(tmp, 'sub', 'loop'), 'junction');
  const r = run([tmp]);
  if (r.code !== 1) failures.push(`symlinks: expected exit 1 (one typo), got ${r.code}`);
  if (r.out.summary.errors !== 1 || r.out.summary.files !== 1) failures.push(`symlinks: expected 1 error in 1 file, got ${r.out.summary.errors} in ${r.out.summary.files}`);
  if (!(r.out.summary.skipped >= 1)) failures.push(`symlinks: the broken link should be reported as skipped (got ${r.out.summary.skipped})`);
  linkNote = `; broken + looping symlinks skipped (${r.out.summary.skipped})`;
} catch (e) {
  failures.push(`symlinks: ${e.message.split('\n')[0]}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ---- 3. the site ------------------------------------------------------------------
const SITE = ['index.html', '404.html', 'marketing.html', 'docs', 'blog', 'examples', 'templates', 'themer', 'pro', 'about', 'contact', 'privacy', 'terms'];
const EXTS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).filter((e) => !e.startsWith('.') && e !== 'node_modules').flatMap((e) => walk(join(p, e))) : EXTS.has(extname(p)) ? [p] : []);
const siteFiles = SITE.flatMap((p) => walk(join(root, p))).length;
let site = { out: { summary: {}, files: [] } };
try { site = run([...SITE, '--samples']); } catch (e) { failures.push(`site: ${e.message.split('\n')[0]}`); }
const siteErrors = site.out.files.flatMap((f) => f.problems.filter((p) => p.severity === 'error').map((p) => `${f.file}:${p.line}:${p.col} ${p.message}`));
if (siteErrors.length) failures.push(`site markup has ${siteErrors.length} error(s):\n      ${siteErrors.join('\n      ')}`);
if (site.out.summary.files !== siteFiles) failures.push(`site: the checker scanned ${site.out.summary.files} files, an independent walk finds ${siteFiles}`);
if (site.out.summary.skipped) failures.push(`site: ${site.out.summary.skipped} path(s) skipped as unreadable`);

if (failures.length) {
  console.error(`✘ check-validator: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✔ check-validator: ${scanned.length} fixture files give exactly ${s.errors} errors + ${s.warnings} warnings at the expected line:col (JSON and text)${linkNote}; site markup clean (${site.out.summary.checkedClasses} class uses in ${site.out.summary.files} files, code samples included)`);
