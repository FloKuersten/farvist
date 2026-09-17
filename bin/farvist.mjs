#!/usr/bin/env node
// =============================================================================
// Farvist CLI — `npx farvist check [paths…]`
// Validates markup against the classes Farvist actually ships (the manifest is
// generated from the compiled CSS, so it cannot drift from the release).
//
// Reports:
//   error    unknown-class      a Farvist-looking class that doesn't exist (+ "did you mean")
//   error    wrong-build        a class the page's build doesn't contain (e.g. AI kit on -slim)
//   error    cross-origin-icon  the icon sprite loaded from another origin (browsers block <use>)
//   warning  unpinned-cdn       a Farvist CDN URL without a version, or @latest
//   warning  missing-compat     farvist-ai on a Bootstrap page without farvist-ai-compat.css
//
// Not reported: classes defined in the file's <style> blocks, in stylesheets it
// links or imports by relative path, or in --css files; class names inside
// HTML comments and escaped code samples (&lt;div class="…"&gt;); framework
// bindings (:class, x-bind:class, ng-class, [class]) whose value is an expression.
// On farvist-ai.css pages only the kit's own class families are judged: the host
// framework owns the rest.
//
// Honest scope: class names and a few documented pitfalls. It does not judge
// visual design or accessibility. Zero dependencies; Node 18+.
// =============================================================================
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, extname, relative, dirname, resolve, basename } from 'node:path';

const MANIFEST_URL = new URL('../dist/farvist.classes.json', import.meta.url);
const EXTS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'coverage']);

// Common Tailwind idioms agents carry over, mapped to the Farvist equivalent.
const TAILWIND_HINTS = {
  flex: 'd-flex', grid: 'd-grid', hidden: 'd-none', block: 'd-block', 'inline-flex': 'd-inline-flex',
  'items-center': 'align-items-center', 'items-start': 'align-items-start', 'items-end': 'align-items-end',
  'justify-center': 'justify-content-center', 'justify-between': 'justify-content-between', 'justify-end': 'justify-content-end',
  'font-bold': 'fw-bold', 'font-semibold': 'fw-semibold', 'font-medium': 'fw-medium',
  'text-sm': 'fs-sm', 'text-lg': 'fs-lg', 'text-xl': 'fs-xl', 'w-full': 'w-100', 'h-full': 'h-100',
  'flex-col': 'flex-column', 'mx-auto': 'mx-auto',
};

function usage() {
  return `Usage: farvist check [paths…] [options]

Checks HTML/JSX/TSX/Vue/Svelte/Astro files for Farvist class mistakes.
Paths may be files or directories (default: current directory).

Options:
  --build full|slim|ai   Build to validate against when a file doesn't link one
                         (detected from farvist(-slim|-ai).css references otherwise)
  --css <file.css>       Also accept classes defined in this stylesheet (repeatable).
                         Stylesheets a file links or imports by relative path are
                         read automatically; use --css for bundled or global CSS.
  --ignore a,b           Ignore classes starting with these prefixes
  --samples              Also check escaped code samples (&lt;div class="…"&gt;)
  --json                 Machine-readable output
  -h, --help             Show this help
  -v, --version          Show the Farvist version the manifest was built from

Exit code: 1 if any error was found, 0 otherwise.`;
}

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv[0] === '-v' || argv[0] === '--version') {
  const m = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
  console.log(m.version);
  process.exit(0);
}
if (!argv.length || argv[0] === '-h' || argv[0] === '--help' || argv[0] !== 'check') {
  console.log(usage());
  process.exit(argv[0] === 'check' || !argv.length || argv[0] === '-h' || argv[0] === '--help' ? 0 : 1);
}
const opts = { build: null, css: [], ignore: [], json: false, samples: false, paths: [] };
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') opts.json = true;
  else if (a === '--samples') opts.samples = true;
  else if (a === '--build') opts.build = argv[++i];
  else if (a.startsWith('--build=')) opts.build = a.slice(8);
  else if (a === '--css') opts.css.push(argv[++i]);
  else if (a.startsWith('--css=')) opts.css.push(a.slice(6));
  else if (a === '--ignore') opts.ignore.push(...String(argv[++i] || '').split(',').filter(Boolean));
  else if (a.startsWith('--ignore=')) opts.ignore.push(...a.slice(9).split(',').filter(Boolean));
  else if (a === '-h' || a === '--help') { console.log(usage()); process.exit(0); }
  else if (a.startsWith('-')) { console.error(`farvist check: unknown option ${a}\n\n${usage()}`); process.exit(2); }
  else opts.paths.push(a);
}
if (opts.build && !['full', 'slim', 'ai'].includes(opts.build)) {
  console.error(`farvist check: --build must be full, slim or ai (got "${opts.build}")`);
  process.exit(2);
}
if (!opts.paths.length) opts.paths.push('.');

