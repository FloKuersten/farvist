/*!
 * Farvist — notify form (opt-in email capture), progressive enhancement.
 *
 * DISABLED BY DEFAULT. The form renders nothing until you set an endpoint, so
 * this file is safe to ship as-is.
 *
 * TO ENABLE (three steps — do all three, the CI gate enforces #2):
 *   1. Set ENDPOINT below to a URL that accepts POST {email}. Anything works:
 *      Buttondown / ConvertKit / Formspree / a Cloudflare Worker of your own.
 *   2. Update privacy/index.html — it currently states "no accounts, forms or
 *      logins", which a live form makes FALSE. `npm run check:privacy` fails
 *      the build while that sentence and a live form coexist. Suggested text is
 *      in scripts/check-privacy-claims.mjs.
 *   3. Drop the markup below into any page (see docs/ or examples/ai-addon.html):
 *
 *      <form class="fv-notify" hidden>
 *        <label class="form-label" for="fv-notify-email">Email</label>
 *        <div class="d-flex gap-2 flex-wrap">
 *          <input class="form-control" id="fv-notify-email" name="email"
 *                 type="email" required placeholder="you@example.com"
 *                 style="flex:1 1 16rem;min-width:0" />
 *          <button class="btn btn-gradient-primary" type="submit">Notify me</button>
 *        </div>
 *        <p class="form-text fv-notify-status" role="status" aria-live="polite"></p>
 *      </form>
 *
 * No third-party script, no cookie, no tracking pixel — one fetch on submit.
 */
(function () {
  'use strict';

  // '' = disabled. Nothing renders and nothing is sent while this is empty.
  var ENDPOINT = '';

  if (!ENDPOINT) return;

  function status(form, msg, isError) {
    var el = form.querySelector('.fv-notify-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('text-danger', !!isError);
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof Element) || !form.classList.contains('fv-notify')) return;
    e.preventDefault();

    var input = form.querySelector('input[type="email"]');
    var btn = form.querySelector('button[type="submit"]');
    if (!input || !input.value) return;

    if (btn) { btn.disabled = true; }
    status(form, 'Sending…');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: input.value })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      form.reset();
      status(form, 'Thanks — you’ll hear from us once, when it ships.');
    }).catch(function () {
      status(form, 'That didn’t go through. Try again, or email us instead.', true);
    }).then(function () {
      if (btn) { btn.disabled = false; }
    });
  });

  // Reveal the forms only once an endpoint exists, so a disabled build never
  // shows a control that cannot work.
  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('form.fv-notify'), function (f) {
      f.removeAttribute('hidden');
    });
  });
})();
