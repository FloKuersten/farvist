// Behavioral regressions for the public companion and the zero-dependency CLI.
// Run with Node's test runner: npm run check:safety.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = join(root, 'bin/farvist.mjs');
const temp = mkdtempSync(join(tmpdir(), 'farvist-safety-'));
let browser;

after(async () => {
  if (browser) await browser.close();
  rmSync(temp, { recursive: true, force: true });
});

function cli(args, timeout = 10000) {
  const result = spawnSync(process.execPath, [bin, 'check', ...args], {
    cwd: root, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}

test('CLI finishes malformed imports and unterminated delimiters within a bounded subprocess', () => {
  const cases = [
    ['import.html', 'import ' + ' '.repeat(10000) + 'x'],
    ['imports.html', 'import '.repeat(50000) + 'x'],
    ['comments.html', '<!--'.repeat(100000)],
    ['jsx-comments.tsx', '{ /* '.repeat(80000)],
    ['links.html', '<link '.repeat(60000)],
    ['styles.html', '<style>'.repeat(50000)],
    ['icons.html', '<use '.repeat(80000)],
  ];
  for (const [name, body] of cases) {
    const file = join(temp, name);
    writeFileSync(file, body + '\n<div class="card-bdy"></div>');
    const result = cli([file, '--json'], 2500);
    assert.equal(result.status, 1, name);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.complete, true, name);
    assert.equal(report.summary.errors, 1, name);
    assert.equal(report.files[0].problems[0].class, 'card-bdy', name);
  }
});

test('CLI preserves all static CSS import forms and case-insensitive quoted tags', () => {
  const dir = join(temp, 'parser-imports');
  mkdirSync(dir);
  const forms = ["import './side.css';", "import styles from './default.css';", "import { card as custom } from './named.css';", "import * as theme from './namespace.css';", "import {\n card,\n btn\n} from\n './multiline.css';"];
  const names = ['side', 'default', 'named', 'namespace', 'multiline'];
  names.forEach((name) => writeFileSync(join(dir, name + '.css'), `.card-${name}-custom { color: red; }`));
  writeFileSync(join(dir, 'linked.css'), '.card-linked-custom { color: red; }');
  const file = join(dir, 'page.tsx');
  writeFileSync(file, forms.join('\n') + '\nİ😀\n<LiNk title="a > b" href="linked.css?v=2" REL="alternate stylesheet">\n<STYLE title="a > b">.card-inline-custom { color: red; }</STYLE>\n<div class="' + names.map((name) => `card-${name}-custom`).join(' ') + ' card-linked-custom card-inline-custom card"></div>');
  const result = cli([file, '--json']);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(JSON.parse(result.stdout).summary.errors, 0);
});

test('CLI ignores fake attributes inside quoted values and retains xlink icon checks', () => {
  const dir = join(temp, 'parser-attributes');
  mkdirSync(dir);
  writeFileSync(join(dir, 'fake.css'), '.card-bdy { color: red; }');
  const file = join(dir, 'page.html');
  writeFileSync(file, '<link title="rel=stylesheet href=\'fake.css\'">\n<use title="href=\'https://example.invalid/a.svg#x\'" href="#local"></use>\n<use xlink:href="https://example.invalid/a.svg#x"></use>\n<div class="card-bdy"></div>');
  const result = cli([file, '--json']);
  const problems = JSON.parse(result.stdout).files[0].problems;
  assert.equal(result.status, 1);
  assert.deepEqual(problems.map((p) => p.rule).sort(), ['cross-origin-icon', 'unknown-class']);
  assert.equal(problems.find((p) => p.rule === 'cross-origin-icon').line, 3);
});

test('CLI recovers stylesheet imports after comments and checks tags after style variants', () => {
  const dir = join(temp, 'parser-recovery');
  mkdirSync(dir);
  writeFileSync(join(dir, 'theme.css'), '.card-review-custom { color: red; }');
  const file = join(dir, 'page.tsx');
  writeFileSync(file, "// import styles\nimport './theme.css';\n<div className=\"card-review-custom\" />");
  const imported = cli([file, '--json']);
  assert.equal(imported.status, 0, imported.stdout);
  for (const style of ['<style />', '<style>.someclass {}</style >', '<style>']) {
    writeFileSync(file, style + '\n<link rel="stylesheet" href="theme.css">\n<div className="card-review-custom" />\n<use href="https://example.invalid/a.svg#x"></use>');
    const result = cli([file, '--json']);
    assert.equal(result.status, 1, style);
    assert.deepEqual(JSON.parse(result.stdout).files[0].problems.map((p) => p.rule), ['cross-origin-icon'], style);
  }
});

test('CLI keeps comment positions, escaped samples and unclosed comments intact', () => {
  const file = join(temp, 'parser-positions.tsx');
  writeFileSync(file, '<!-- class="card-nope"\r\n -->\r\n{ /* className="btn-nope"\r\n */ }\r\n😀<div className="card-bdy" />\r\n&lt;div class="btn-primry"&gt;\r\n<!-- unfinished\r\n<div class="badge-sof-primary"></div>');
  const result = cli([file, '--json']);
  const problems = JSON.parse(result.stdout).files[0].problems;
  assert.deepEqual(problems.map((p) => [p.class, p.line, p.col]), [['card-bdy', 5, 19], ['badge-sof-primary', 8, 13]]);
  const samples = JSON.parse(cli([file, '--json', '--samples']).stdout).files[0].problems;
  assert.equal(samples.length, 3);
  assert.equal(samples[1].class, 'btn-primry');
});

test('CLI indexes repeated attributes and diagnostic positions without prefix rescans', () => {
  const file = join(temp, 'parser-repeated.html');
  writeFileSync(file, '<div class="card"></div>\n'.repeat(25000) + '<div class="btn-primry"></div>\n'.repeat(1500));
  const result = cli([file, '--json'], 10000);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(report.summary.checkedClasses, 26500);
  assert.equal(report.summary.errors, 1500);
  assert.equal(report.files[0].problems.at(-1).line, 26500);
});

test('CLI rejects missing and empty option values instead of checking the wrong input', () => {
  for (const option of ['--build', '--css', '--ignore']) {
    for (const args of [[option], [`${option}=`], [option, '--json']]) {
      const result = cli(args);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /requires a value/);
      assert.doesNotMatch(result.stderr, /TypeError|ERR_INVALID_ARG_TYPE/);
    }
  }
});