// ---- manifest ---------------------------------------------------------------
const manifest = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
const FULL = new Set(manifest.full);
const NOT_IN_SLIM = new Set(manifest.notInSlim);
const AI = new Set(manifest.ai);
const KNOWN_ANY = new Set([...FULL, ...AI]);
const root = (c) => c.split('-')[0];
const FULL_ROOTS = new Set(manifest.full.map(root));
// farvist-ai.css is added to a page that already has a framework (Bootstrap,
// Tailwind v3, its own CSS), and that host owns every class family it shares
// with the kit: btn-group, table-striped, toast-header, visually-hidden-focusable
// are Bootstrap's. So on the AI build only the kit's OWN families are judged —
// the ones the slim build leaves out — minus words hosts commonly use too.
const HOST_SHARED_ROOTS = new Set(['is', 'prose', 'status']);
const KIT_ROOTS = new Set(manifest.notInSlim.map(root).filter((r) => !HOST_SHARED_ROOTS.has(r)));

function inBuild(cls, build) {
  if (build === 'ai') return AI.has(cls);
  if (build === 'slim') return FULL.has(cls) && !NOT_IN_SLIM.has(cls);
  return FULL.has(cls);
}

// Same selector-only extraction the manifest uses (see scripts/lib/css-classes.mjs).
function classesFromCss(css) {
  const out = new Set();
  for (let k = 0, start = 0; k < css.length; k++) {
    const ch = css[k];
    if (ch === '{') { for (const m of css.slice(start, k).matchAll(/\.([a-zA-Z_][\w-]*)/g)) out.add(m[1]); start = k + 1; }
    else if (ch === '}' || ch === ';') start = k + 1;
  }
  return out;
}
const USER_CSS = new Set();
for (const f of opts.css) {
  try { for (const c of classesFromCss(readFileSync(f, 'utf8'))) USER_CSS.add(c); }
  catch (e) { console.error(`farvist check: cannot read --css ${f}: ${e.message}`); process.exit(2); }
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
function suggest(cls, build) {
  if (TAILWIND_HINTS[cls] && inBuild(TAILWIND_HINTS[cls], build)) return TAILWIND_HINTS[cls];
  const max = cls.length >= 12 ? 3 : 2;
  let best = null, bestD = max + 1;
  for (const k of (build === 'ai' ? AI : FULL)) {
    if (k[0] !== cls[0] || Math.abs(k.length - cls.length) > max) continue;
    const dist = levenshtein(cls, k);
    if (dist < bestD || (dist === bestD && best && k.length < best.length)) { best = k; bestD = dist; }
  }
  return bestD <= max ? best : null;
}

// ---- files ------------------------------------------------------------------
const skipped = []; // unreadable entries inside scanned folders (broken links, permissions)
const visited = new Set(); // real paths of folders already walked (symlink/junction loops)
function collect(p, acc, top = true) {
  let st;
  try { st = statSync(p); }
  catch (e) {
    if (top) { console.error(`farvist check: no such file or directory: ${p}`); process.exit(2); }
    skipped.push({ path: p, reason: e.code || e.message });
    return acc;
  }
  if (st.isDirectory()) {
    let real, entries;
    try { real = realpathSync(p); entries = readdirSync(p); }
    catch (e) { skipped.push({ path: p, reason: e.code || e.message }); return acc; }
    if (visited.has(real)) return acc;
    visited.add(real);
    for (const e of entries) {
      if (SKIP_DIRS.has(e) || e.startsWith('.')) continue;
      const child = join(p, e);
      let cst;
      try { cst = statSync(child); } catch (err) { skipped.push({ path: child, reason: err.code || err.message }); continue; }
      if (cst.isDirectory()) collect(child, acc, false);
      else if (EXTS.has(extname(e).toLowerCase())) acc.push(child);
    }
  } else acc.push(p);
  return acc;
}
const files = [...new Set(opts.paths.flatMap((p) => collect(p, [])))];

// Comments are blanked with spaces (newlines kept) so positions stay exact.
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripComments(text, ext) {
  let out = text.replace(/<!--[\s\S]*?-->/g, blank);
  if (['.jsx', '.tsx', '.vue', '.svelte', '.astro'].includes(ext)) out = out.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank);
  return out;
}

