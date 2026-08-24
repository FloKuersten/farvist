// =============================================================================
// Farvist · scripts/check-privacy-claims.mjs
// The privacy page makes a factual claim about this site: "no accounts, forms or
// logins". That claim is checkable, and it is exactly the kind of thing a reader
// verifies during a launch — so verify it in CI instead of trusting memory.
//
// Fails if a live email-capture form ships while the privacy page still claims
// there are none, and fails the other way too (disclosure describing a form that
// no longer exists). Run: node scripts/check-privacy-claims.mjs
// =============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.claude', 'dist']);

const html = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    if (SKIP.has(name)) continue;
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.html')) html.push(p);
  }
})(root);

// A form counts as LIVE only if the page carries it AND notify.js has an endpoint.
const notifyJs = readFileSync(join(root, 'assets/notify.js'), 'utf8');
const endpointMatch = notifyJs.match(/var ENDPOINT\s*=\s*'([^']*)'/);
const endpointSet = !!(endpointMatch && endpointMatch[1].trim());

const pagesWithForm = html
  .filter((f) => /class="[^"]*\bfv-notify\b/.test(readFileSync(f, 'utf8')))
  .map((f) => relative(root, f).split('\\').join('/'));

const privacyPath = join(root, 'privacy/index.html');
const privacy = readFileSync(privacyPath, 'utf8');
const CLAIM_NO_FORMS = /no accounts, forms or logins/i.test(privacy);
const DISCLOSES_FORM = /email[^.<]{0,80}(notify|mailing list|when it ships|subscrib)/i.test(privacy);

const failures = [];

if (endpointSet && pagesWithForm.length && CLAIM_NO_FORMS) {
  failures.push(
    'privacy/index.html still says "no accounts, forms or logins", but a live email form ships on: '
    + pagesWithForm.join(', ')
    + '\n    Remove that clause and disclose the form. Suggested wording:\n'
    + '      "The one exception is the optional notify form: if you choose to submit your\n'
    + '       email address, we store it solely to send you a single message when the thing\n'
    + '       you asked about ships. It is never sold, shared, or used for anything else, and\n'
    + '       you can ask us to delete it at any time at the address below."');
}

if (endpointSet && pagesWithForm.length && !DISCLOSES_FORM) {
  failures.push('a live email form ships but privacy/index.html does not describe what happens to the address.');
}

if (!pagesWithForm.length && DISCLOSES_FORM && !CLAIM_NO_FORMS) {
  failures.push('privacy/index.html describes an email form, but no page carries one — stale disclosure.');
}

if (failures.length) {
  console.error(`✘ check-privacy-claims: ${failures.length} problem(s):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

const state = endpointSet
  ? `form ENABLED on ${pagesWithForm.length} page(s), privacy page discloses it`
  : `notify form disabled (no endpoint) — privacy page's "no forms" claim holds`;
console.log(`✔ check-privacy-claims: ${state}`);
