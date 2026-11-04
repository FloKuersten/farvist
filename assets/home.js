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

  // Motion is progressive enhancement: content never depends on an entrance
  // animation, and loops only start after a working pause control is available.
  var motionToggle = document.getElementById('motion-toggle');
  var stage = document.getElementById('motion-stage');
  var motionCode = document.getElementById('motion-css');
  var motionStatus = document.getElementById('motion-status');
  var duration = document.getElementById('motion-duration');
  var distance = document.getElementById('motion-distance');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var userPaused = root.getAttribute('data-home-motion') === 'paused';
  var entrances = new Set();
  var showcase = document.querySelector('.showcase');
  var scene = document.querySelector('.hero-scene');
  var pointerFrame = 0;
  var pointerPosition;
  var presets = {
    drift: { title: 'Drift', description: 'a slow, floating rhythm.' },
    orbit: { title: 'Orbit', description: 'a soft loop around the center.' },
    stack: { title: 'Stack', description: 'layers shift, then settle together.' }
  };

  function motionAllowed() { return !userPaused && !reducedMotion.matches && !document.hidden; }
  function resetTilt() {
    window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    showcase.style.removeProperty('--tilt-x');
    showcase.style.removeProperty('--tilt-y');
  }
  function syncMotion() {
    var paused = userPaused || reducedMotion.matches;
    root.setAttribute('data-home-motion', paused ? 'paused' : 'running');
    root.toggleAttribute('data-home-hidden', document.hidden);
    motionToggle.hidden = false;
    motionToggle.disabled = reducedMotion.matches;
    motionToggle.setAttribute('aria-pressed', String(paused));
    motionToggle.textContent = reducedMotion.matches ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion';
    motionToggle.title = reducedMotion.matches ? 'Motion is off in your system preferences.' : 'Pause or resume decorative motion on this page.';
    var preset = presets[stage.dataset.preset];
    motionStatus.textContent = preset.title + ' — ' + (reducedMotion.matches ? 'reduced motion is on.' : userPaused ? 'motion paused.' : preset.description);
    if (!motionAllowed()) {
      entrances.forEach(function (animation) { animation.cancel(); });
      entrances.clear();
      resetTilt();
    }
  }
  motionToggle.addEventListener('click', function () {
    userPaused = !userPaused;
    try { localStorage.setItem('fv-home-motion', userPaused ? 'paused' : 'running'); } catch (error) { /* Optional persistence. */ }
    syncMotion();
  });
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  finePointer.addEventListener('change', resetTilt);
  syncMotion();

  function updateMotionCode() {
    // Native range inputs are bounded again here so the demo has finite CSS values.
    var seconds = Math.max(2, Math.min(10, Number(duration.value) || 6));
    var pixels = Math.max(8, Math.min(32, Number(distance.value) || 20));
    stage.style.setProperty('--demo-duration', seconds + 's');
    stage.style.setProperty('--demo-distance', pixels + 'px');
    document.getElementById('motion-duration-value').textContent = seconds + 's';
    document.getElementById('motion-distance-value').textContent = pixels + 'px';
    var frames = {
      drift: '  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-' + pixels + 'px); }',
      orbit: '  0%, 100% { transform: translate(-' + pixels + 'px, 0); }\n  25% { transform: translate(0, -' + pixels + 'px); }\n  50% { transform: translate(' + pixels + 'px, 0); }\n  75% { transform: translate(0, ' + pixels + 'px); }',
      stack: '  0%, 100% { transform: translate(0, 0) rotate(0deg); }\n  50% { transform: translate(' + pixels + 'px, -' + pixels + 'px) rotate(6deg); }'
    };
    var name = stage.dataset.preset;
    motionCode.textContent = '.your-element {\n  animation: ' + name + ' ' + seconds + 's ease-in-out infinite;\n}\n@keyframes ' + name + ' {\n' + frames[name] + '\n}\n@media (prefers-reduced-motion: reduce) {\n  .your-element { animation: none; }\n}';
  }
  document.querySelectorAll('[data-motion-preset]').forEach(function (button) {
    button.disabled = false;
    button.addEventListener('click', function () {
      var name = button.dataset.motionPreset;
      if (!Object.hasOwn(presets, name)) return;
      stage.dataset.preset = name;
      document.querySelectorAll('[data-motion-preset]').forEach(function (choice) {
        choice.setAttribute('aria-pressed', String(choice === button));
      });
      updateMotionCode();
      syncMotion();
    });
  });
  [duration, distance].forEach(function (input) {
    input.disabled = false;
    input.addEventListener('input', updateMotionCode);
  });
  updateMotionCode();

  scene.addEventListener('pointermove', function (event) {
    if (!motionAllowed() || !finePointer.matches || event.pointerType !== 'mouse') return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(function () {
      pointerFrame = 0;
      if (!motionAllowed() || !finePointer.matches) return;
      var box = scene.getBoundingClientRect();
      var x = Math.max(-1, Math.min(1, (pointerPosition.x - box.left) / box.width * 2 - 1));
      var y = Math.max(-1, Math.min(1, (pointerPosition.y - box.top) / box.height * 2 - 1));
      showcase.style.setProperty('--tilt-x', (-y * 3).toFixed(2) + 'deg');
      showcase.style.setProperty('--tilt-y', (x * 4).toFixed(2) + 'deg');
    });
  });
  scene.addEventListener('pointerleave', resetTilt);
  scene.addEventListener('pointercancel', resetTilt);
  scene.addEventListener('focusin', resetTilt);

  if ('IntersectionObserver' in window && 'animate' in Element.prototype) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (!motionAllowed()) return;
        var animation = entry.target.animate([
          { opacity: 0.25, transform: 'translateY(22px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        entrances.add(animation);
        animation.onfinish = function () { entrances.delete(animation); };
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.hero-grid > div:first-child, .section-heading, .template-link, .proof-strip > div').forEach(function (element) { observer.observe(element); });
  }

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