// Classes from stylesheets a file links or imports by RELATIVE path. Farvist's
// own builds are skipped, so linking a local farvist-slim.css still reports AI
// kit classes as wrong-build.
const sheetCache = new Map();
function linkedSheetClasses(text, file) {
  const out = new Set();
  const refs = [
    ...[...text.matchAll(/<link\b[^>]*>/gi)].filter((m) => /\brel\s*=\s*["']?stylesheet/i.test(m[0])).map((m) => (m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]),
    ...[...text.matchAll(/\bimport\s+(?:[\w{}\s,*]+\s+from\s+)?["']([^"']+\.css)["']/g)].map((m) => m[1]),
  ];
  for (const ref of refs) {
    if (!ref || /^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('/') || ref.startsWith('data:')) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean.endsWith('.css') || /^farvist/i.test(basename(clean))) continue;
    const abs = resolve(dirname(file), clean);
    if (!sheetCache.has(abs)) {
      let classes = null;
      try { if (statSync(abs).size <= 5e6) classes = classesFromCss(readFileSync(abs, 'utf8')); } catch { /* not on disk: nothing to learn */ }
      sheetCache.set(abs, classes);
    }
    for (const c of sheetCache.get(abs) || []) out.add(c);
  }
  return out;
}

function lineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

// ---- check ------------------------------------------------------------------
// Same pattern as scripts/check-cdn-pins.mjs.
const UNPINNED_CDN = /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com|cdn\.jsdelivr\.net\/gh\/flokuersten)\/farvist(?:@latest)?(?![\w.@-])/gi;
const report = [];
let errors = 0, warnings = 0, checkedClasses = 0, dynamicAttrs = 0;