test('CLI cannot report an empty scan as successful validation', () => {
  const dir = join(temp, 'empty');
  mkdirSync(dir);
  const result = cli([dir, '--json']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.files, 0);
  assert.equal(report.summary.complete, false);
});

test('CLI reports a broken path as an incomplete scan even when valid files pass', () => {
  const dir = join(temp, 'broken');
  mkdirSync(dir);
  writeFileSync(join(dir, 'valid.html'), '<div class="card"></div>');
  symlinkSync(join(temp, 'missing-directory'), join(dir, 'link'), 'junction');
  const result = cli([dir, '--json']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.files, 1);
  assert.equal(report.summary.skipped, 1);
  assert.equal(report.summary.complete, false);
});

test('CLI bounds markup and explicit or linked CSS reads to 5 MB', () => {
  const dir = join(temp, 'large');
  mkdirSync(dir);
  const large = ' '.repeat(5_000_001);
  const html = join(dir, 'large.html');
  const css = join(dir, 'custom.css');
  const page = join(dir, 'page.html');
  writeFileSync(html, large);
  writeFileSync(css, large);
  writeFileSync(page, '<link rel="stylesheet" href="custom.css"><div class="card"></div>');
  for (const args of [[html, '--json'], [page, '--json']]) {
    const result = cli(args);
    assert.equal(result.status, 2, args.join(' '));
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.complete, false);
    assert.equal(report.skipped[0].reason, 'EFBIG');
  }
  const explicit = cli([page, '--css', css]);
  assert.equal(explicit.status, 2);
  assert.match(explicit.stderr, /5.*000.*000|5 MB/);
});

