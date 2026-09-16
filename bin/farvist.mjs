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
//   warning  unpinned-cdn       a Farvist CDN URL without a version
//   warning  missing-compat     farvist-ai on a Bootstrap page without farvist-ai-compat.css
//
// Honest scope: class names and a few documented pitfalls. It does not judge
// visual design or accessibility. Zero dependencies; Node 18+.
// =============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

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
  --css <file.css>       Also accept classes defined in your own stylesheet (repeatable)
  --ignore a,b           Ignore classes starting with these prefixes
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
const opts = { build: null, css: [], ignore: [], json: false, paths: [] };
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') opts.json = true;
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
// In the AI add-on build the host page brings its own framework, so only the
// kit's own class families are Farvist's to judge.
const AI_ROOTS = new Set(manifest.ai.map(root));

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
function collect(p, acc) {
  let st;
  try { st = statSync(p); } catch { console.error(`farvist check: no such file or directory: ${p}`); process.exit(2); }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (SKIP_DIRS.has(e) || e.startsWith('.')) continue;
      const child = join(p, e);
      const cst = statSync(child);
      if (cst.isDirectory()) collect(child, acc);
      else if (EXTS.has(extname(e).toLowerCase())) acc.push(child);
    }
  } else acc.push(p);
  return acc;
}
const files = [...new Set(opts.paths.flatMap((p) => collect(p, [])))];

function lineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

// ---- check ------------------------------------------------------------------
const report = [];
let errors = 0, warnings = 0, checkedClasses = 0, dynamicAttrs = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
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
  const own = new Set();
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) for (const c of classesFromCss(m[1])) own.add(c);

  const attrRe = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`$]*)["'`]\s*\})/g;
  for (const m of text.matchAll(attrRe)) {
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
      // On the AI add-on the HOST owns every other class family: Bootstrap's own
      // .d-flex or .card also exist in Farvist's full build, and are not mistakes.
      if (build === 'ai' && !AI_ROOTS.has(root(cls))) continue;
      if (KNOWN_ANY.has(cls)) {
        checkedClasses++;
        const where = build === 'slim' ? 'the slim build (it has no AI-interface kit)' : build === 'ai' ? 'farvist-ai.css (the AI kit only — no utilities or general components)' : `the ${build} build`;
        add('error', 'wrong-build', pos, `"${cls}" is not in ${where}`, { class: cls });
        continue;
      }
      const roots = build === 'ai' ? AI_ROOTS : FULL_ROOTS;
      if (!roots.has(root(cls)) && !TAILWIND_HINTS[cls]) continue; // not Farvist-looking: host or custom class
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
  // Unpinned CDN.
  for (const m of text.matchAll(/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/farvist\/(?!@)/g)) {
    add('warning', 'unpinned-cdn', m.index, 'Farvist CDN URL without a version — pin it (e.g. farvist@1) so a future major cannot break the page');
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
  console.log(JSON.stringify({ version: manifest.version, summary: { files: files.length, checkedClasses, errors, warnings, dynamicAttrs }, files: report }, null, 2));
} else {
  for (const r of report) {
    if (!r.problems.length) continue;
    console.log(`\n${r.file}  (build: ${r.build}${r.buildSource === 'linked' ? '' : `, ${r.buildSource}`})`);
    for (const p of r.problems.sort((a, b) => a.line - b.line || a.col - b.col)) {
      console.log(`  ${String(p.line).padStart(4)}:${String(p.col).padEnd(4)} ${p.severity.padEnd(7)} ${p.message}  [${p.rule}]`);
    }
  }
  const summary = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} — ${checkedClasses} Farvist class use${checkedClasses === 1 ? '' : 's'} checked in ${files.length} file${files.length === 1 ? '' : 's'} (Farvist ${manifest.version})`;
  const dyn = dynamicAttrs ? `\n  note: ${dynamicAttrs} dynamic class expression${dynamicAttrs === 1 ? '' : 's'} not checked` : '';
  console.log(`\n${errors ? '✖' : '✔'} ${summary}${dyn}`);
}
process.exit(errors ? 1 : 0);
