// Bundle-size budget gate for CI. Fails if any minified build exceeds its budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BUDGETS = [
  { file: 'dist/farvist.min.css', kb: 22 },
  { file: 'dist/farvist-slim.min.css', kb: 20 },
  { file: 'dist/farvist-ai.min.css', kb: 7 },
  { file: 'dist/farvist-ai-compat.css', kb: 2 },
];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;
for (const { file, kb } of BUDGETS) {
  const css = readFileSync(join(root, file));
  const raw = css.length / 1024;
  const gz = gzipSync(css).length / 1024;
  console.log(`${file} — ${raw.toFixed(1)} KB raw · ${gz.toFixed(1)} KB gzip (budget ${kb} KB gzip)`);
  if (gz > kb) {
    console.error(`✖ ${file} over budget by ${(gz - kb).toFixed(1)} KB.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('✔ all builds within budget');
