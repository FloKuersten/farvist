# Response headers for farvist.com

Checked on 2026-10-13: `https://farvist.com/` answers through Cloudflare from an
nginx origin and sends **no** security headers (no HSTS, no
`X-Content-Type-Options`, no frame policy, no `Referrer-Policy`, no CSP).
HTTP → HTTPS already redirects with a 301. The site is deployed by the
maintainer's local `deploy.ps1`, so a `_headers` file in this repository would
not be honoured; the headers must be set on the origin or at the Cloudflare
edge. Either block below is the complete, intended set.

## Option A — nginx (origin)

Add inside the `server { }` block that serves farvist.com. The `always` flag
keeps the headers on 404 and other error responses.

```nginx
# Farvist — security response headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://www.googletagservices.com https://*.doubleclick.net https://*.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-src https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google; connect-src 'self' https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google" always;

# .well-known/skills/*.md currently serves as application/octet-stream
types { text/markdown md; }
```

## Option B — Cloudflare (edge)

Rules → Transform Rules → Modify Response Header → create a rule with the
expression `(http.host eq "farvist.com") or (http.host eq "www.farvist.com")`
and one "Set static" entry per header above. HSTS can alternatively be switched
on under SSL/TLS → Edge Certificates → HTTP Strict Transport Security.

## Why these values

| Header | Reason |
| --- | --- |
| `Strict-Transport-Security` | Browsers stop ever trying plain HTTP. `includeSubDomains` is safe: `www.farvist.com` already serves over HTTPS. Add `; preload` only after submitting the domain at hstspreload.org — it is hard to undo. |
| `X-Content-Type-Options: nosniff` | Stops a browser treating a mistyped file as a script or stylesheet. |
| `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` | No page on the site is meant to be embedded by other sites (the repository contains no iframes). Blocks clickjacking. |
| `Referrer-Policy` | Visitors' full URLs are not leaked to Google Fonts, AdSense or outbound links; the origin still is, which analytics on the receiving side expect. |
| `Permissions-Policy` | The site uses none of these device APIs; AdSense does not need them. |
| `Cross-Origin-Opener-Policy: same-origin-allow-popups` | Isolates the browsing context from cross-origin windows while letting ad or docs links open in a new tab. |
| CSP, **report-only first** | The pages contain inline `<script>` blocks and inline `style=""` everywhere (it is a CSS demo site), and AdSense injects scripts and iframes from many Google hosts, so the policy needs `'unsafe-inline'` and the Google allowlist. Even so it pins `base-uri`, forbids plugins, blocks framing and form posts to other origins, and blocks any script host not on the list. Run it as `Content-Security-Policy-Report-Only`, watch the DevTools console on `/`, `/docs/` (ads), `/themer/` and one example page, then rename the header to `Content-Security-Policy`. To drop `'unsafe-inline'` for scripts later, replace it with a `'sha256-…'` hash per inline block. |

## Verify after deploying

```bash
curl -sI https://farvist.com/ | grep -iE 'strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy|cross-origin-opener|content-security'
```

Every line above should come back; `https://securityheaders.com/?q=farvist.com`
gives the same check with a grade.
