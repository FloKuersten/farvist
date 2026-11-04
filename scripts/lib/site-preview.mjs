// Serve a startup snapshot of tracked public assets, never the checkout itself.
// Keep the allowlist aligned with scripts/deploy/website.py. Requests only look
// up bytes already in memory; they cannot turn a URL into a filesystem read.
import { execFileSync } from 'node:child_process';
import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = new Set(['index.html', 'marketing.html', '404.html', 'robots.txt', 'ads.txt', 'sitemap.xml',
  'llms.txt', 'llms-full.txt', 'ai-context.json', 'farvist.cursorrules', 'dist', 'assets',
  'examples', 'docs', 'pro', 'privacy', 'blog', 'themer', 'templates', 'about',
  'contact', 'terms', 'ai', '.well-known']);
const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.mdc': 'text/plain; charset=utf-8',
  '.cursorrules': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
  '.webmanifest': 'application/manifest+json',
}));
const PRIVATE_SUFFIX = /\.(?:php\d*|phtml|phar|py|pyc|sh|ps1|cgi|pl|rb|asp|aspx|jsp|env|ini|conf|config|sql|sqlite\d*|db|bak|backup|old|orig|save|swp|swo|key|pem|p12|pfx|map)(?:[./]|$)/i;
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function snapshotSite(repo = repositoryRoot) {
  const root = realpathSync(repo);
  const entries = execFileSync('git', ['-C', root, 'ls-files', '--stage', '-z', '--', ...ROOTS], { encoding: 'utf8' });
  const files = new Map();
  let total = 0;
  for (const entry of entries.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) [a-f0-9]+ 0\t(.+)$/.exec(entry);
    if (!match) continue; // No symlinks, merge stages, or non-file Git modes.
    const name = match[2];
    const parts = name.split('/');
    const type = TYPES.get(extname(name).toLowerCase());
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || !ROOTS.has(parts[0]) || !type || PRIVATE_SUFFIX.test(name)
      || parts.some((part) => !part || part === '.' || part === '..')
      || parts.slice(1).some((part) => part.startsWith('.'))) continue;
    const expectedPath = join(root, name);
    const path = realpathSync(expectedPath);
    const fromRoot = relative(root, path);
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error(`Public asset escapes repository: ${name}`);
    const canonical = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (canonical(path) !== canonical(expectedPath)) throw new Error(`Public asset is a symlink alias: ${name}`);
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 5_000_000) throw new Error(`Invalid public asset: ${name}`);
      const body = readFileSync(fd);
      total += body.length;
      if (total > 50_000_000) throw new Error('Public preview exceeds 50 MB');
      files.set('/' + name, { type, body });
    } finally { closeSync(fd); }
  }
  if (!files.has('/index.html')) throw new Error('Tracked homepage missing from public preview');
  return files;
}

export async function startPreview({ files = snapshotSite(), port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  let origin;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const allowedHosts = new Set([new URL(origin).host, `localhost:${server.address().port}`]);
    if (!allowedHosts.has(request.headers.host)) { response.writeHead(400).end(); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let url;
    try { url = new URL(request.url, origin); }
    catch { response.writeHead(400).end(); return; }
    if (url.origin !== origin) { response.writeHead(400).end(); return; }
    const pathname = url.pathname;
    const file = files.get(pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!file && files.has(pathname + '/index.html')) {
      response.writeHead(308, { Location: pathname + '/' + url.search }).end();
      return;
    }
    if (!file) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
    response.end(request.method === 'HEAD' ? undefined : file.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  return {
    origin,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }),
  };
}
