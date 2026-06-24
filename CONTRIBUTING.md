# Contributing to Farvist

Thanks for your interest! Farvist is MIT-licensed and contributions are welcome.

## Getting set up

```bash
npm install      # Dart Sass
npm run dev      # build dist/farvist.css + dist/farvist.min.css
npm run watch    # rebuild on save
```

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
3. Update `CHANGELOG.md` under "Unreleased".
4. Open a PR describing the change and the reasoning.

Bug reports and feature ideas are equally welcome via Issues.
