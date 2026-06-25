// Bundle-size budget gate for CI. Fails if the minified CSS exceeds the budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BUDGET_KB = 22;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'dist/farvist.min.css'));
const raw = css.length / 1024;
const gz = gzipSync(css).length / 1024;

console.log(`dist/farvist.min.css — ${raw.toFixed(1)} KB raw · ${gz.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB gzip)`);

if (gz > BUDGET_KB) {
  console.error(`✖ Over budget by ${(gz - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
console.log('✔ within budget');
