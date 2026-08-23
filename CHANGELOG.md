# Changelog

All notable changes to Farvist are documented here. Versions follow [SemVer](https://semver.org).

## [1.7.3] — 2026-08-02
Quality patch. An adversarial audit of v1.7.2 (15 agents across 7 dimensions, every finding reproduced in-browser before it was believed) turned up seven defects, four of them the same shape as the bug v1.7.2 had just fixed: a rule that quietly depends on something the cascade takes away.
### Fixed
- **The `hidden` attribute did nothing** on any component or utility that sets a `display` — `.chat`, `.toast`, `.badge`, `.btn`, every `.d-*` class, 42 components in all. Framework CSS is author CSS, so its `display` beats the UA's `[hidden] { display: none }` from any layer; `el.hidden = true` left the element on screen. The symptom had been patched three times in place (`.command-item[hidden]`, `.command-group[hidden]`, and the docs' own nav filter) without the cause being found. Now guarded once in `@layer reset` with `[hidden]:not([hidden='until-found']) { display: none !important }` — important declarations in the *first* layer outrank every later layer, so one rule covers everything. `until-found` is exempt so it stays revealable. `farvist-ai.css` gets the same guard scoped to its own class names, since an add-on must not ship a page-global rule.
- **The reduced-motion spinner froze.** `.spinner` carried `animation: … infinite !important` to survive the global reduced-motion cap — but among *important* declarations the earlier layer wins, so the reset layer's `animation-duration: 0.01ms !important` beat it and the ring stopped dead at 0°, reading as a hung app to exactly the users who opted into less motion. The exception now lives in the reset layer's own reduced-motion block, where `.spinner` simply out-specifies `*`. Verified spinning at 1.6s under emulated `prefers-reduced-motion: reduce`.
- **`.animate-float` silently disabled `.hover-lift` and `.card-glow`'s hover raise** — a running animation replaces the property it animates, and `fv-float` animated `transform`, the same property the hover lift uses. The homepage hero card, `examples/saas.html` and the aurora hero block all combine the three, so the documented "raise on hover" was dead on every one. `fv-float` now animates `translate`, which composes with `transform` instead of replacing it — the same split `.modal`/`.command` centering uses. Measured: hover now moves the hero card the documented 4px, and the bob still runs.
- **`.prose` leaked UA margins in `farvist-ai.css`** on a host page with no reset of its own — most visibly a 40px inline indent on *both* sides of every blockquote in rendered model output, plus phantom top margins on paragraphs, lists and code blocks. `.prose` set only `margin-bottom` and relied on the full build's reset for the other three sides; the AI build ships without one. Now sets the full margin box (a no-op in the full build), and `pre.snippet` gets the base `pre` margin it was missing. Both builds now measure identically on a bare host.
- **The theme toggle was undone on every navigation** once any skin had been used: `data-fv-theme-toggle` flipped the `data-theme` attribute directly without writing to storage, so the next page load restored the persisted skin over the user's explicit light choice — on nearly every page of the site, which ships the toggle in its navbar. It now routes through `Farvist.theme()`, the same persistence the skin API uses.
- **⌘K/Ctrl+K on an open palette wiped a half-typed query** (and threw `InvalidStateError` on the engines at our support floor, which reject `showModal()` on an open dialog). The shortcut now toggles the palette closed, `openCommand()` is guarded against re-opening, and `data-fv-open` pointing at a `.command` dialog routes through it too — previously that documented opener bypassed the query reset and reopened showing the last search's filtered list.
- **The "2.5 KB" JS companion claim was ~3x stale** — `assets/farvist.js` is 7.7 KB gzip (25.9 KB raw, and no minified build is shipped). Accurate back at v0.5.0, quoted in nine places since. Corrected in README, docs, the homepage and the file's own header.
### Changed
- The accessibility gate now covers **every page on the site** — 25 URLs, up from 9. The blog corpus quintupled in the AdSense remediation and none of the new posts, nor `/about/`, `/contact/`, `/terms/`, `/privacy/`, `/templates/`, `/themer/` or three of the seven examples, were ever audited. All 25 pass with zero violations.
- `scripts/gen-ai-compat.mjs`'s spec follows `.prose`'s switch to the `margin` shorthand. Its fail-loud check caught the change on the first rebuild — working exactly as designed.
### Notes
- Verified in headless Chrome: 14 checks for the fixes above (both builds where both apply), plus the full v1.7.2 modal suite re-run across 1280×900, 768×1024, 375×667, 667×375 and 320×640 — centering, over-tall modals and the backdrop-click hit test all still hold. `farvist-ai.min.css` grows 6.4 → 6.5 KB gzip for the scoped `[hidden]` guard and prose margins; the other builds are unchanged in size.
- Corrects one claim in the 1.7.2 notes below: that release also touched `dist/farvist-slim.css`, not only `dist/farvist.css`.

