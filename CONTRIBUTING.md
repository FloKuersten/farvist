# Contributing to Farvist

Thanks for your interest! Farvist is MIT-licensed and contributions are welcome.

## Getting set up

Use Node.js 24 for repository development and validation (including Puppeteer and PostCSS CLI). The dependency-free published markup CLI continues to target Node.js 18+.

```bash
npm ci           # locked development dependencies
npm run dev      # all three builds (full/slim/ai), expanded + minified + prefixed,
                 # plus farvist-ai-compat.css and the AI catalog. Never hand-edit
                 # dist/, ai-context.json or llms-full.txt — they are generated.
npm run watch    # rebuild on save
npm run check:safety  # CLI input handling, disabled actions, clipboard and text rendering
```

The CI workflow runs the full quality suite and a production dependency audit. Run `npm audit` separately to review development-tool advisories; the [validation report](docs/VALIDATION.md) records known unresolved findings. Keep the `serve` compression override until its pinned dependency includes the upstream fix.

## Project layout

Everything is generated from design tokens — change the maps, not the output.

- `scss/abstracts/_variables.scss` — the source of truth (colors, spacing, type, glass, gradients, meshes…)
- `scss/abstracts/_functions.scss` / `_mixins.scss` — helpers (`spacer()`, `contrast-color()`, `glass()`, `media-up()`)
- `scss/base` · `scss/layout` · `scss/components` · `scss/utilities` — the layers
- `scss/farvist.scss` — entry point (loaded in cascade order)

## Guidelines

- **Token-first:** add a key to a map (e.g. `$theme-colors`) rather than hand-writing per-color rules.
- **Modern Sass:** use `@use`/`@forward` (no `@import`), `math.div`, and the `sass:color` module.
- **Zero warnings:** `npm run dev` must compile clean.
- **Accessible:** keep `:focus-visible` rings, `prefers-reduced-motion` guards, and WCAG-safe contrast in both themes.
- **Theme-aware:** reference `--fv-*` custom properties so components work in dark *and* light.

## Pull requests

1. Fork and branch from `main`.
2. Make the change, run `npm run dev`, and confirm the demo (`index.html`) still renders.
3. Add your entry to `CHANGELOG.md` under a new dated version heading (the file has no "Unreleased" section — every entry is a released version).
4. Open a PR describing the change and the reasoning.

Bug reports and feature ideas are equally welcome via Issues.
