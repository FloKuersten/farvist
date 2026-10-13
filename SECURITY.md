# Security policy

Farvist is a CSS framework with a small optional JavaScript companion
(`assets/farvist.js`) and a dependency-free CLI (`npx farvist check`). This page
says what is covered, how to report a problem privately, and what to expect.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest 1.x release on npm | Yes |
| Older 1.x releases | Please upgrade; fixes ship in the latest release only |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

- Preferred: [report privately on GitHub](https://github.com/FloKuersten/farvist/security/advisories/new)
  (private vulnerability reporting is enabled for this repository).
- Email: office@kuersten.dev
- Machine-readable: https://farvist.com/.well-known/security.txt

Include the affected file or page, a reproduction, and the impact you see. You
will get an acknowledgement within three working days. A fix for a confirmed
high-severity problem is targeted within 14 days and ships as a patch release
with a CHANGELOG entry; the advisory is published once the fix is on npm.

## Scope

In scope:

- The npm package `farvist`: `dist/*.css`, `scss/`, `assets/farvist.js` and
  the `npx farvist check` CLI (`bin/farvist.mjs`).
- The website https://farvist.com and its agent-facing files (`llms.txt`,
  `ai-context.json`, `.well-known/skills/`).
- The GitHub Actions workflows in this repository.

Out of scope:

- The pages under `examples/` and `templates/` are canned, backend-less demos.
- Advisories in development-only dependencies. They are tracked in
  [docs/VALIDATION.md](docs/VALIDATION.md) and cannot reach the published
  package, which has no runtime dependencies.

## How the project is hardened

- The published package has zero runtime dependencies; CI audits that this
  stays true on every push.
- `assets/farvist.js` writes untrusted text through `textContent` only and
  contains no `innerHTML` or other HTML sink, so it runs under a strict
  Content Security Policy and Trusted Types. Skin names read back from
  `localStorage` are validated before they touch the document.
- The CLI opens regular files only, caps every read at 5 MB, resolves
  stylesheets by relative path only and detects symlink loops
  (`scripts/check-safety.mjs` keeps these behaviours under test).
- Workflows run with a read-only token, pin every action to a commit SHA and do
  not persist checkout credentials. CodeQL runs on every push and weekly;
  Dependabot keeps actions and dev dependencies current; dependency review
  blocks pull requests that add a vulnerable package.
- Releases publish from GitHub Actions through npm trusted publishing, so no
  npm token exists and every version carries a provenance attestation
  (see [PUBLISHING.md](PUBLISHING.md)).
- Recommended response headers for farvist.com are documented in
  [docs/SECURITY-HEADERS.md](docs/SECURITY-HEADERS.md).