## [1.7.2] — 2026-08-02
### Fixed
- **`.modal` was never centered** — the other half of the bug 1.7.1 fixed in the command palette. A modal `<dialog>` is centered by `dialog { margin: auto }` in the *user-agent* stylesheet, which our own `@layer reset { * { margin: 0 } }` beats; `.modal` declared no `position` and no `margin`, so nothing in `@layer components` won those values back. Against the shipped 1.7.1 stylesheet at 1280×900 the docs modal rendered at `left: 5px, top: 18px` — flat in the top-left corner, on the page documenting the component. Now positioned explicitly on both axes (`position: fixed; top: 50%; left: 50%; margin: 0; translate: -50% -50%`), which also survives a host page's un-layered `* { margin: 0 }`. As with the palette, the offset uses `translate` rather than `transform` — the `fv-modal-in` keyframes own `transform` and would replace a transform-based offset for the duration of the open animation.
### Notes
- Verified in-browser (headless Chrome, 1280×900) against the real docs modal markup and against a bare host page with an un-layered `* { margin: 0 }`: centered in both, and centered mid-animation. `.modal` is not part of `farvist-ai.css` (the AI kit ships `.command`, not `.modal`), so that build is unaffected.
- Audited the rest of the framework for the same class of bug: `<dialog>`, `<hr>` and `[popover]` are the only elements Chromium's UA sheet gives *auto* margins. `hr` declares its own margins in `@layer base`, `[popover]` is unused, and no rule anywhere in the sheet targets a bare `dialog` type selector — `.modal` and `.command` were the only two, and both are now positioned explicitly.
- CSS-only release: `dist/farvist.css` and `dist/farvist-slim.css` gain the same four `.modal` positioning declarations; `farvist-ai.css` is byte-identical (the AI kit ships `.command`, not `.modal`). No JS, markup or token changes.

