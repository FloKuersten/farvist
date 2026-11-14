// Export the maintained demos as portable, single-file HTML starters.
// No dependencies or network access: run after the CSS build so SRI hashes match
// the exact bytes published by the release. Do not hand-edit templates/starters/.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteOrigin = 'https://farvist.com';
export const templateNames = Object.freeze([
  'dashboard', 'saas', 'portfolio', 'auth', 'ai-console',
  'trading-bot', 'ai-cluster', 'blocks', 'ai-addon',
]);

const normalizeLines = (text) => text.replace(/\r\n?/g, '\n');
const assetPath = /^\/(?:dist\/farvist(?:-ai-compat|-ai|-slim)?(?:\.min)?\.css|assets\/(?:farvist\.js|favicon\.svg|favicon-32\.png|apple-touch-icon\.png))$/;
const documentTag = /<[a-z][\w:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const urlAttribute = /(\s(?:href|src|data-fv-command)\s*=\s*)(["'])(.*?)\2/gi;

function inlineSprite(source) {
  const sprite = normalizeLines(source).replace(/<!--[\s\S]*?-->/g, '').match(/<svg\b[\s\S]*<\/svg>/)?.[0];
  assert.ok(sprite, 'Icon source must contain an SVG sprite');
  return sprite.replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;overflow:hidden">')
    .replace(/[\t ]+$/gm, '');
}

function absoluteSiteLink(url) {
  // Keep same-page anchors and named command actions local. They drive the demos.
  url.pathname = url.pathname.replace(/\/index\.html$/, '/');
  return url.href;
}

export function renderTemplate(name, { root = repositoryRoot, version, sprite, license } = {}) {
  assert.ok(templateNames.includes(name), `Unknown template: ${name}`);
  version ??= JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'An exact package version is required');
  sprite ??= readFileSync(join(root, 'assets/icons/farvist-icons.svg'), 'utf8');
  license ??= readFileSync(join(root, 'LICENSE'), 'utf8');
  const base = `${siteOrigin}/examples/${name}.html`;
  const cdn = `https://cdn.jsdelivr.net/npm/farvist@${version}`;
  const dependencies = new Set();
  let html = normalizeLines(readFileSync(join(root, 'examples', `${name}.html`), 'utf8'));

  // This replacement also covers dynamically constructed SVGs in inline JS,
  // notably the trading demo's "flatten positions" empty state.
  html = html.replace(/(?:\.\.\/|\/)?assets\/icons\/farvist-icons\.svg#(i-[\w-]+)/g, '#$1');

  // Inline scripts are otherwise kept byte-for-byte (apart from line endings).
  // Shield them while rewriting actual HTML attributes, not JS string literals
  // or the escaped source-code examples displayed in the AI demo.
  const scripts = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attributes, body) => {
    const source = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (source) {
      if (/(?:^|\/)notify\.js(?:[?#]|$)|googletagmanager|google-analytics|cloudflareinsights/i.test(source)) return '';
      const url = new URL(source, base);
      assert.equal(url.origin, siteOrigin, `Unexpected external script in ${name}: ${source}`);
      assert.equal(url.pathname, '/assets/farvist.js', `Unsupported script dependency in ${name}: ${source}`);
      return tag;
    }
    assert.ok(!/(?:fetch\s*\(|sendBeacon\s*\(|new\s+(?:WebSocket|EventSource)\b)/.test(body), `${name}: review network behavior before exporting an inline script`);
    scripts.push(tag);
    return `\u0000FARVIST_INLINE_${scripts.length - 1}\u0000`;
  });

  html = html.replace(documentTag, (tag) => {
    let integrity;
    const result = tag.replace(urlAttribute, (attribute, prefix, quote, value) => {
      if (!value || value.startsWith('#') || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return attribute;
      if (/data-fv-command/i.test(prefix) && !/^(?:\/|\.\.?\/)/.test(value)) return attribute;
      const url = new URL(value, base);
      if (assetPath.test(url.pathname)) {
        // Ship the minified equivalent while retaining the AI-only build.
        const path = url.pathname.replace(/(farvist(?:-ai|-slim)?)\.css$/, '$1.min.css');
        const bytes = readFileSync(join(root, path.slice(1)));
        dependencies.add(path.slice(1));
        if (path.endsWith('.css') || path.endsWith('.js')) {
          integrity = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
        }
        return `${prefix}${quote}${cdn}${path}${quote}`;
      }
      assert.ok(!/^\/(?:assets|dist)\//.test(url.pathname), `${name}: unsupported local asset ${value}`);
      return `${prefix}${quote}${absoluteSiteLink(url)}${quote}`;
    });
    if (!integrity) return result;
    return result.replace(/\s+(?:integrity|crossorigin)\s*=\s*(["']).*?\1/gi, '')
      .replace(/\s*\/?>(?=$)/, (ending) => ` integrity="${integrity}" crossorigin="anonymous"${ending}`);
  });

  html = html.replace(/\u0000FARVIST_INLINE_(\d+)\u0000/g, (_, index) => scripts[Number(index)]);
  // The add-on has a CSS comment naming its original repository dependency.
  html = html.replace(/\.\.\/dist\/(farvist(?:-ai|-slim)?\.css)/g,
    (_, file) => `${cdn}/dist/${file.replace(/\.css$/, '.min.css')}`);
  assert.ok(!/(?:\.\.\/|\/)?assets\/icons\/farvist-icons\.svg|\.\.\/(?:assets|dist)\//.test(html), `${name}: unresolved repository asset path`);
  assert.ok(!/<base\b/i.test(html), `${name}: a base element would break local anchors and the inline sprite`);

  const symbols = new Set([...sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/<use\b[^>]*\bhref=["']#([^"']+)["']/g)) {
    assert.ok(symbols.has(match[1]), `${name}: missing icon ${match[1]}`);
  }

  const comment = `<!--
Farvist ${version} - ${name} starter
Farvist starter: ${name}
Source: ${base}
Edit this HTML file to build your own interface. No repository checkout needed.
Online dependencies: exact-version Farvist CSS/JavaScript and favicons from
jsDelivr; Google Fonts where linked below. Internet access is required for those
resources. Icons are embedded and work when this file is opened directly.
Demo only: sample data, forms, authentication, chat replies, payments and trading
controls are UI demonstrations; no backend, accounts, AI service or live trades
are connected. Replace placeholders and connect your own application behavior.
No notification subscription or analytics scripts are included.
CSS/JavaScript integrity hashes match the release build; update both the pinned
version and integrity values together when upgrading those dependencies.

${normalizeLines(license).trim()}
-->`;
  html = html.replace(/<!doctype html>/i, (doctype) => `${doctype}\n${comment}`);
  assert.ok(html.includes(comment), `${name}: missing HTML doctype`);
  const bodyPattern = /<body\b[^>]*>/i;
  assert.ok(bodyPattern.test(html), `${name}: missing body`);
  html = html.replace(bodyPattern, (body) => `${body}\n  <!-- Embedded icon sprite; keep this with any copied icon markup. -->\n${inlineSprite(sprite)}`);
  return { name, html: html.trimEnd() + '\n', dependencies: [...dependencies] };
}

export function generateTemplates({ root = repositoryRoot } = {}) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const sprite = readFileSync(join(root, 'assets/icons/farvist-icons.svg'), 'utf8');
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  // Render everything before writing, so invalid inputs do not partly refresh
  // the committed starter collection.
  const templates = templateNames.map((name) => renderTemplate(name, { root, version, sprite, license }));
  const output = join(root, 'templates/starters');
  mkdirSync(output, { recursive: true });
  for (const template of templates) {
    const file = join(output, `${template.name}.html`);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== template.html) writeFileSync(file, template.html);
  }
  return templates;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const templates = generateTemplates();
  console.log(`gen-templates: ${templates.length} standalone HTML starters -> templates/starters/ (exact-version CDN dependencies, SRI, embedded icons)`);
}
