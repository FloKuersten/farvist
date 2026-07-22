# Changelog

All notable changes to Farvist are documented here. Versions follow [SemVer](https://semver.org).

## [1.6.0] — 2026-07-22
**More for AI.** Three new AI-product components, a filename bar for code blocks, a streaming API, and the machine catalog now publishes the complete design-token list. 38 → **42 components**.
### Added
- **`.diff`** — the code-change view AI coding assistants live in: `.diff-header` (+ `.diff-stat-add/-del`), `pre.diff-body`, and `.diff-line` rows with `.diff-add` / `.diff-del` / `.diff-hunk`. The `+`/`−` characters stay in the content — meaning never rides on colour alone.
- **`.suggestions`** — the prompt-starter chip row (`.suggestion` on `<button>` or `<a>`), and **`.attachment`** — file pills for the composer (`-name`, `-meta`, `-remove`).
- **Named code blocks** — hand-author `.snippet-wrap` with a `.snippet-header` (`.snippet-title` + `.snippet-lang`) above `pre.snippet`; `farvist.js` now adds the copy button to hand-authored wraps too.
- **`Farvist.stream(el, text, {delay?, instant?})`** — types text word-by-word with the `.streaming` caret, re-runs `enhance()` at the end, returns a Promise, and renders instantly under `prefers-reduced-motion`.
- **Machine catalog:** `ai-context.json` gains a **`tokens`** section — every `--fv-*` design token with its default, extracted from the compiled CSS (the exact runtime-theming override surface); `llms-full.txt` gets the same as a "Design tokens" block. 3 new recipes (`command-palette`, `code-diff`, `prompt-suggestions`); new components + `Farvist.stream` in `farvist.cursorrules`.
- Docs: Diff view, Suggestions & attachments, Named code blocks sections + a live `Farvist.stream()` demo button.

## [1.5.0] — 2026-07-03
**Command palette (⌘K).** The launcher every modern dev tool and AI app has — now a first-class Farvist component (38 components total).
### Added
- **`.command`** — a ⌘K command menu on the native `<dialog>`: `.command-search` + `.command-input`, a `.command-list` of `.command-item`s (grouped with `.command-group`), `.command-empty` and a `.command-hint` footer. Type-to-filter, arrow-key navigation and a proper **combobox/listbox ARIA** pattern (`aria-activedescendant`) are wired by `farvist.js`.
- Opens via `data-fv-open="#cmd"`, the global **⌘K / Ctrl+K** shortcut, or **`Farvist.command('#cmd')`**. Each `.command-item` carries `data-fv-command` — a URL/anchor navigates; any other value fires an **`fv:command`** event for custom actions. `data-fv-keywords` adds search synonyms.
- Live demo in the docs (press ⌘K), a docs section, and the palette in `ai-context.json` / `llms-full.txt` / `farvist.cursorrules`.

## [1.4.0] — 2026-07-03
**Skins.** Five prebuilt theme packs on the `data-theme` attribute — `synthwave`, `cyber`, `noir`, `forest` and `dawn` (a warm light skin). One attribute, whole new product: thanks to v1.3's runtime wiring each skin is a ~10-token override block, so gradients, glows, meshes, orbs and hover states all follow.
### Added
- **`Farvist.theme('synthwave')`** — applies a skin and persists it (localStorage); `theme('dark')` restores the default. **`data-fv-theme-cycle="a,b,c"`** turns any button into a skin cycler.
- **Per-skin WCAG gate in CI** (`npm run check:skins`): every skin's readable-text tokens must be ≥4.5:1 on that skin's surfaces, parsed from the *compiled* CSS — it already caught (and fixed) a 4.40:1 miss in `dawn` before release.
- Skin switchers in the docs Theming section and the homepage "Make it yours" strip; `skins` catalog in `ai-context.json` / `llms-full.txt` / `farvist.cursorrules`.
- Add your own: extend the `$skins` Sass map, or ship a plain-CSS `[data-theme="yourbrand"]` block of `--fv-*` overrides.
### Notes
- Semantic colors (success/danger/warning) stay constant across skins by design — a red error stays red everywhere.

## [1.3.0] — 2026-07-03
**Bring your brand — runtime theming with zero build step.** Override `--fv-primary` / `--fv-accent` / `--fv-info` on `:root` and the *entire* framework re-brands live off the CDN: gradients, neon glows, mesh backdrops, the body orbs, button hover/active states, soft badge/chip/alert tints, spotlights and focus rings all derive from the custom properties via `color-mix()` now (already in the browser baseline). An AI assistant can re-brand a Farvist page by writing five lines of CSS.
### Added
- Optional per-color companions: `--fv-{color}-contrast` (text on filled components) for brands that flip between light and dark fills; `--fv-primary-text` documented as the readable-tint override.
- A **"Make it yours"** live re-brand demo on the homepage and a **"Bring your brand"** docs section; a `brand-theme` recipe + theming rules in `ai-context.json` / `llms-full.txt` / `farvist.cursorrules`.
- **CI gate** (`npm run check:theming`): the compiled CSS may not bake brand colors outside `--fv-*` definitions — runtime re-branding can't silently regress.
### Changed
- Derived shades convert 1:1 (`rgba(c,a)` ≡ `color-mix(in srgb, c A%, transparent)`; `color.mix` ≡ `color-mix`) — the default look is **pixel-identical** to v1.2 (verified by computed-style diff across 28 components; the only approximations are button hover/active shades, which match to the decimal in practice).
- Sass token maps (`$gradients`, `$glows`, `$bg-meshes`) now carry `var(--fv-*)`-based values; configuring colors via `@use ... with (...)` still works (the custom properties are emitted from your configured tokens).
- Bundle size *shrank*: 20.5 → 20.2 KB gzip (repeated `color-mix(in srgb, var(--fv-` compresses better than scattered hex).

## [1.2.0] — 2026-07-02
**Model output, styled.** v1.1 taught AI assistants to *write* Farvist; v1.2 makes Farvist the best framework for *displaying what models write*. Purely additive — 34 → **37 components**.
### Added
- **`.prose` / `.prose-sm`** — an opt-in typography scope for rendered LLM markdown (content-scale headings, lists, bare tables that scroll, images). Inside a `.message-bubble` it restores normal whitespace — bubbles keep `pre-wrap` for plain text, `.prose` is for rendered HTML.
- **`.tool-call`** — an agent's tool invocation as a compact glass card (`-header`, `-name`, `-status`, `-args`, `-result`) with `running/done/error` rail states; works as a `<div>` or a collapsible `<details>`. The status *text* carries the meaning — never colour alone.
- **`.reasoning`** — a collapsible "thinking" disclosure on native `<details>`/`<summary>` (keyboard + screen-reader accessible with zero JS).
- **Citations** — `.cite` superscript source chips + a `.sources` footnote list, the RAG-answer pattern.
- **`.streaming`** — a pulsing caret on a bubble while tokens arrive (static under `prefers-reduced-motion`); **`.message-actions`** — a hover/focus-revealed copy/vote row (always visible on touch).
- 3 new AI recipes (`assistant-markdown-reply`, `agent-tool-call-turn`, `rag-answer-with-citations`) in `ai-context.json` / `llms-full.txt`, a `.prose` rule in `farvist.cursorrules`, five new docs subsections, and the AI console template now streams a cited, tool-calling markdown answer.
- A bare `data-fv-copy` inside a chat `.message-actions` row now copies the message's bubble text, and **every** copy trigger (not just snippet buttons) flashes success visually and announces "Copied" to assistive tech.
### Fixed
- **Toast accent rails never rendered** — the glass mixin's `border` shorthand (declared after `border-left`) reset the 3px colored rail to 1px on every toast since v0.3. Toasts now show their variant rail.

## [1.1.0] — 2026-06-26
### Added
- **Built for AI discovery + use.** `robots.txt` now welcomes the AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot…); every page `<head>` links `/llms.txt`; the AI files are in the sitemap.
- The machine-readable catalog (`ai-context.json` + `llms-full.txt`) now enumerates **every icon** and adds **copy-paste recipes** for whole sections (navbar, hero, login-card, pricing-3up, chat-ui, dashboard-shell, contact-form).
- **`farvist.cursorrules`** + a paste-in "system prompt" (docs "Use Farvist with your AI" section + README) so any assistant generates correct Farvist with zero setup.
- **20 AI/chat/dev icons** (`bot, brain, message, message-dots, cpu, send, mic, stop, refresh, copy, thumbs-up/down, wand, paperclip, image, command, terminal, globe, database, link`) — the set is now **55**, with a full icon gallery in the docs.
### Changed
- `assets/logo.svg` wordmark now adapts to the viewer's colour scheme (`prefers-color-scheme`) instead of a hard-coded light fill — readable when embedded on light *or* dark pages.
- The AI console composer is wired to the new `send` / `paperclip` / `mic` icons.

## [1.0.0] — 2026-06-25
**Farvist is stable.** Public class names and the component API follow [SemVer](https://semver.org) from here — breaking changes mean a major bump.
### Added
- **CI quality gates** (GitHub Actions, on every push/PR): the Sass build, a "committed build artifacts are fresh" check, **stylelint**, a **bundle-size budget** (gzip ≤ 22 KB), and **axe-core accessibility** (via pa11y-ci) over the key pages. CI badge added to the README. (axe's `color-contrast` is excluded in CI — it can't evaluate gradient text / translucent glass over gradient backgrounds in headless; contrast is verified in-browser and via the `--fv-primary-text` palette.)
### Fixed
- `aria-label` on disabled pagination `<span>`s was ARIA-prohibited → now `aria-hidden`.
- Inline prose links are underlined (WCAG 1.4.1 — distinguishable without relying on colour).

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