test('CLI refuses device files', { skip: process.platform === 'win32' }, () => {
  const result = cli(['/dev/null', '--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).skipped[0].reason, 'ENOTFILE');
});

test('CLI refuses FIFOs without waiting for a writer', { skip: process.platform === 'win32' }, () => {
  const pipe = join(temp, 'pipe.css');
  const created = spawnSync('mkfifo', [pipe], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(created.error);
  assert.equal(created.status, 0, created.stderr);
  const page = join(temp, 'pipe.html');
  writeFileSync(page, '<link rel="stylesheet" href="pipe.css"><div class="card"></div>');
  const result = cli([page, '--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).skipped[0].reason, 'ENOTFILE');
});

test('CLI only auto-loads relative stylesheets; absolute CSS requires --css', () => {
  const css = join(temp, 'absolute.css');
  const page = join(temp, 'absolute.html');
  writeFileSync(css, '.btn-private { color: red; }');
  for (const ref of [css, css.replaceAll('\\', '/'), pathToFileURL(css).href]) {
    writeFileSync(page, `<link rel="stylesheet" href="${ref}"><div class="btn-private"></div>`);
    assert.equal(cli([page]).status, 1, `must not auto-load ${ref}`);
    assert.equal(cli([page, '--css', css]).status, 0, 'explicit stylesheet still supported');
  }
});

test('CLI still validates normal input and reports markup errors', () => {
  const page = join(temp, 'normal.html');
  writeFileSync(page, '<div class="card"></div>');
  let result = cli([page, '--json']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).summary.complete, true);
  writeFileSync(page, '<div class="btn-glas"></div>');
  result = cli([page, '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).summary.errors, 1);
});

// Each browser test receives a fresh document; only the local companion is loaded.
async function withPage(run, beforeScript) {
  browser ||= await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    // Give URL resolution and localStorage a real origin without making any
    // network requests, including when a redirect regression is reproduced.
    await page.setRequestInterception(true);
    page.on('request', (request) => request.respond({
      contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
    }));
    await page.goto('https://farvist.test/');
    await page.setContent(`<!doctype html><html lang="en"><body>
      <dialog class="command" id="cmd">
        <input class="command-input" aria-label="Commands">
        <ul class="command-list">
          <li class="command-item" id="locked" aria-disabled="true" data-fv-command="locked"><span>Locked</span></li>
          <li class="command-item" id="first" data-fv-command="first">First</li>
          <li class="command-item" id="second" data-fv-command="second">Second</li>
        </ul><div class="command-empty" hidden>No matches</div>
      </dialog>
      <button class="copy-btn" id="copy" aria-label="Copy code" data-fv-copy="example">Copy</button>
      <div id="stream"></div>
    </body></html>`);
    if (beforeScript) await beforeScript(page);
    await page.addScriptTag({ path: join(root, 'assets/farvist.js') });
    await page.evaluate(() => {
      window.commands = [];
      document.addEventListener('fv:command', (e) => window.commands.push(e.detail.value));
    });
    await run(page);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
  } finally { await page.close(); }
}

test('disabled commands ignore clicks and keyboard navigation skips them', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => Farvist.command('#cmd'));
    assert.equal(await page.$eval('.command-item.is-active', (el) => el.id), 'first');
    await page.click('#locked span');
    assert.deepEqual(await page.evaluate(() => window.commands), []);
    assert.equal(await page.$eval('#cmd', (el) => el.open), true);
    await page.focus('.command-input');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.$eval('.command-item.is-active', (el) => el.id), 'second');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.commands), ['second']);
  });
});

test('a command disabled after selection cannot dispatch on Enter', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      Farvist.command('#cmd');
      document.querySelector('.command-item.is-active').setAttribute('aria-disabled', 'true');
    });
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.commands), []);
    assert.equal(await page.$eval('#cmd', (el) => el.open), true);
  });
});

