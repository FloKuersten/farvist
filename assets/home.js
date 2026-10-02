/* Site demos only; the framework's JS API remains in farvist.js. */
(function () {
  'use strict';
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var output = document.getElementById('brand-css');
  var selectedBrand = 'default';
  var brands = {
    default: {},
    emerald: { '--fv-primary': '#10b981', '--fv-accent': '#a3e635', '--fv-info': '#2dd4bf', '--fv-primary-contrast': '#06281f' },
    crimson: { '--fv-primary': '#f43f5e', '--fv-accent': '#fb923c', '--fv-info': '#f472b6', '--fv-primary-contrast': '#250710' },
    gold: { '--fv-primary': '#f59e0b', '--fv-accent': '#fde047', '--fv-info': '#fb923c', '--fv-primary-contrast': '#1c1917' }
  };
  function clearBrand() {
    Object.values(brands).forEach(function (vars) {
      Object.keys(vars).forEach(function (key) { root.style.removeProperty(key); });
    });
    selectedBrand = 'default';
  }
  function syncTheme() {
    var theme = root.getAttribute('data-theme') || 'dark';
    var light = theme === 'light' || theme === 'dawn';
    toggle.textContent = (light ? '☀ ' : '☾ ') + theme.charAt(0).toUpperCase() + theme.slice(1);
    toggle.setAttribute('aria-label', 'Switch to ' + (light ? 'dark' : 'light') + ' theme');
    document.querySelectorAll('[data-home-skin]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(selectedBrand === 'default' && button.dataset.homeSkin === theme));
    });
    document.querySelectorAll('[data-brand]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.brand === selectedBrand));
    });
  }
  function showThemeCode() {
    var theme = root.getAttribute('data-theme') || 'dark';
    output.textContent = theme === 'dark' ? '/* Default theme: no extra CSS needed. */\n:root { }' : '<html data-theme="' + theme + '">';
  }
  toggle.addEventListener('click', function () {
    var theme = root.getAttribute('data-theme');
    clearBrand();
    Farvist.theme(theme === 'light' || theme === 'dawn' ? 'dark' : 'light');
    showThemeCode();
    syncTheme();
  });
  document.querySelectorAll('[data-home-skin]').forEach(function (button) {
    button.addEventListener('click', function () {
      clearBrand();
      Farvist.theme(button.dataset.homeSkin);
      showThemeCode();
      syncTheme();
    });
  });
  document.querySelectorAll('[data-brand]').forEach(function (button) {
    button.addEventListener('click', function () {
      clearBrand();
      // Palette examples use the default dark surfaces, so the copied CSS
      // reproduces the preview even after a visitor has tried another skin.
      Farvist.theme('dark');
      selectedBrand = button.dataset.brand;
      var vars = brands[selectedBrand];
      Object.keys(vars).forEach(function (key) { root.style.setProperty(key, vars[key]); });
      output.textContent = Object.keys(vars).length
        ? '/* Default dark theme */\n:root {\n' + Object.keys(vars).map(function (key) { return '  ' + key + ': ' + vars[key] + ';'; }).join('\n') + '\n}'
        : '/* Default theme: no extra CSS needed. */\n:root { }';
      syncTheme();
    });
  });
  syncTheme();
  showThemeCode();

  // Copy reports success only after the browser confirms the write.
  async function copySource(source, button) {
    try {
      await navigator.clipboard.writeText(source.textContent);
      button.textContent = 'Copied!';
      Farvist.toast({ message: 'Code copied to clipboard.', variant: 'success' });
    } catch (error) {
      button.textContent = 'Select text';
      var selection = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(source);
      selection.removeAllRanges();
      selection.addRange(range);
      Farvist.toast({ message: 'Use your browser’s Copy command to copy the selected text.' });
    }
    window.setTimeout(function () { button.textContent = 'Copy'; }, 2500);
  }
  document.querySelectorAll('[data-home-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      copySource(document.getElementById(button.dataset.homeCopy), button);
    });
  });
  // Apply the same feedback to the auto-enhanced snippets on this page.
  // Capture before the companion's document-level copy handler.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.copy-btn');
    if (!button) return;
    var wrap = button.closest('.snippet-wrap');
    var source = wrap && wrap.querySelector('pre');
    if (!source) return;
    event.stopPropagation();
    copySource(source, button);
  }, true);
  document.getElementById('demo-form').addEventListener('submit', function (event) {
    event.preventDefault();
    Farvist.toast({ title: 'Demo complete', message: 'Your form works. Nothing was sent or stored.', variant: 'success' });
  });
})();
