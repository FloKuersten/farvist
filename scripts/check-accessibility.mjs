// Use Pa11y's supported API directly; no glob expansion or external web server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pa11y from 'pa11y';
import puppeteer from 'puppeteer';
import { startPreview } from './lib/site-preview.mjs';

export async function auditPages(config, origin, { audit = pa11y, launch = (options) => puppeteer.launch(options), log = console.log } = {}) {
  assert.ok(Array.isArray(config.urls) && config.urls.length, 'Accessibility URL list must not be empty');
  const urls = config.urls.map((entry) => {
    assert.equal(typeof entry, 'string', 'Accessibility URLs must be explicit strings');
    const url = new URL(entry);
    assert.equal(url.origin, 'http://localhost:4000', 'Accessibility checks must target the local preview');
    assert.ok(!url.username && !url.password && !url.hash, 'Invalid accessibility URL');
    const target = new URL(url.pathname + url.search, origin);
    assert.equal(target.origin, new URL(origin).origin, 'Accessibility URL cannot escape the local preview');
    return target.href;
  });
  assert.equal(new Set(urls).size, urls.length, 'Accessibility URLs must not be duplicated');
  const { chromeLaunchConfig, ...defaults } = config.defaults || {};
  const browser = await launch(chromeLaunchConfig);
  const report = { total: urls.length, passes: 0, issues: 0, errors: 0, results: [] };
  try {
    for (const url of urls) {
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(defaults.timeout || 40000) });
        assert.equal(response.status, 200, `Page returned HTTP ${response.status}`);
        const result = await audit(url, { ...defaults, browser });
        assert.ok(Array.isArray(result.issues), 'Pa11y did not return an issue list');
        report.issues += result.issues.length;
        if (!result.issues.length) report.passes++;
        report.results.push({ url, issues: result.issues });
        log(`${result.issues.length ? 'FAIL' : 'PASS'} ${new URL(url).pathname}: ${result.issues.length} accessibility issues`);
        for (const issue of result.issues) log(`  ${issue.code}: ${issue.message} (${issue.selector})`);
      } catch (error) {
        report.errors++;
        report.results.push({ url, error: error.message });
        log(`ERROR ${new URL(url).pathname}: ${error.message}`);
      }
    }
  } finally { await browser.close(); }
  log(`Accessibility: ${report.passes}/${report.total} pages passed, ${report.issues} issues, ${report.errors} execution errors`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(new URL('../.pa11yci.json', import.meta.url), 'utf8'));
  const site = await startPreview();
  try {
    const report = await auditPages(config, site.origin);
    process.exitCode = report.errors ? 1 : report.issues ? 2 : 0;
  } finally { await site.close(); }
}
