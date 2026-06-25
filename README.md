# Farvist <span>· glass edition</span>

[![npm](https://img.shields.io/npm/v/farvist?color=6d4af5)](https://www.npmjs.com/package/farvist)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/farvist?color=22d3ee)](https://bundlephobia.com/package/farvist)
[![license](https://img.shields.io/badge/license-MIT-e879f9)](LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-0-34d399)

A lightweight, **Sass-powered CSS framework** with a futuristic, frosted-glass aesthetic — a customizable alternative to Bootstrap and Tailwind. Every value is a design token in a Sass map, and the utility classes are **generated automatically** with `@for` and `@each` loops.

- 🪟 **Glassmorphism** — frosted `backdrop-filter` surfaces, translucent fills, inner highlights and deep shadows on every component.
- 🌈 **Neon & gradients** — gradient buttons, gradient text, and colored glow utilities generated from token maps.
- 🌌 **Background library** — mesh gradients, patterns, spotlights and fade-masks in one class (`.bg-mesh-aurora`, `.bg-grid`, `.bg-spotlight`, `.bg-fade`). A free feature Tailwind and Bootstrap make you hand-roll.
- 🌗 **Dark & light themes** — dark "space" theme by default; flip `data-theme="light"` on `<html>` to retheme at runtime via `--fv-*` custom properties.
- ⚙️ **Auto-generated utilities** — spacing, display, flex, color, glow, gradient, sizing and more, produced by loops instead of hand-writing hundreds of rules.
- 🧩 **30+ glass components** — buttons, badges, alerts, cards, forms, navbar, plus modal, dropdown, tabs, accordion, tooltip, toast, progress, spinner, skeleton, switch, avatar, breadcrumb, pagination, table and chips.
- 🎨 **Assets included** — a 35-icon SVG set (`currentColor`-driven), decorative SVGs (mesh, blob, grid, dots, logo) and a 2.5 KB optional JS companion for the interactive bits.
- 🖼️ **Premade templates** — a glass dashboard and a copy-paste block gallery in `examples/`.
- 📐 **12-column flexbox grid** with responsive columns and offsets.
- 🪶 **~20 KB gzipped** (127 KB minified) — and shrinks further when you trim the token maps.
- 🦾 **Modern & accessible** — `@use`/`@forward` modules (no deprecated `@import`), `:focus-visible` rings, `prefers-reduced-motion` support, and a `@supports` fallback for browsers without `backdrop-filter`.

---

## Quick start

### Install from npm

```bash
npm install farvist
```

Import the CSS (and the optional 2.5 KB JS) through your bundler:

```js
import 'farvist/dist/farvist.min.css';
import 'farvist/assets/farvist.js'; // optional — modals, tabs, toasts, theme toggle
```

Or pull in the Sass source to theme it from the token maps (with `node_modules` on your Sass load path):

```scss
@use 'farvist/scss/farvist';
```

### Use the compiled CSS

Via CDN (no build step — live on jsDelivr and unpkg):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/farvist/dist/farvist.min.css" />
<!-- optional 2.5 KB companion for modals, tabs, toasts, theme toggle -->
<script src="https://cdn.jsdelivr.net/npm/farvist/assets/farvist.js" defer></script>
```

Or use the local build:

```html
<link rel="stylesheet" href="dist/farvist.css" />
```

The framework defaults to the **dark glass theme**. Open `index.html` for a full live demo (with a dark/light toggle). For best results give the page a rich background — Farvist paints radial "orbs" behind the content so the glass has something to blur.

### Build from source

You need [Node.js](https://nodejs.org). Dart Sass is pulled in as a dev dependency.

```bash
npm install        # install Dart Sass
npm run dev        # build dist/farvist.css (expanded) + dist/farvist.min.css (minified)
npm run watch      # rebuild on save
```

| Script              | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run build`     | Compile expanded `dist/farvist.css`       |
| `npm run build:min` | Compile minified `dist/farvist.min.css`   |
| `npm run dev`       | Both of the above                       |
| `npm run watch`     | Recompile on every change               |

---

## Theming

### Dark / light at runtime

The whole system is driven by `--fv-*` CSS custom properties. The default `:root` is the dark theme; a `[data-theme="light"]` block overrides the surface variables. Toggle it with one line of JS:

```js
document.documentElement.setAttribute('data-theme', 'light'); // or remove it for dark
```

Components reference the variables (`--fv-body-bg`, `--fv-glass-bg`, `--fv-glass-border`, `--fv-muted`, …) so they retheme instantly — no recompile.

### Re-theme at build time

Because everything is a token, you can recolor the whole framework by configuring the module:

```scss
// my-theme.scss
@use 'farvist/scss/farvist' with (
  $primary:    #00e0ff,   // your neon
  $accent:     #ff4dd2,
  $glass-blur: 22px,
  $border-radius: 1rem
);
```

Or edit the maps directly in [`scss/abstracts/_variables.scss`](scss/abstracts/_variables.scss):

```scss
$theme-colors: (primary, secondary, success, danger, warning, info, accent, light, dark);
$spacers:      (0 … 8);                 // drives .m-*/.p-*
$font-sizes:   (xs … 5xl);              // drives .fs-*
$gradients:    (primary, accent, sunset, aurora);   // drives .bg-gradient-*, .btn-gradient-*, .text-gradient-*
$glows:        (primary, accent, info, success, danger, warning);  // drives .glow-*
$grid-breakpoints: (xs:0, sm:576, md:768, lg:992, xl:1200, xxl:1400);
```

Add a key to `$theme-colors` and you instantly get `.btn-*`, `.badge-*`, `.alert-*`, `.text-*`, `.bg-*`, `.border-*` for it — that's the payoff of generating from maps.

**Want it smaller?** Remove a breakpoint from `$grid-breakpoints` or a step from `$spacers` and recompile — the generators emit fewer classes instantly.

---

## How the generators work

This is what the project is really about. Two Sass loops do the heavy lifting.

### `@for` — numeric scales

The 12-column grid and the opacity scale are produced by counting:

```scss
@for $i from 1 through $grid-columns {
  .col-#{$i} {
    flex: 0 0 auto;
    width: math.percentage(math.div($i, $grid-columns));
  }
}
// → .col-1 { width: 8.333% } … .col-12 { width: 100% }
```

### `@each` — walking the token maps

Spacing utilities come from **nested** `@each` loops over breakpoints × properties × scale × sides:

```scss
@each $bp in map.keys($grid-breakpoints) {
  $infix: breakpoint-infix($bp);               // '' , '-sm', '-md', …
  @include media-up($bp) {
    @each $prop, $abbrev in (margin: 'm', padding: 'p') {
      @each $size, $length in $spacers {
        @each $side, $targets in $spacing-sides {
          .#{$abbrev}#{$side}#{$infix}-#{$size} { /* … */ }
        }
      }
    }
  }
}
// → .m-0, .mt-3, .px-4, .py-lg-0, .me-2, … (the full responsive matrix)
```

The glass look itself is a mixin reading runtime variables, so dark/light just works:

```scss
@mixin glass($strong: false) {
  background-color: var(--fv-glass-bg);
  backdrop-filter: blur(var(--fv-glass-blur)) saturate(var(--fv-glass-saturate));
  border: 1px solid var(--fv-glass-border);
  box-shadow: var(--fv-shadow-lg), inset 0 1px 0 rgba(255,255,255,.1);
}
```

---

## Class reference (cheatsheet)

### Glass & effects

| Class | Description |
| --- | --- |
| `.glass`, `.glass-strong` | Frosted surface (light/strong) |
| `.glow`, `.glow-{primary\|accent\|info\|success\|danger\|warning}` | Neon glow shadow |
| `.text-glow` | Neon halo on text |
| `.bg-gradient-{primary\|accent\|sunset\|aurora}` | Gradient fill |
| `.text-gradient`, `.text-gradient-{name}` | Gradient-clipped text |
| `.bg-animated` | Slowly drifting gradient (pair with `.bg-gradient-*`) |
| `.hover-lift`, `.animate-float` | Motion helpers |

### Backgrounds

| Class | Description |
| --- | --- |
| `.bg-mesh-{aurora\|sunset\|ocean\|nebula}` | Multi-orb mesh gradient backdrop |
| `.bg-mesh` | Default mesh (aurora) |
| `.bg-grid`, `.bg-graph`, `.bg-dots`, `.bg-lines`, `.bg-noise` | Theme-aware patterns |
| `.bg-pattern-sm`, `.bg-pattern-lg` | Pattern tile-size modifiers |
| `.bg-spotlight`, `.bg-spotlight-{color}` | Radial glow backdrop |
| `.bg-fade`, `.bg-fade-b`, `.bg-fade-x` | Fade a background to the edges. Uses `mask-image`, which fades children too — put it on a dedicated decorative layer, and best with the transparent patterns (`.bg-grid.bg-fade`) |
| `.bg-drift` | Slowly pan a mesh/gradient (reduced-motion safe) |

Mesh stops come from the `$bg-meshes` map and reference your theme colors, so they restyle with the palette.

### Components

**Buttons** — `.btn` + `.btn-{color}` / `.btn-outline-{color}` / `.btn-gradient-{name}` / `.btn-glass` / `.btn-link` / `.btn-sm` / `.btn-lg` / `.btn-block`

**Badges** — `.badge` + `.badge-{color}` / `.badge-soft-{color}` / `.badge-pill`

**Alerts** — `.alert-{color}` with `.alert-heading` / `.alert-link`

**Cards** — `.card` (`.card-glow`, `.card-solid`, `.card-header/-body/-footer`, `.card-title/-subtitle/-text`, `.card-img-top`)

**Forms** — `.form-label` `.form-control` `.form-select` `.form-text` · `.form-check` (`.form-check-input` `.form-check-label`) · `.input-group` (`.input-group-text`) · validation `.is-valid`/`.is-invalid` + `.valid-feedback`/`.invalid-feedback`

**Nav** — `.navbar` `.navbar-brand` `.navbar-nav` `.nav-link`

**Modal** (native `<dialog>` + JS) — `.modal` (`.modal-header/-title/-body/-footer/-close`)

**Dropdown** (native `<details>`) — `.dropdown` `.dropdown-menu` (`.dropdown-menu-end`) `.dropdown-item` `.dropdown-divider`

**Tabs** (JS) — `.tabs` `.tab` `.tab-panel` (toggle with `data-fv-tab="#panel"`)

**Accordion** (native `<details>`, no JS) — `.accordion-item` `.accordion-body`

**Tooltip** (CSS-only) — `data-tooltip="text"` on any element

**Toast** (JS) — `.toast` `.toast-{color}` (`.toast-title/-message/-close`), spawn via `Farvist.toast()`

**Table** — `.table` `.table-hover` `.table-striped` `.table-responsive`

**Progress** — `.progress` `.progress-bar` `.progress-{color}` `.progress-striped` `.progress-animated`

**Spinner** — `.spinner` `.spinner-{sm|lg|color}` · `.spinner-dots`

**Skeleton** — `.skeleton` `.skeleton-{text|title|avatar|btn}`

**Switch** — `.switch` `.switch-track` `.switch-thumb`

**Avatar** — `.avatar` `.avatar-{sm|lg|xl|color}` · `.avatar-status[-busy|-away]` · `.avatar-group`

**Chip** — `.chip` `.chip-{color}` `.chip-close`

**Breadcrumb / Pagination** — `.breadcrumb` `.breadcrumb-item` · `.pagination` `.page-item` `.page-link`

**Stepper** — `.stepper` `.step` (`.is-active` / `.is-done`) `.step-dot` `.step-label`

**Timeline** — `.timeline` `.timeline-item` (`.timeline-{color}`) `.timeline-marker` `.timeline-content`

**Segmented** (radio, no JS) — `.segmented` + `input`/`label` pairs · **Rating** — `.rating` (+ `.rating-empty`)

**Stat** — `.stat-value` `.stat-label` `.stat-trend` (`-up`/`-down`) · **Range** — `.form-range`

**Empty state** — `.empty-state` `.empty-state-icon/-title/-text` · **List group** — `.list-group` `.list-group-item`

**Callout** — `.callout` `.callout-{color}` `.callout-title`

Theme colors: `primary · secondary · success · danger · warning · info · accent · light · dark`.

### Icons, assets & JavaScript

A 35-icon SVG sprite ships in `assets/icons/`. Icons inherit `currentColor`, so they take the text color (and any `.text-glow`):

```html
<svg class="icon"><use href="assets/icons/farvist-icons.svg#i-bell"/></svg>
<svg class="icon icon-lg text-accent"><use href="assets/icons/farvist-icons.svg#i-star"/></svg>
```

Sizes: `.icon` (1em) · `.icon-sm` · `.icon-lg` · `.icon-xl`. Decorative SVGs (`logo.svg`, `patterns/mesh.svg`, `blob.svg`, `grid.svg`, `dots.svg`) live in `assets/`, and theme-aware CSS patterns are built in: `.bg-grid` `.bg-dots` `.bg-noise`.

The optional **2.5 KB** companion powers the interactive components — drop it in with `defer`:

```html
<script src="assets/farvist.js" defer></script>
```

It wires modals (`data-fv-open="#id"` / `data-fv-dismiss`), tabs (`data-fv-tab`), theme toggling (`data-fv-theme-toggle`), dropdown outside-click close, and toasts:

```js
Farvist.toast({ title: 'Saved', message: 'All good.', variant: 'success', timeout: 4000 });
```

Everything else (accordion, dropdown, tooltip, switch, progress…) is pure CSS and needs no JS.

### Layout

`.container` / `.container-fluid` · `.row` · `.col`, `.col-auto`, `.col-{1–12}`, `.col-{sm…xxl}-{1–12}` · `.offset-{0–11}` · `.g-* .gx-* .gy-*`

### Spacing — `{property}{sides}{-breakpoint}-{size}`

`m` = margin, `p` = padding · sides `t e b s x y` (or blank for all) · size `0–8` · optional `-sm…-xxl` · negatives `m-n3` · centering `mx-auto`

```
.mt-3   .px-4   .p-0   .m-md-5   .py-lg-0   .mx-auto   .mb-n2
```

### Display, flex, type, color, borders, sizing, position

`.d-{none|block|flex|grid|…}` (responsive) · `.flex-{row|column|wrap}` `.justify-content-*` `.align-items-*` `.gap-*` · `.h1`–`.h6` (heading scale on any element) `.fs-{xs…5xl}` `.fw-{light…black}` `.text-{start|center|end}` `.text-truncate` · `.text-{color|muted|body}` `.bg-{color|surface}` `.border-{color}` · `.border` `.rounded-{sm…2xl|pill|circle}` `.shadow-{sm…xl}` · `.w-{25…100}` `.vh-100` · `.position-*` `.sticky-top` `.fixed-top` `.z-*` `.opacity-{0…100}`

---

## For AI assistants

Farvist ships machine-readable context so AI coding tools (Cursor, Claude, Copilot) generate correct markup:

- [`llms.txt`](https://farvist.com/llms.txt) — concise index (the [llms.txt](https://llmstxt.org) convention).
- [`llms-full.txt`](https://farvist.com/llms-full.txt) — every convention + component class with a copy-paste example; paste it into your assistant.
- [`ai-context.json`](https://farvist.com/ai-context.json) — JSON catalog of components, utility families and conventions.

These are regenerated from the compiled CSS on every build (`npm run build:ai`) and shipped in the npm package.

## Project structure

```
scss/
├── farvist.scss               # entry point — @use's every layer in cascade order
├── abstracts/               # no CSS output — tokens + tools
│   ├── _variables.scss      #   design tokens incl. glass/glow/gradient maps
│   ├── _functions.scss      #   color(), spacer(), breakpoint helpers, YIQ contrast
│   ├── _mixins.scss         #   media-up(), glass(), button-variant(), visually-hidden()
│   └── _index.scss          #   @forward barrel  →  @use '../abstracts' as *
├── base/                    # reset, :root vars + dark/light themes, typography
├── layout/                  # container + 12-col flexbox grid
├── components/              # 20 partials: buttons … modal, dropdown, tabs, toast, …
└── utilities/               # generated helper classes
    ├── _spacing.scss        #   the nested-@each spacing matrix
    ├── _utilities.scss      #   display, flex, text, color, border, sizing, …
    ├── _effects.scss        #   glass, glow, gradient, motion + @supports
    └── _backgrounds.scss    #   mesh gradients, patterns, spotlights, fade-masks
assets/
├── farvist.js            # 2.5 KB optional companion (modal, tabs, toast, theme)
├── logo.svg                 # wordmark + gradient mark
├── icons/farvist-icons.svg   # 35-icon sprite (currentColor)
└── patterns/                # mesh, blob, grid, dots decorative SVGs
examples/
├── dashboard.html           # full glass dashboard template
└── blocks.html              # copy-paste sections (hero, pricing, auth, …)
dist/                        # compiled output (committed for convenience)
index.html                   # live demo with a dark/light toggle
```

The architecture follows the **7-1 pattern** and Sass's modern module system: each partial pulls in what it needs with `@use '../abstracts' as *;`.

---

## Browser support

Modern evergreen browsers. The shipped `dist/*.css` is **autoprefixed** (via PostCSS + Autoprefixer against the
`browserslist` in `package.json`), so Safari's `-webkit-backdrop-filter`, Firefox's `-moz-` flex-gap/appearance,
and other vendor prefixes are added for you.

**Baseline (everything works): Chrome/Edge 111+, Safari 16.4+, Firefox 113+** (~early 2023) — set by `@layer`
(Mar 2022) and `color-mix()`. Below that it degrades gracefully:

| Feature | Needs | Below baseline |
| --- | --- | --- |
| Cascade layers (`@layer`) | Chrome 99 · Safari 15.4 · Firefox 97 | utilities still win via source order |
| `backdrop-filter` glass | Chrome 76 · Safari 9 (`-webkit-`) · Firefox 103 | opaque surface via `@supports` fallback |
| `color-mix()` (status pulse ring) | Chrome 111 · Safari 16.2 · Firefox 113 | dot shows, ring just doesn't animate |
| `field-sizing` (auto-grow textarea) | Chrome 123+ | fixed min/max-height |

Building from the SCSS source instead of the shipped CSS? Run Autoprefixer on your output, or rely on the
`dist/` files.

## License

MIT — do whatever you like.
