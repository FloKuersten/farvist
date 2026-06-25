# Changelog

All notable changes to Farvist are documented here. Versions follow [SemVer](https://semver.org).

## [0.11.0] — 2026-06-25
### Added
- **Copy-to-clipboard** — `pre.snippet` code blocks get a copy button automatically (and any `[data-fv-copy]` element works); `Farvist.copy(text)` is exposed on the API.
- **Docs scrollspy** — the sidebar highlights the section you're currently reading.
- **Full component docs** — every one of the 34 components now has a dedicated docs section with a live example (new Feedback, Navigation, Data display, Indicators, Inputs, and Icons & accordion groups).
- **Homepage**: a "Get started" install block (CDN + npm) and an honest Farvist-vs-Bootstrap-vs-Tailwind comparison table.
### Fixed
- **Social previews** — `og:image` referenced `assets/og-image.png`, which never existed (only the `.svg` did). Generated the real 1200×630 PNG so link previews render on every platform.

## [0.10.0] — 2026-06-25
### Added
- **Autoprefixer build step.** The shipped `dist/*.css` is now run through PostCSS + Autoprefixer (`npm run build:prefix`, chained into `build:all`) against a `browserslist` target, adding the vendor prefixes the hand-written source missed — `-webkit-user-select`, `-moz-column-gap` (Firefox flex-gap), `-moz-appearance`, `-moz-placeholder` — while preserving Safari's required `-webkit-backdrop-filter`.
- A documented **browser-support matrix** (README + docs): baseline Chrome/Edge 111+, Safari 16.4+, Firefox 113+ (~early 2023), with graceful degradation for `@layer`, `backdrop-filter`, `color-mix()` and `field-sizing`.

## [0.9.0] — 2026-06-25
### Changed
- **CSS cascade layers.** The framework is now wrapped in `@layer reset, base, layout, components, utilities`, so utilities beat components by **layer order instead of `!important`** — 45 utility `!important` declarations removed (54 → 9; the rest are intentional: form validation, reduced-motion, visually-hidden/skip-link).
- **Easier overrides (one behavior change):** because Farvist's styles are now layered, any CSS you write *outside* a layer (plain author CSS) — and inline styles — beat the framework without `!important`. This is the intended upgrade. Requires a modern browser (Chrome/Edge 99, Safari 15.4, Firefox 97 — Mar 2022).

## [0.8.0] — 2026-06-25
### Added
- **AI UI kit** — three components for AI products, built on the glass system:
  - **Chat** (`.chat`, `.message`, `.message-out`, `.message-bubble`, `.message-body`, `.message-meta`) + a `.typing` indicator.
  - **Prompt composer** (`.prompt`, `.prompt-field` auto-sizing textarea, `.prompt-actions`, `.prompt-meta`).
  - **Agent status** (`.status` + `.status-online/busy/idle/error`) with a pulsing "live" dot.
- A fifth template — **`examples/ai-console.html`**, a full glass chat console with a dynamic-message demo.
- A docs **"Chat & AI kit"** section.
- **AI-assistant enablement**: `llms.txt` (the llms.txt convention), `llms-full.txt` (full paste-in context: conventions + every component's classes), and `ai-context.json` (machine-readable catalog) — generated from the compiled CSS by `npm run build:ai` (wired into `build:all`), served at `farvist.com/*`, and shipped in the npm package.

## [0.7.0] — 2026-06-25
### Added
- **Accessibility pass** — most ARIA is now applied automatically by `farvist.js`:
  - Forms — `.is-invalid` gets `aria-invalid` and is linked to its `.invalid-feedback` via `aria-describedby`.
  - Toasts — announced via an `aria-live` region; `variant:'danger'` is assertive (`role="alert"`), others polite (`role="status"`).
  - Tooltips — the `data-tooltip` text is exposed to screen readers and shows on keyboard focus.
  - `aria-current` on the active breadcrumb / stepper / pagination item.
  - Progress bars get a fallback accessible name; wide tables and long code blocks become keyboard-scrollable when they overflow.
- **`.skip-link`** utility (hidden until focused) + skip links on every page.
- A documented **Accessibility** section in the docs.
### Changed
- New theme-aware **`--fv-primary-text`** token — a lighter primary for readable text on the dark surface. Plain links, `.btn-link` and `.btn-outline-primary` now use it, fixing WCAG AA contrast. Verified: **0 axe-core violations** across every page in both themes.
- `.chip-close` and `.nav-link` gained `:focus-visible` rings.
### Fixed
- The JS companion is now exposed as `window.Farvist` (with `Farvistrap` kept as an alias) — `Farvist.toast(...)` calls in the demos previously threw a ReferenceError.

## [0.6.0] — 2026-06-25
### Added
- **Mobile navbar**: the navbar collapses to a hamburger below `lg` (`.navbar-toggle` + a `farvist.js` toggle) and expands to the horizontal bar from `lg` up. Esc and tapping a link close it.
- **Fluid typography**: the large type scale (`3xl`/`4xl`/`5xl`, and the headings built on them) now uses `clamp()`, so display text down-scales gracefully on phones.
- `.list-unstyled` / `.list-inline` list utilities.
- A fourth template — a portfolio / personal site (`examples/portfolio.html`) — and a Pro landing page at `/pro/`.
### Changed
- Tabs scroll horizontally on mobile instead of wrapping; the stepper stacks vertically on phones.
- Roomier container gutter on phones (1rem); `.btn-sm` keeps a 44px touch target on coarse pointers; dropdown menus are clamped to the viewport width.
### Fixed
- Eliminated horizontal overflow at mobile widths across the demo, templates, docs, marketing and Pro pages (verified at 375px).

## [0.5.0] — 2026-06-24
### Added
- 9 components: stepper, timeline, segmented control, rating, stat, empty-state, list-group, callout and a styled range input (`.form-range`).
- A third template: a complete SaaS landing page (`examples/saas.html`).
- SEO/AEO layer: `robots.txt`, `sitemap.xml`, `SoftwareApplication` + `FAQPage` JSON-LD, canonical tags, and a custom glass 404 page.

## [0.4.0] — 2026-06-24
### Added
- **Backgrounds library** (free): `.bg-mesh-{aurora|sunset|ocean|nebula}` mesh gradients, `.bg-grid` / `.bg-graph` / `.bg-dots` / `.bg-lines` / `.bg-noise` patterns, `.bg-spotlight[-color]`, `.bg-fade*` masks and `.bg-drift` animation — all token-driven and theme-aware.
- A documentation site at `/docs/`.
### Fixed
- Patterns now use a dedicated `--fv-bg-pattern` ink token so they're visible in the light theme.
- Removed dead `.bg-spotlight-light` / `.bg-spotlight-dark` variants.

## [0.3.0] — 2026-06-24
### Added
- 15 components: modal, dropdown, tabs, accordion, tooltip, toast, progress, spinner, skeleton, switch, avatar, chip, breadcrumb, pagination, table.
- A 35-icon SVG sprite and a ~2.5 KB optional JS companion (`assets/farvist.js`).
- Premade templates: a glass dashboard and a copy-paste block gallery.
### Fixed
- `contrast-color()` now uses true WCAG relative luminance; light-theme contrast overrides for alerts/badges/chips.

## [0.2.0] — 2026-06-24
### Changed
- "Glass edition": dark glassmorphism redesign with a runtime `data-theme="light"` light theme, neon glow, and gradient utilities.

## [0.1.0] — 2026-06-24
### Added
- Initial release: token-driven utilities (`@for`/`@each`), 12-column grid, core components, and the Sass module architecture.
