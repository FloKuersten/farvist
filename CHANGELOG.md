# Changelog

All notable changes to Farvist are documented here. Versions follow [SemVer](https://semver.org).

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
