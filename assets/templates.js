/* Gallery source viewer. Preview and download links also work without this file. */
(function () {
  'use strict';

  var names = {
    'ai-console': 'AI console',
    'trading-bot': 'Trading bot console',
    'ai-cluster': 'AI cluster console',
    saas: 'SaaS landing',
    dashboard: 'Dashboard',
    auth: 'Sign in / sign up',
    'ai-addon': 'AI kit on an existing site',
    portfolio: 'Portfolio',
    blocks: 'Block gallery'
  };
  var dialog = document.getElementById('template-source-dialog');
  if (!dialog || typeof dialog.showModal !== 'function' || typeof window.fetch !== 'function') return;

  var title = document.getElementById('template-source-title');
  var status = document.getElementById('template-source-status');
  var content = document.getElementById('template-source-content');
  var code = document.getElementById('template-source-code');
  var copyButton = dialog.querySelector('[data-source-copy]');
  var selectButton = dialog.querySelector('[data-source-select]');
  var retryButton = dialog.querySelector('[data-source-retry]');
  var download = dialog.querySelector('[data-source-download]');
  var preview = dialog.querySelector('[data-source-preview]');
  var cache = new Map();
  var controller = null;
  var requestId = 0;
  var opener = null;
  var currentSlug = null;

  function sourceUrl(slug) {
    if (!Object.prototype.hasOwnProperty.call(names, slug)) return null;
    var url = new URL('/templates/starters/' + slug + '.html', window.location.origin);
    return url.origin === window.location.origin ? url : null;
  }

  function announce(message, state) {
    status.textContent = message;
    status.dataset.state = state || 'ready';
  }

  function showSource(text) {
    code.value = text;
    code.scrollTop = 0;
    code.scrollLeft = 0;
    code.disabled = false;
    content.setAttribute('aria-busy', 'false');
    copyButton.disabled = false;
    selectButton.disabled = false;
    announce('Complete HTML loaded. Copy it, download it, or select the source below.');
  }

  async function loadSource(slug) {
    var url = sourceUrl(slug);
    if (!url) return;
    if (controller) controller.abort();
    var id = ++requestId;
    code.value = '';
    code.disabled = true;
    copyButton.disabled = true;
    selectButton.disabled = true;
    retryButton.hidden = true;
    code.placeholder = 'Loading the complete HTML file…';
    content.setAttribute('aria-busy', 'true');
    announce('Loading the complete HTML file…', 'loading');
    if (cache.has(slug)) {
      showSource(cache.get(slug));
      return;
    }

    controller = new AbortController();
    var activeController = controller;
    var timedOut = false;
    var timeout = window.setTimeout(function () { timedOut = true; activeController.abort(); }, 20000);
    try {
      var response = await fetch(url.href, { signal: controller.signal, credentials: 'same-origin', redirect: 'error' });
      if (!response.ok || (response.url && response.url !== url.href)) throw new Error('Unavailable source');
      var text = await response.text();
      if (!/^\s*<!doctype\s+html\b/i.test(text) || !/<\/html>\s*$/i.test(text)
        || !text.includes('Farvist starter: ' + slug)) throw new Error('Incomplete source');
      if (id !== requestId || !dialog.open) return;
      cache.set(slug, text);
      showSource(text);
    } catch (error) {
      if (id !== requestId || !dialog.open || (error.name === 'AbortError' && !timedOut)) return;
      content.setAttribute('aria-busy', 'false');
      code.placeholder = 'Source could not be loaded.';
      retryButton.hidden = false;
      announce(timedOut
        ? 'Loading took too long. Try again, or use Preview or Download HTML.'
        : 'Could not load this template’s source. Try again, or use Preview or Download HTML.', 'error');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function selectSource() {
    if (!code.value || code.disabled) return;
    code.focus();
    code.select();
    code.setSelectionRange(0, code.value.length);
  }

  document.querySelectorAll('[data-template-source]').forEach(function (button) {
    var slug = button.dataset.templateSource;
    var url = sourceUrl(slug);
    if (!url) return;
    button.hidden = false;
    button.addEventListener('click', function () {
      opener = button;
      currentSlug = slug;
      title.textContent = names[slug] + ' — source';
      download.href = url.pathname;
      download.download = 'farvist-' + slug + '.html';
      preview.href = url.pathname;
      preview.setAttribute('aria-label', 'Preview ' + names[slug] + ' (opens in a new tab)');
      code.placeholder = 'Loading the complete HTML file…';
      dialog.showModal();
      loadSource(slug);
    });
  });

  dialog.querySelector('[data-source-close]').addEventListener('click', function () { dialog.close(); });
  // Native dialog handles Escape and keeps keyboard focus within the viewer.
  dialog.addEventListener('close', function () {
    // A previous opening's queued close event must not cancel a newer request.
    if (dialog.open) return;
    ++requestId;
    if (controller) controller.abort();
    controller = null;
    // Native focus restoration normally handles this. Do not steal focus if
    // the user already moved to another card before the close event arrived.
    if (opener && opener.isConnected && (document.activeElement === document.body || dialog.contains(document.activeElement))) {
      opener.focus({ preventScroll: true });
    }
  });
  retryButton.addEventListener('click', function () { loadSource(currentSlug); });
  selectButton.addEventListener('click', function () {
    selectSource();
    announce('All HTML selected. Use your browser’s Copy command to copy it.');
  });
  copyButton.addEventListener('click', async function () {
    if (!code.value || code.disabled) return;
    var id = requestId;
    copyButton.disabled = true;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.value);
      if (id === requestId && dialog.open) announce('Copied the complete HTML file to your clipboard.');
    } catch (error) {
      if (id === requestId && dialog.open) {
        selectSource();
        announce('Automatic copy was unavailable. All HTML is selected; use your browser’s Copy command.', 'error');
      }
    } finally {
      if (id === requestId && dialog.open) copyButton.disabled = false;
    }
  });
})();