test('native disabled, hidden and inert commands cannot dispatch or navigate', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      Farvist.command('#cmd');
      const list = document.querySelector('.command-list');
      for (const attribute of ['disabled', 'hidden', 'inert', 'aria-disabled="true"']) {
        const item = document.createElement('a');
        item.className = 'command-item';
        item.href = '#should-not-navigate';
        item.setAttribute('data-fv-command', '#should-not-navigate');
        if (attribute.startsWith('aria')) item.setAttribute('aria-disabled', 'true');
        else item.setAttribute(attribute, '');
        list.appendChild(item);
        item.click();
      }
      return { hash: location.hash, commands: window.commands, open: document.querySelector('#cmd').open };
    });
    assert.deepEqual(result, { hash: '', commands: [], open: true });
  });
});

test('an all-disabled palette has no active command', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      document.querySelectorAll('.command-item').forEach((el) => el.setAttribute('aria-disabled', 'true'));
      Farvist.command('#cmd');
    });
    assert.equal(await page.$('.command-item.is-active'), null);
    assert.equal(await page.$eval('.command-input', (el) => el.hasAttribute('aria-activedescendant')), false);
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.commands), []);
  });
});

test('command destinations reject protocol-relative and control-obfuscated URLs', async () => {
  await withPage(async (page) => {
    const values = ['//example.invalid', '/\\example.invalid', '/\t/example.invalid',
      '/\n/example.invalid', '/\r\\example.invalid', 'javascript:alert(1)', 'data:text/html,example'];
    const expected = [];
    for (const value of values) {
      const result = await page.evaluate((value) => {
        const item = document.querySelector('#first');
        item.setAttribute('data-fv-command', value);
        Farvist.command('#cmd');
        item.click();
        return { commands: window.commands, href: location.href };
      }, value);
      expected.push(value);
      assert.deepEqual(result, { commands: expected, href: 'https://farvist.test/' }, JSON.stringify(value));
    }
  });
});

test('command destinations still allow fragments, local paths and explicit HTTP(S) URLs', async () => {
  for (const [value, expected] of [
    ['#section', 'https://farvist.test/#section'],
    ['/docs/?from=command', 'https://farvist.test/docs/?from=command'],
    ['https://example.invalid/docs', 'https://example.invalid/docs'],
    ['http://example.invalid/docs', 'http://example.invalid/docs'],
  ]) {
    await withPage(async (page) => {
      await page.evaluate((value) => {
        document.querySelector('#first').setAttribute('data-fv-command', value);
        Farvist.command('#cmd');
      }, value);
      await Promise.all([page.waitForNavigation(), page.click('#first')]);
      assert.equal(page.url(), expected);
    });
  }
});

test('theme API validates the whole name and preserves the current theme on invalid input', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      Farvist.theme('Custom_skin-2');
      const invalid = ['<img>', 'two words', '1skin', 'a'.repeat(33), 'forest\n', 'forest\r', 'forest\r\n', ['forest'], {}];
      const rejected = invalid.map((value) => {
        Farvist.theme(value);
        return [document.documentElement.getAttribute('data-theme'), localStorage.getItem('fv-theme')];
      });
      Farvist.theme('default');
      const reset = document.documentElement.hasAttribute('data-theme');
      Farvist.theme('a'.repeat(32));
      const longest = document.documentElement.getAttribute('data-theme');
      Farvist.theme();
      return { rejected, reset, longest, final: document.documentElement.hasAttribute('data-theme') };
    });
    assert.deepEqual(result.rejected, Array(9).fill(['Custom_skin-2', 'Custom_skin-2']));
    assert.equal(result.reset, false);
    assert.equal(result.longest, 'a'.repeat(32));
    assert.equal(result.final, false);
  });
});

