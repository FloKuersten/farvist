// =============================================================================
// Farvist · scripts/set-adsense.mjs
// One-command AdSense activation. Run once with the publisher ID:
//   node scripts/set-adsense.mjs ca-pub-1234567890123456
// Then deploy (npm run deploy). It:
//   1. adds the AdSense (Auto ads) script to the monetized pages only
//      (docs + blocks/portfolio/saas — homepage, pro, 404, app demos stay clean)
//   2. writes ads.txt for the account
//   3. adds ads.txt to the deploy.ps1 upload list
// Idempotent — re-running with the same ID changes nothing.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2] || '';
const id = raw.startsWith('pub-') ? 'ca-' + raw : raw;

if (!/^ca-pub-\d{16}$/.test(id)) {
  console.error('Usage: node scripts/set-adsense.mjs ca-pub-<16 digits>   (got: ' + (raw || 'nothing') + ')');
  process.exit(1);
}

const MONETIZED = ['docs/index.html', 'examples/blocks.html', 'examples/portfolio.html', 'examples/saas.html'];
const SNIPPET = `  <!-- Google AdSense (Auto ads — this page only) -->\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${id}" crossorigin="anonymous"></script>\n</head>`;

for (const rel of MONETIZED) {
  const file = join(root, rel);
  let s = readFileSync(file, 'utf8');
  if (s.includes('adsbygoogle.js')) { console.log(rel + ': already wired — skipped'); continue; }
  if (!s.includes('</head>')) { console.error(rel + ': no </head> found'); process.exit(1); }
  writeFileSync(file, s.replace('</head>', SNIPPET));
  console.log(rel + ': AdSense script added');
}

// ads.txt — authorizes Google to sell this site's inventory.
writeFileSync(join(root, 'ads.txt'), `google.com, ${id.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
console.log('ads.txt written');

// Ship ads.txt with the site.
const deployPath = join(root, 'deploy.ps1');
let deploy = readFileSync(deployPath, 'utf8');
if (!deploy.includes(' ads.txt ')) {
  deploy = deploy.replace(' robots.txt ', ' robots.txt ads.txt ');
  writeFileSync(deployPath, deploy);
  console.log('deploy.ps1: ads.txt added to upload list');
}

console.log('\nDone. Next: npm run deploy — then finish site review in the AdSense dashboard.');