## [1.7.1] — 2026-07-29
Quality patch — an adversarial review of v1.7.0 (27 agents, findings independently reproduced before fixing) confirmed 21 defects, almost all in how the new `farvist-ai.css` add-on behaves on real host pages. All fixed and re-verified in-browser against real Tailwind v3 preflight, a bare light host, and the slim build.
### Fixed — farvist-ai.css standalone correctness
- **Naked code blocks**: the kit shipped the snippet component without the base `pre` chrome (it lives in the excluded typography partial) — `pre.snippet` in an assistant reply rendered as unstyled text overflowing the bubble, with the injected copy button sitting on the first code line. New AI-entry-only shims (`scss/_ai-shims.scss`) give `pre.snippet`, `.prose pre` and `.tool-call-result pre` their card chrome, scoped so host `<pre>`s are never touched. Same treatment for the missing `.prose code` / `kbd` chips, `.prose` list markers + heading weights + blockquote, and the farvist.js-injected `.table-responsive` / `.visually-hidden` helpers.
- **`color-scheme: dark` leaked to the host page** — dark scrollbars/native controls on light hosts, and a black canvas on hosts that never declare a body background. The add-on now neutralizes it (`:root { color-scheme: normal }`); the `data-theme` wrapper still themes the kit's own subtree.
- **Controls ignored the host font**: the excluded reset's `button/input/textarea { font: inherit }` is now shimmed for the kit's controls — no more Arial buttons on a system-ui page.
- **Tailwind v3 hosts gutted the kit**: v3's preflight is un-layered and beats every `@layer` rule — send button lost its gradient/padding, every glass border vanished, markdown lists lost their markers. New **`dist/farvist-ai-compat.css`** (~0.9 KB gzip, load after the Tailwind build) re-asserts exactly the properties preflight zeroes — *generated* from the compiled kit (`scripts/gen-ai-compat.mjs`) so it can't drift. Verified against real `tailwindcss@3.4.19` output. Tailwind v4 and Bootstrap hosts need nothing.
- **Command palette pinned to the corner** under host `* { margin: 0 }` resets (it relied on the UA's `dialog { margin: auto }`) — now positioned explicitly (`position: fixed; left: 50%; translate: -50% 0`), which also hardens the full build.
- **rem-sizing assumption documented**: the kit assumes a browser-default 16px root; `html { font-size: 62.5% }` hosts render it at ~62% scale (docs, README, scss header, demo page).
### Fixed — JS, a11y, tooling
- **`enhance()` on slim-build pages** injected a permanently visible unstyled Copy button under every `pre.snippet` — farvist.js now probes for the snippet CSS once and skips the button when it's absent (the slim build); docs now enumerate the 11 components slim excludes.
- **v1.7.0's unconditional `tabindex="0"`** on every code block (~37 permanent unlabeled tab stops on the docs page) reverted to conditional-on-overflow, now with `role="region"` + `aria-label` (per Deque) and re-checks on `document.fonts.ready`, load and resize so late font metrics can't hide an overflowing block from the keyboard. Full pa11y suite 6/6.
- **`brace-expansion` override**: forcing `^5.0.8` under `minimatch@3` was a live TypeError on any brace glob (v5 exports `{ expand }`, v1 was callable — only non-brace code paths kept `serve`/`pa11y-ci` working). The override stays (it's the only advisory-patched line) and a marker-guarded `postinstall` patch (`scripts/patch-brace-expansion.mjs`) re-exports v5's `expand` as a callable default, keeping the expansion caps. `npm audit`: 0; brace globs verified working — `*.{css,js}` matches and `{1..10^10}` clamps to 100k entries instead of OOM; verified from a clean `npm ci`.
- **CI freshness gate** now deletes generated files before rebuilding and asserts porcelain-clean, so orphaned or never-committed dist files fail the build (plain `git diff` missed both).
- Claims sweep: homepage JSON-LD `softwareVersion` (was still 1.6.1), demo-page filename mismatch, CHANGELOG slim filename, the "@layer means it can never override the host" overclaim (now: the host's *un-layered* CSS always wins shared properties), `npm run watch` now really watches all three entries, demo chat avatars are no longer `aria-hidden` (screen readers get speaker labels) and the ⌘K trigger has a descriptive name.
### Notes
- `dist/farvist.css` gains only the command-palette positioning fix vs v1.7.0 (21.3 KB gzip); the slim build is byte-identical. `farvist-ai.min.css` grows 6.0 → 6.4 KB gzip for the standalone shims. The demo (`examples/ai-addon.html`) now exercises the snippet component it previously avoided.

## [1.7.0] — 2026-07-29
**Builds.** One framework, three stylesheets — including a standalone AI-interface kit you can drop into a site that already uses Tailwind, Bootstrap or custom CSS. All three share the same class names, tokens and skins; the full build is byte-identical to v1.6.1.
### Added
- **`dist/farvist-ai.css`** (~6 KB gzip) — ONLY the AI-interface kit (chat, prompt composer, prose, tool calls, reasoning, diffs, snippets, suggestions, attachments, status, ⌘K palette) plus the tokens, skins, buttons, avatars, icons and toasts it needs. Deliberately no reset, typography, grid or utilities — the host page keeps its own; everything is emitted in `@layer` so the host's un-layered CSS always wins shared class names. Assumes `box-sizing: border-box` (Tailwind/Bootstrap set it); on a light host page wrap the UI in `data-theme="light"`.
- **`dist/farvist-slim.min.css`** (~19 KB gzip) — the framework without the 11 AI-interface components, for sites that never render AI conversations.
- **`examples/ai-addon.html`** — the AI kit dropped into a simulated non-Farvist product page (light theme, system font, its own CSS), also linked from the templates gallery.
- Per-build **size budgets in CI** (`check:size` now gates all three: 22 / 20 / 6.5 KB gzip), and the machine catalog (`ai-context.json` · `llms-full.txt` · `llms.txt` · `farvist.cursorrules`) now documents the builds — with gzip sizes measured from the real files at generation time so they can't drift.
### Notes
- The slim saving is honest but modest (~2 KB): the AI kit is efficient — most of Farvist's weight is the utility system. For a truly minimal sheet, `@use` only the Sass partials you need.


## [1.6.1] — 2026-07-28
Quality patch — every fix below was found by an adversarial review of v1.6 and verified with a concrete repro before fixing.
### Fixed
- **Light-theme legibility in `.diff`**: the +N/−N stats and @@ hunk lines used raw semantic colors that measured 1.6–2.9:1 on light glass — now darkened on light surfaces (5.7–8.1:1, AA) following the alerts/badges convention; the hunk line also lost an `opacity` that degraded re-brands.
- **`.diff-header` mobile overflow**: long unbreakable file paths pushed the stats out of the clipped header — the header now wraps.
- **`.attachment` truncation was inert** inside `.prompt-actions` (100% max-width resolves circularly in content-sized flex parents) — now capped at 16rem so the ellipsis actually triggers; `.prompt-actions` may also shrink/wrap instead of overflowing the composer.
- **`Farvist.stream()` race**: a second call on the same element now cancels the first (WeakMap run token) instead of interleaving garbled text; the animated path now REPLACES content like the reduced-motion path (same final DOM either way); `{delay: 0}` is honored (nullish check).
- **`.snippet-header` overlap** with the copy button's wider "Copied ✓" state; **`.diff-body` margin** survives `.prose pre` margins.
- **Machine catalog**: token extraction now fails loudly if the `:root` shape changes, and lists the 26 optional override hooks (`--fv-{color}-contrast`, `--fv-{color}-text`, …) it previously denied existed — including `--fv-primary-contrast`, which the same file's own recipes tell assistants to set.
### Changed
- `browserslist` now matches the documented support matrix (Chrome/Edge 111+, Safari 16.4+, Firefox 113+) — drops legacy `-moz-` prefixes for browsers below the baseline.
- Root `llms.txt` rewritten — it still described the v1.0-era framework ("30+ components", no skins/theming/palette/stream).


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