test('stored themes use the same validation and default reset as the theme API', async () => {
  for (const [saved, expected] of [['forest', 'forest'], ['brand_2', 'brand_2'],
    ['forest\n', 'cyber'], ['<img>', 'cyber'], ['a'.repeat(33), 'cyber'], ['default', null], ['dark', null]]) {
    await withPage(async (page) => {
      assert.equal(await page.$eval('html', (el) => el.getAttribute('data-theme')), expected, JSON.stringify(saved));
    }, async (page) => {
      await page.evaluate((saved) => {
        document.documentElement.setAttribute('data-theme', 'cyber');
        localStorage.setItem('fv-theme', saved);
      }, saved);
    });
  }
});

test('toasts render with Trusted Types enforcement enabled', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(() => {
      const policy = document.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "require-trusted-types-for 'script'; trusted-types 'none'";
      document.head.appendChild(policy);
      let enforced = false;
      try { document.createElement('div').innerHTML = '<b>blocked</b>'; }
      catch (error) { enforced = error instanceof TypeError; }
      Farvist.toast({ message: '<b>literal</b>', timeout: 0 });
      return { enforced, message: document.querySelector('.toast-message').textContent,
        close: document.querySelector('.toast-close').textContent };
    });
    assert.deepEqual(result, { enforced: true, message: '<b>literal</b>', close: '×' });
  });
});

for (const mode of ['modern', 'legacy', 'rejected', 'throwing', 'denied']) {
  test(`clipboard feedback reflects the actual ${mode} result`, async () => {
    await withPage(async (page) => {
      const result = await page.evaluate(async (mode) => {
        const writes = [];
        let fallbackCalls = 0;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'legacy' ? undefined : {
          writeText(text) {
            if (mode === 'modern') { writes.push(text); return Promise.resolve(); }
            if (mode === 'throwing') throw new Error('Denied');
            return Promise.reject(new Error('Denied'));
          },
        } });
        document.execCommand = () => {
          fallbackCalls++;
          if (mode === 'throwing') throw new Error('Denied');
          return mode === 'legacy' || mode === 'rejected';
        };
        const button = document.querySelector('#copy');
        button.focus();
        const success = await Farvist.copy('example', button);
        return { success, writes, fallbackCalls, label: button.textContent,
          copied: button.classList.contains('is-copied'),
          focused: document.activeElement === button, textareas: document.querySelectorAll('textarea').length };
      }, mode);
      const success = ['modern', 'legacy', 'rejected'].includes(mode);
      assert.equal(result.success, success);
      assert.equal(result.copied, success);
      assert.match(result.label, success ? /Copied/ : /failed/i);
      assert.deepEqual(result.writes, mode === 'modern' ? ['example'] : []);
      assert.equal(result.fallbackCalls, mode === 'modern' ? 0 : 1);
      assert.equal(result.focused, true);
      assert.equal(result.textareas, 0);
    });
  });
}

test('clipboard fallback selects inside the active modal and restores focus', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(async () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      Farvist.command('#cmd');
      const input = document.querySelector('.command-input');
      document.execCommand = () => {
        const selected = document.activeElement;
        return selected instanceof HTMLTextAreaElement && selected.closest('#cmd') !== null
          && selected.value === 'inside modal' && selected.selectionEnd === selected.value.length;
      };
      const success = await Farvist.copy('inside modal');
      return { success, focused: document.activeElement === input, textareas: document.querySelectorAll('textarea').length };
    });
    assert.deepEqual(result, { success: true, focused: true, textareas: 0 });
  });
});

test('toast and stream render untrusted messages as text', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(async () => {
      const payload = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
      Farvist.toast({ title: payload, message: payload, timeout: 0 });
      await Farvist.stream(document.querySelector('#stream'), payload, { instant: true });
      return { injected: !!window.injected, images: document.querySelectorAll('img').length,
        toast: document.querySelector('.toast-message').textContent, stream: document.querySelector('#stream').textContent, payload };
    });
    assert.equal(result.injected, false);
    assert.equal(result.images, 0);
    assert.equal(result.toast, result.payload);
    assert.equal(result.stream, result.payload);
  });
});
