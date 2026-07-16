/*!
 * Farvistrap — tiny vanilla-JS companion (~2.5 KB) for the interactive bits.
 * No dependencies. Drop it in with: <script src="assets/farvistrap.js" defer></script>
 *
 *   Modals  : <button data-fv-open="#id">  +  <dialog class="modal" id="id">
 *             close with [data-fv-dismiss], a backdrop click, or Esc (native)
 *   Tabs    : <button class="tab" data-fv-tab="#panel">  +  <div class="tab-panel" id="panel">
 *             ARIA roles, roving tabindex and arrow-key nav are applied for you
 *   Theme   : <button data-fv-theme-toggle>  (flips data-theme on <html>)
 *   Toasts  : Farvistrap.toast({ title, message, variant, timeout })
 *   Dropdowns close on an outside click or Esc.
 *
 * On load it also adds role="progressbar" + aria-value* to .progress bars and
 * full tablist semantics to .tabs, so the components are accessible by default.
 */
(function () {
  'use strict';

  var qsa = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var fvUid = 0; // unique-id source for generated a11y associations

  // Append an id to aria-describedby without dropping author-set tokens.
  function addDescribedBy(el, id) {
    var d = el.getAttribute('aria-describedby') || '';
    if (d.split(/\s+/).indexOf(id) === -1) el.setAttribute('aria-describedby', (d + ' ' + id).trim());
  }

  // Activate a tab and its panel — scoped to the tab's OWN .tabs group, so
  // sibling tab groups under one container don't clobber each other.
  function activateTab(tab) {
    var list = tab.closest('.tabs');
    if (!list) return;
    qsa('.tab', list).forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1');
      var sel = t.getAttribute('data-fv-tab');
      var panel = sel && document.querySelector(sel);
      if (panel) panel.classList.toggle('active', on);
    });
  }

  // ---- Click delegation ----
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    // Close any open dropdown the click landed outside of (runs unconditionally,
    // before the early-returning branches below).
    qsa('details.dropdown[open]').forEach(function (dd) {
      if (!dd.contains(t)) dd.removeAttribute('open');
    });

    // Navbar hamburger: toggle the collapsed menu open/closed.
    var navToggle = t.closest('[data-fv-nav-toggle]');
    if (navToggle) {
      var bar = navToggle.closest('.navbar');
      if (bar) {
        var isOpen = bar.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      return;
    }

    // Tapping a nav link closes the open mobile menu (but still navigates).
    var navLink = t.closest('.navbar-nav .nav-link');
    if (navLink) {
      var openBar = navLink.closest('.navbar.is-open');
      if (openBar) {
        openBar.classList.remove('is-open');
        var tgl = openBar.querySelector('[data-fv-nav-toggle]');
        if (tgl) tgl.setAttribute('aria-expanded', 'false');
      }
    }

    var opener = t.closest('[data-fv-open]');
    if (opener) {
      var dlg = document.querySelector(opener.getAttribute('data-fv-open'));
      if (dlg && dlg.showModal) dlg.showModal();
      return;
    }

    var dismiss = t.closest('[data-fv-dismiss]');
    if (dismiss) {
      var d = dismiss.closest('dialog');
      if (d) d.close();
      return;
    }

    if (t.matches('dialog.modal, dialog.command')) {
      var r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
    }

    // Command-palette item clicked → activate it.
    var cmdItem = t.closest('.command-item');
    if (cmdItem) { runCommand(cmdItem); return; }

    var tab = t.closest('[data-fv-tab]');
    if (tab) activateTab(tab);

    if (t.closest('[data-fv-theme-toggle]')) {
      var root = document.documentElement;
      if (root.getAttribute('data-theme') === 'light') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
    }

    // Skin cycler: <button data-fv-theme-cycle="synthwave,cyber,noir"> steps
    // through its list (plus the default) on each click.
    var cycler = t.closest('[data-fv-theme-cycle]');
    if (cycler) {
      var names = (cycler.getAttribute('data-fv-theme-cycle') || '').split(',')
        .map(function (s) { return s.trim(); }).filter(Boolean);
      names.unshift('dark'); // the default is part of the cycle
      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = names[(names.indexOf(current) + 1) % names.length];
      theme(next);
    }

    // Copy-to-clipboard: .copy-btn (auto-added to pre.snippet) or any [data-fv-copy].
    // A bare data-fv-copy copies the nearest snippet — or, in a chat
    // .message-actions row, the sibling .message-bubble's text.
    var copyBtn = t.closest('.copy-btn, [data-fv-copy]');
    if (copyBtn) {
      var text = '', ref = copyBtn.getAttribute('data-fv-copy');
      if (ref && ref.charAt(0) === '#') { var tgt = document.querySelector(ref); text = tgt ? tgt.textContent : ''; }
      else if (ref) { text = ref; }
      else {
        var wrap = copyBtn.closest('.snippet-wrap');
        var pre = wrap && wrap.querySelector('pre');
        if (pre) { text = (pre.querySelector('code') || pre).textContent; }
        else {
          var body = copyBtn.closest('.message-body');
          var bubble = body && body.querySelector('.message-bubble');
          text = bubble ? bubble.textContent.trim() : '';
        }
      }
      if (text) copy(text, copyBtn);
    }
  });

  // ---- Keyboard: Esc closes dropdowns; arrows move between tabs ----
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      qsa('details.dropdown[open]').forEach(function (dd) {
        dd.removeAttribute('open');
        var s = dd.querySelector('summary');
        if (s) s.focus();
      });
      qsa('.navbar.is-open').forEach(function (nav) {
        nav.classList.remove('is-open');
        var tgl = nav.querySelector('[data-fv-nav-toggle]');
        if (tgl) { tgl.setAttribute('aria-expanded', 'false'); tgl.focus(); }
      });
    }

    // ⌘K / Ctrl+K opens the command palette (if one exists on the page).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && document.querySelector('dialog.command')) {
      e.preventDefault();
      openCommand();
      return;
    }

    // Arrow / Enter navigation while a command palette is open.
    var openCmd = document.querySelector('dialog.command[open]');
    if (openCmd) {
      var items = cmdItems(openCmd);
      if (!items.length) return;
      var cur = openCmd.querySelector('.command-item.is-active'), ci = items.indexOf(cur), nj = -1;
      if (e.key === 'ArrowDown') nj = (ci + 1) % items.length;
      else if (e.key === 'ArrowUp') nj = (ci - 1 + items.length) % items.length;
      else if (e.key === 'Home') nj = 0;
      else if (e.key === 'End') nj = items.length - 1;
      else if (e.key === 'Enter') { if (cur) { e.preventDefault(); runCommand(cur); } return; }
      if (nj > -1) { e.preventDefault(); cmdSetActive(openCmd, items[nj]); }
      return;
    }

    var t = e.target;
    if (t instanceof Element && t.matches('.tab') && t.closest('.tabs')) {
      var tabs = qsa('.tab', t.closest('.tabs'));
      var i = tabs.indexOf(t), n = tabs.length, j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j > -1) { e.preventDefault(); activateTab(tabs[j]); tabs[j].focus(); }
    }
  });

  // ---- Command palette (⌘K) ----
  var cmdId = 0;
  function cmdItems(dialog) { return qsa('.command-item', dialog).filter(function (el) { return !el.hidden; }); }

  function cmdSetActive(dialog, item) {
    qsa('.command-item.is-active', dialog).forEach(function (el) {
      el.classList.remove('is-active'); el.setAttribute('aria-selected', 'false');
    });
    var input = dialog.querySelector('.command-input');
    if (item) {
      item.classList.add('is-active');
      item.setAttribute('aria-selected', 'true');
      if (!item.id) item.id = 'fvcmd-' + (++cmdId);
      if (input) input.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    } else if (input) {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function cmdFilter(dialog) {
    var q = (dialog.querySelector('.command-input').value || '').trim().toLowerCase();
    var anyVisible = false;
    qsa('.command-item', dialog).forEach(function (item) {
      var hay = (item.textContent + ' ' + (item.getAttribute('data-fv-keywords') || '')).toLowerCase();
      item.hidden = !!(q && hay.indexOf(q) === -1);
      if (!item.hidden) anyVisible = true;
    });
    qsa('.command-group', dialog).forEach(function (g) {
      var el = g.nextElementSibling, show = false;
      while (el && !el.classList.contains('command-group')) {
        if (el.classList && el.classList.contains('command-item') && !el.hidden) { show = true; break; }
        el = el.nextElementSibling;
      }
      g.hidden = q ? !show : false;
    });
    var empty = dialog.querySelector('.command-empty');
    if (empty) empty.hidden = anyVisible;
    cmdSetActive(dialog, cmdItems(dialog)[0] || null);
  }

  function runCommand(item) {
    var dialog = item.closest('dialog.command');
    var val = item.getAttribute('data-fv-command');
    if (dialog) dialog.close();
    if (val && (val.charAt(0) === '/' || val.charAt(0) === '#' || /^https?:/.test(val))) {
      window.location.href = val;
    } else if (dialog) {
      dialog.dispatchEvent(new CustomEvent('fv:command', { bubbles: true, detail: { value: val, item: item } }));
    }
  }

  function openCommand(sel) {
    var dialog = sel ? document.querySelector(sel) : document.querySelector('dialog.command');
    if (!dialog || !dialog.showModal) return;
    dialog.showModal();
    var input = dialog.querySelector('.command-input');
    if (input) { input.value = ''; input.focus(); }
    cmdFilter(dialog);
  }

  // Type-to-filter (delegated so injected palettes work without re-binding).
  document.addEventListener('input', function (e) {
    if (e.target instanceof Element && e.target.matches('.command-input')) {
      var d = e.target.closest('dialog.command');
      if (d) cmdFilter(d);
    }
  });

  // ---- Progressive ARIA enhancement (tabs + progress) ----
  function enhance() {
    // Command palettes: wire the combobox + listbox roles for screen readers.
    qsa('dialog.command').forEach(function (dialog, di) {
      var input = dialog.querySelector('.command-input');
      var list = dialog.querySelector('.command-list');
      if (list && !list.id) list.id = 'fvcmdlist-' + di;
      if (input) {
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('autocomplete', 'off');
        if (list) input.setAttribute('aria-controls', list.id);
      }
      if (list) list.setAttribute('role', 'listbox');
      qsa('.command-item', dialog).forEach(function (item) {
        item.setAttribute('role', 'option');
        if (!item.hasAttribute('aria-selected')) item.setAttribute('aria-selected', 'false');
      });
      qsa('.command-group', dialog).forEach(function (g) { g.setAttribute('role', 'presentation'); });
    });

    qsa('.tabs').forEach(function (list) {
      list.setAttribute('role', 'tablist');
      qsa('.tab', list).forEach(function (tab, i) {
        var on = tab.classList.contains('active');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
        var sel = tab.getAttribute('data-fv-tab');
        var panel = sel && document.querySelector(sel);
        if (panel) {
          if (!tab.id) tab.id = (panel.id || 'fvtab' + i) + '-tab';
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('role', 'tabpanel');
          if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
          panel.setAttribute('aria-labelledby', tab.id);
        }
      });
    });

    qsa('.progress > .progress-bar').forEach(function (bar) {
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      var w = bar.style.width;
      if (w && w.indexOf('%') > -1) bar.setAttribute('aria-valuenow', String(parseFloat(w)));
      if (!bar.getAttribute('aria-label') && !bar.getAttribute('aria-labelledby')) {
        bar.setAttribute('aria-label', 'Progress');
      }
    });

    // Rendered-markdown tables (bare <table> inside .prose) keep display:table
    // for accessibility, so wide ones need an overflow wrapper to scroll.
    qsa('.prose table').forEach(function (table) {
      if (table.parentElement && table.parentElement.classList.contains('table-responsive')) return;
      if (table.scrollWidth > table.clientWidth + 1 || table.offsetWidth > table.parentElement.clientWidth + 1) {
        var shell = document.createElement('div');
        shell.className = 'table-responsive';
        table.parentNode.insertBefore(shell, table);
        shell.appendChild(table);
      }
    });

    // Scrollable regions (wide tables, long code blocks, tool-call payloads)
    // must be keyboard-focusable so they can be scrolled without a mouse —
    // but only when they actually overflow.
    qsa('.table-responsive, pre, .tool-call-args, .tool-call-result').forEach(function (region) {
      if (!region.hasAttribute('tabindex') && region.scrollWidth > region.clientWidth + 1) {
        region.setAttribute('tabindex', '0');
      }
    });

    // Current-state semantics (idempotent: only set when absent).
    qsa('.breadcrumb-item.active').forEach(function (el) {
      if (!el.hasAttribute('aria-current')) el.setAttribute('aria-current', 'page');
    });
    qsa('.step.is-active').forEach(function (el) {
      if (!el.hasAttribute('aria-current')) el.setAttribute('aria-current', 'step');
    });
    qsa('.pagination .page-item.active').forEach(function (item) {
      var link = item.querySelector('.page-link') || item;
      if (!link.hasAttribute('aria-current')) link.setAttribute('aria-current', 'page');
    });

    // Form validation: wire aria-invalid + aria-describedby to the feedback message.
    qsa('.form-control.is-invalid, .form-select.is-invalid').forEach(function (ctrl) {
      ctrl.setAttribute('aria-invalid', 'true');
      var fb = ctrl.parentNode && ctrl.parentNode.querySelector('.invalid-feedback');
      if (fb) {
        if (!fb.id) fb.id = (ctrl.id || 'fv-fld-' + (fvUid++)) + '-err';
        addDescribedBy(ctrl, fb.id);
      }
    });
    qsa('.form-control.is-valid, .form-select.is-valid').forEach(function (ctrl) {
      ctrl.setAttribute('aria-invalid', 'false');
    });

    // Tooltips: expose the decorative CSS text to assistive tech. The description
    // span is inserted as a SIBLING (not a child) so it never pollutes the host's
    // accessible name; it is referenced purely via aria-describedby.
    qsa('[data-tooltip]').forEach(function (host) {
      var interactive = /^(a|button|input|select|textarea)$/i.test(host.tagName) ||
        host.hasAttribute('tabindex') || host.isContentEditable;
      if (!interactive) host.setAttribute('tabindex', '0');
      if (host.getAttribute('data-fv-tt') === '1' || !host.parentNode) return; // creates DOM: guard
      host.setAttribute('data-fv-tt', '1');
      var desc = document.createElement('span');
      desc.className = 'visually-hidden';
      desc.id = 'fv-tt-' + (fvUid++);
      desc.textContent = host.getAttribute('data-tooltip') || '';
      host.parentNode.insertBefore(desc, host.nextSibling);
      addDescribedBy(host, desc.id);
    });

    // Copy buttons: wrap each `pre.snippet` and add a copy button (idempotent).
    qsa('pre.snippet').forEach(function (pre) {
      if (pre.parentNode && pre.parentNode.classList.contains('snippet-wrap')) return;
      if (!pre.parentNode) return;
      var wrap = document.createElement('div');
      wrap.className = 'snippet-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.setAttribute('aria-live', 'polite');
      btn.textContent = 'Copy';
      wrap.appendChild(btn);
    });

    // Docs scrollspy: highlight the sidebar link for the section in view (once).
    var dnav = document.querySelector('.docs-nav');
    if (dnav && 'IntersectionObserver' in window && !window.__fvSpy) {
      window.__fvSpy = true;
      var links = {};
      qsa('a[href^="#"]', dnav).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && links[en.target.id]) {
            Object.keys(links).forEach(function (k) { links[k].classList.toggle('active', k === en.target.id); });
          }
        });
      }, { rootMargin: '0px 0px -80% 0px' });
      qsa('.docs-main section[id]').forEach(function (s) { spy.observe(s); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();

  // ---- Copy to clipboard ----
  function copy(text, btn) {
    function ok() {
      if (!btn) return;
      btn.classList.add('is-copied');
      if (btn.classList.contains('copy-btn')) {
        // Text button: swap the label.
        btn.textContent = 'Copied ✓';
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1600);
      } else {
        // Icon-only button: announce via aria-label on a live region so
        // assistive tech hears the success too, then restore.
        var label = btn.getAttribute('aria-label');
        if (!btn.hasAttribute('aria-live')) btn.setAttribute('aria-live', 'polite');
        btn.setAttribute('aria-label', 'Copied');
        setTimeout(function () {
          btn.classList.remove('is-copied');
          if (label) btn.setAttribute('aria-label', label);
        }, 1600);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text); ok(); });
    } else { legacyCopy(text); ok(); }
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  // ---- Toasts ----
  function toast(opts) {
    opts = opts || {};
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      document.body.appendChild(container);
    }

    var el = document.createElement('div');
    el.className = 'toast' + (opts.variant ? ' toast-' + opts.variant : '');
    var assertive = opts.variant === 'danger' || opts.variant === 'error';
    el.setAttribute('role', assertive ? 'alert' : 'status');
    el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');

    var body = document.createElement('div');
    body.className = 'toast-body';
    if (opts.title) {
      var ti = document.createElement('div');
      ti.className = 'toast-title';
      ti.textContent = opts.title;
      body.appendChild(ti);
    }
    if (opts.message) {
      var m = document.createElement('div');
      m.className = 'toast-message';
      m.textContent = opts.message;
      body.appendChild(m);
    }

    var close = document.createElement('button');
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '&times;';

    el.appendChild(body);
    el.appendChild(close);
    container.appendChild(el);

    var timer, gone = false;
    function remove() {
      if (gone) return;            // idempotent: manual close cancels auto-dismiss
      gone = true;
      if (timer) clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 250);
    }
    close.addEventListener('click', remove);

    var timeout = opts.timeout == null ? 4000 : opts.timeout;
    if (timeout) timer = setTimeout(remove, timeout);
    return el;
  }

  // ---- Skins / theme API ----
  // Farvist.theme('synthwave') applies a skin (any [data-theme] value) and
  // persists it; theme('dark') / theme() restores the default.
  function theme(name) {
    var root = document.documentElement;
    if (!name || name === 'dark' || name === 'default') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', name);
    try { localStorage.setItem('fv-theme', name || 'dark'); } catch (e) { /* private mode */ }
  }

  // Restore a persisted skin as early as this script runs. (For zero flash on
  // slow pages, inline the same two lines in <head> — see the docs.)
  try {
    var savedTheme = localStorage.getItem('fv-theme');
    if (savedTheme && savedTheme !== 'dark') document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (e) { /* private mode */ }

  // Public API. `Farvist` is the current name; `Farvistrap` kept as an alias.
  window.Farvist = window.Farvistrap = { toast: toast, enhance: enhance, copy: copy, theme: theme, command: openCommand };
})();