for (const file of files) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); }
  catch (e) { skipped.push({ path: file, reason: e.code || e.message }); continue; }
  const text = stripComments(raw, extname(file).toLowerCase());
  const problems = [];
  const add = (severity, rule, index, message, extra = {}) => {
    problems.push({ ...lineCol(text, index), severity, rule, message, ...extra });
    if (severity === 'error') errors++; else warnings++;
  };

  // Which build does this file load?
  const linked = [...text.matchAll(/farvist(-slim|-ai)?(?:\.min)?\.css\b/g)].map((m) => (m[1] ? m[1].slice(1) : 'full'));
  const build = linked.includes('full') ? 'full' : linked.includes('slim') ? 'slim' : linked.includes('ai') ? 'ai' : (opts.build || 'full');
  const buildSource = linked.length ? 'linked' : opts.build ? '--build' : 'assumed';

  // Classes the file defines itself in <style> blocks are its own, not typos.
  // So are classes from the stylesheets it links or imports.
  const own = linkedSheetClasses(text, file);
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) for (const c of classesFromCss(m[1])) own.add(c);

  // A plain class/className attribute. The look-behind leaves out bindings whose
  // value is an expression, not a class list: :class, v-bind:class, x-bind:class,
  // ng-class, data-class, [class].
  const attrRe = /(?<![\w:.@[-])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`$]*)["'`]\s*\})/g;
  for (const m of text.matchAll(attrRe)) {
    // An escaped sample (&lt;div class="…"&gt; in a <pre>) shows markup, often a
    // deliberate "don't": only checked with --samples.
    if (!opts.samples && text.lastIndexOf('&lt;', m.index) > text.lastIndexOf('<', m.index)) continue;
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    const valueStart = m.index + m[0].indexOf(value);
    if (/\{\{|\$\{|<%|\{%/.test(value)) { dynamicAttrs++; continue; }
    for (const tm of value.matchAll(/\S+/g)) {
      const cls = tm[0];
      // Tailwind variants/arbitrary values, template syntax, and fragments of JS string
      // concatenation ('status status-' + state) can't be complete Farvist classes.
      if (/[:[\]/!{}()$#@'"`+<>=|&]/.test(cls) || cls.endsWith('-')) continue;
      if (own.has(cls) || USER_CSS.has(cls) || opts.ignore.some((p) => cls.startsWith(p))) continue;
      const pos = valueStart + tm.index;
      if (inBuild(cls, build)) { checkedClasses++; continue; }
      // On the AI add-on the host owns every family outside the kit's own
      // (Bootstrap's .d-flex, .btn-group, .table-striped are not mistakes), so
      // wrong-build never applies there: only typos in kit families are errors.
      if (build === 'ai' && !KIT_ROOTS.has(root(cls))) continue;
      if (build !== 'ai' && KNOWN_ANY.has(cls)) {
        checkedClasses++;
        const where = build === 'slim' ? 'the slim build (it has no AI-interface kit)' : `the ${build} build`;
        add('error', 'wrong-build', pos, `"${cls}" is not in ${where}`, { class: cls });
        continue;
      }
      if (build !== 'ai' && !FULL_ROOTS.has(root(cls)) && !TAILWIND_HINTS[cls]) continue; // not Farvist-looking: host or custom class
      checkedClasses++;
      const hint = suggest(cls, build);
      add('error', 'unknown-class', pos, `unknown Farvist class "${cls}"${hint ? ` — did you mean "${hint}"?` : ''}`, { class: cls, suggestion: hint });
    }
  }
  for (const m of text.matchAll(/\bclassName\s*=\s*\{(?!\s*["'`][^"'`$]*["'`]\s*\})/g)) { dynamicAttrs++; void m; }

  // Icon sprite on another origin: browsers refuse cross-origin <use>.
  for (const m of text.matchAll(/<use\b[^>]*\bhref\s*=\s*["']((?:https?:)?\/\/[^"'#]+)#[^"']*["']/gi)) {
    add('error', 'cross-origin-icon', m.index, `icon sprite loaded cross-origin (${m[1]}) — browsers block <use> across origins; serve farvist-icons.svg from your own site`);
  }
  // Unpinned CDN: no version, @latest, or the bare package URL (all follow the newest release).
  for (const m of text.matchAll(UNPINNED_CDN)) {
    add('warning', 'unpinned-cdn', m.index, `Farvist CDN URL ${/@latest/i.test(m[0]) ? 'pinned to @latest' : 'without a version'} — pin it (e.g. farvist@1) so a future major cannot break the page`);
  }
  // AI add-on on a Bootstrap page needs the compat file.
  if (build === 'ai' && /bootstrap(?:\.min)?\.css/i.test(text) && !/farvist-ai-compat(?:\.min)?\.css/.test(text)) {
    const at = text.search(/farvist-ai(?:\.min)?\.css/);
    add('warning', 'missing-compat', Math.max(0, at), 'farvist-ai on a Bootstrap page: also load farvist-ai-compat.css after Bootstrap (its un-layered .btn overrides the kit\'s buttons)');
  }

  report.push({ file: relative(process.cwd(), file) || file, build, buildSource, problems });
}

// ---- output -----------------------------------------------------------------
if (opts.json) {
  console.log(JSON.stringify({ version: manifest.version, summary: { files: report.length, checkedClasses, errors, warnings, dynamicAttrs, skipped: skipped.length }, files: report, skipped }, null, 2));
} else {
  for (const r of report) {
    if (!r.problems.length) continue;
    console.log(`\n${r.file}  (build: ${r.build}${r.buildSource === 'linked' ? '' : `, ${r.buildSource}`})`);
    for (const p of r.problems.sort((a, b) => a.line - b.line || a.col - b.col)) {
      console.log(`  ${String(p.line).padStart(4)}:${String(p.col).padEnd(4)} ${p.severity.padEnd(7)} ${p.message}  [${p.rule}]`);
    }
  }
  const summary = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} — ${checkedClasses} Farvist class use${checkedClasses === 1 ? '' : 's'} checked in ${report.length} file${report.length === 1 ? '' : 's'} (Farvist ${manifest.version})`;
  const dyn = dynamicAttrs ? `\n  note: ${dynamicAttrs} dynamic class expression${dynamicAttrs === 1 ? '' : 's'} not checked` : '';
  const skip = skipped.length ? `\n  note: ${skipped.length} unreadable path${skipped.length === 1 ? '' : 's'} skipped: ${skipped.slice(0, 3).map((x) => `${relative(process.cwd(), x.path) || x.path} (${x.reason})`).join(', ')}${skipped.length > 3 ? ', …' : ''}` : '';
  console.log(`\n${errors ? '✖' : '✔'} ${summary}${dyn}${skip}`);
}
process.exit(errors ? 1 : 0);
