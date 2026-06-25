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

    if (t.matches('dialog.modal')) {
      var r = t.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
    }

    var tab = t.closest('[data-fv-tab]');
    if (tab) activateTab(tab);

    if (t.closest('[data-fv-theme-toggle]')) {
      var root = document.documentElement;
      if (root.getAttribute('data-theme') === 'light') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
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

  // ---- Progressive ARIA enhancement (tabs + progress) ----
  function enhance() {
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

    // Scrollable regions (wide tables, long code blocks) must be keyboard-focusable
    // so they can be scrolled without a mouse — but only when they actually overflow.
    qsa('.table-responsive, pre').forEach(function (region) {
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();

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

  // Public API. `Farvist` is the current name; `Farvistrap` kept as an alias.
  window.Farvist = window.Farvistrap = { toast: toast, enhance: enhance };
})();
