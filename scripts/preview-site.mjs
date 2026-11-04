import { startPreview } from './lib/site-preview.mjs';

const site = await startPreview({ port: Number(process.argv[2] || 4000) });
console.log(`Farvist public preview: ${site.origin} (tracked files only; restart to refresh)`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await site.close(); process.exit(0); });
}
