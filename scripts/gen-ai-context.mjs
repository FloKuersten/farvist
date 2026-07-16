// =============================================================================
// Farvist · scripts/gen-ai-context.mjs
// Generates two AI-assistant artifacts from the compiled CSS + curated metadata:
//   - ai-context.json  (machine-readable catalog)
//   - llms-full.txt    (single paste-into-your-AI context)
// No dependencies. Run: node scripts/gen-ai-context.mjs  (wired into build:all)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const css = readFileSync(join(root, 'dist/farvist.css'), 'utf8');

// All distinct class selectors actually present in the compiled CSS.
const classes = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))].sort();

// Icon names from the SVG sprite.
const sprite = readFileSync(join(root, 'assets/icons/farvist-icons.svg'), 'utf8');
const iconNames = [...new Set([...sprite.matchAll(/id="(i-[\w-]+)"/g)].map((m) => m[1]))].sort();

// Skin names from the compiled [data-theme] blocks ('light' is the built-in
// light theme, not a skin).
const skinNames = [...new Set([...css.matchAll(/\[data-theme=['"]?([\w-]+)['"]?\]/g)].map((m) => m[1]))]
  .filter((n) => n !== 'light').sort();

// Copy-paste recipes — whole sections an assistant can assemble pages from.
const recipes = [
  { name: 'navbar', html: '<nav class="navbar sticky-top"><a class="navbar-brand" href="#">◆ Brand</a><button class="navbar-toggle" data-fv-nav-toggle aria-label="Menu"><span class="navbar-toggle-icon"></span></button><ul class="navbar-nav" id="nav" role="list"><li><a class="nav-link active" href="#">Home</a></li><li><a class="nav-link" href="#">Docs</a></li><li><button class="btn btn-glass btn-sm" data-fv-theme-toggle aria-label="Theme">\u{1F319}</button></li></ul></nav>' },
  { name: 'hero', html: '<header class="container text-center" style="padding-block:6rem"><h1 class="fs-5xl fw-black mb-3">Build something <span class="text-gradient">glassy</span></h1><p class="fs-xl text-muted mx-auto mb-5" style="max-width:40rem">A one-line tagline that sells it.</p><div class="d-flex gap-3 justify-content-center flex-wrap"><a class="btn btn-gradient-primary btn-lg" href="#">Get started</a><a class="btn btn-glass btn-lg" href="#">Docs</a></div></header>' },
  { name: 'login-card', html: '<div class="container" style="max-width:26rem;padding-block:4rem"><div class="card glass-strong"><div class="card-body"><h1 class="h3 mb-4 text-center">Sign in</h1><form><label class="form-label" for="email">Email</label><input class="form-control mb-3" id="email" type="email"><label class="form-label" for="pw">Password</label><input class="form-control mb-4" id="pw" type="password"><button class="btn btn-gradient-primary btn-block" type="submit">Sign in</button></form></div></div></div>' },
  { name: 'pricing-3up', html: '<section class="container py-7"><div class="row gy-4 justify-content-center"><div class="col-12 col-md-4"><div class="card h-100"><div class="card-body text-center"><h3 class="fs-lg fw-bold">Free</h3><div class="fs-4xl fw-black my-2">$0</div><a class="btn btn-glass w-100" href="#">Start</a></div></div></div><div class="col-12 col-md-4"><div class="card card-glow glow-primary h-100"><div class="card-body text-center"><span class="badge badge-primary mb-1">Popular</span><h3 class="fs-lg fw-bold">Pro</h3><div class="fs-4xl fw-black my-2 text-gradient">$39</div><a class="btn btn-gradient-primary w-100" href="#">Buy</a></div></div></div><div class="col-12 col-md-4"><div class="card h-100"><div class="card-body text-center"><h3 class="fs-lg fw-bold">Team</h3><div class="fs-4xl fw-black my-2">$149</div><a class="btn btn-glass w-100" href="#">Buy</a></div></div></div></div></section>' },
  { name: 'chat-ui', html: '<div class="chat"><div class="message"><span class="avatar avatar-sm avatar-accent">AI</span><div class="message-body"><div class="message-bubble">How can I help?</div><div class="message-meta">Assistant</div></div></div><div class="message message-out"><span class="avatar avatar-sm avatar-primary">You</span><div class="message-body"><div class="message-bubble">Scaffold a page.</div></div></div></div><form class="prompt mt-3"><textarea class="prompt-field" aria-label="Message" placeholder="Message"></textarea><div class="prompt-actions"><button class="btn btn-gradient-primary" aria-label="Send"><svg class="icon"><use href="assets/icons/farvist-icons.svg#i-send"/></svg></button></div></form>' },
  { name: 'dashboard-shell', html: '<div style="display:grid;grid-template-columns:240px 1fr;min-height:100vh"><aside class="glass-strong p-3"><a class="navbar-brand mb-3 d-block" href="#">◆ App</a><a class="nav-link active" href="#">Overview</a><a class="nav-link" href="#">Projects</a><a class="nav-link" href="#">Settings</a></aside><main class="p-4" style="min-width:0"><h1 class="h3 mb-4">Overview</h1><div class="row gy-4"><div class="col-12 col-md-4"><div class="card"><div class="card-body"><div class="stat-value text-gradient">8.4k</div><div class="stat-label">Users</div></div></div></div></div></main></div>' },
  { name: 'contact-form', html: '<section class="container py-7" style="max-width:34rem"><h2 class="fs-3xl fw-black mb-4 text-center">Get in touch</h2><form><div class="row gy-3"><div class="col-12 col-md-6"><label class="form-label" for="n">Name</label><input class="form-control" id="n"></div><div class="col-12 col-md-6"><label class="form-label" for="e">Email</label><input class="form-control" id="e" type="email"></div></div><label class="form-label mt-3" for="m">Message</label><textarea class="form-control" id="m" rows="4"></textarea><button class="btn btn-gradient-primary btn-block mt-4" type="submit">Send</button></form></section>' },
  { name: 'assistant-markdown-reply', html: '<div class="message"><span class="avatar avatar-sm avatar-accent" aria-hidden="true">AI</span><div class="message-body"><div class="message-bubble"><div class="prose prose-sm"><p>Two ways to do it:</p><ul><li><strong>CDN</strong> — one <code>&lt;link&gt;</code> tag</li><li><strong>npm</strong> — <code>npm i farvist</code></li></ul><pre class="snippet"><code>&lt;link rel="stylesheet" href="…farvist.min.css"&gt;</code></pre></div></div><div class="message-actions"><button class="btn btn-glass btn-sm" data-fv-copy aria-label="Copy"><svg class="icon" aria-hidden="true"><use href="assets/icons/farvist-icons.svg#i-copy"/></svg></button><button class="btn btn-glass btn-sm" aria-label="Good response"><svg class="icon" aria-hidden="true"><use href="assets/icons/farvist-icons.svg#i-thumbs-up"/></svg></button></div><div class="message-meta">Assistant · now</div></div></div>' },
  { name: 'agent-tool-call-turn', html: '<div class="message"><span class="avatar avatar-sm avatar-accent" aria-hidden="true">AI</span><div class="message-body"><details class="reasoning"><summary class="reasoning-summary">Thought for 4 seconds</summary><div class="reasoning-body">The user wants current data, so search first.</div></details><div class="tool-call tool-call-done"><div class="tool-call-header"><svg class="icon" aria-hidden="true"><use href="assets/icons/farvist-icons.svg#i-terminal"/></svg><span class="tool-call-name">search_docs</span><span class="tool-call-status">Done</span></div><div class="tool-call-args">query: "backgrounds library"</div></div><div class="message-bubble streaming"><div class="prose prose-sm"><p>The backgrounds library ships mesh gradients and patterns…</p></div></div></div></div>' },
  { name: 'rag-answer-with-citations', html: '<div class="message"><span class="avatar avatar-sm avatar-accent" aria-hidden="true">AI</span><div class="message-body"><div class="message-bubble"><div class="prose prose-sm"><p>Glass surfaces need a rich backdrop to blur<a class="cite" href="#src-1">1</a>, so give the page a mesh background<a class="cite" href="#src-2">2</a>.</p><ol class="sources"><li id="src-1"><a href="#">docs/backgrounds — why glass needs a backdrop</a></li><li id="src-2"><a href="#">llms-full.txt — conventions</a></li></ol></div></div></div></div>' },
  { name: 'brand-theme', html: '<style>\n:root {\n  --fv-primary: #10b981;   /* brand color — gradients, glows, meshes, buttons all follow */\n  --fv-accent:  #a3e635;\n  --fv-info:    #2dd4bf;\n  --fv-primary-text: #6ee7b7;      /* readable tint for text/links on the dark surface */\n  /* --fv-primary-contrast: #06281d;  uncomment when the fill needs dark text */\n}\n</style>' },
];

// Utility families — bucket the class surface by prefix so an AI sees the shape
// without us enumerating ~700 classes by hand.
const familyDefs = [
  ['col-', 'grid columns'], ['offset-', 'column offsets'], ['g-', 'grid gutters'], ['gx-', 'column gutter'], ['gy-', 'row gutter'],
  ['m-', 'margin'], ['mt-', 'margin-top'], ['mb-', 'margin-bottom'], ['ms-', 'margin-start'], ['me-', 'margin-end'], ['mx-', 'margin-x'], ['my-', 'margin-y'],
  ['p-', 'padding'], ['pt-', 'padding-top'], ['pb-', 'padding-bottom'], ['ps-', 'padding-start'], ['pe-', 'padding-end'], ['px-', 'padding-x'], ['py-', 'padding-y'],
  ['d-', 'display'], ['flex-', 'flex'], ['justify-', 'justify-content'], ['align-', 'align-items'], ['gap-', 'gap'], ['order-', 'flex order'],
  ['text-', 'text color / alignment'], ['bg-', 'background (colors, gradients, meshes, patterns, spotlights)'], ['fs-', 'font-size'], ['fw-', 'font-weight'], ['lh-', 'line-height'],
  ['rounded', 'border-radius'], ['border', 'border'], ['shadow-', 'box-shadow'], ['glow', 'neon glow'], ['glass', 'glass surface'],
  ['w-', 'width'], ['h-', 'height'], ['mw-', 'max-width'], ['mh-', 'max-height'], ['opacity-', 'opacity'], ['overflow-', 'overflow'],
  ['position-', 'position'], ['z-', 'z-index'], ['hover-', 'hover effects'], ['animate-', 'animation'],
];
const utilities = {};
for (const [prefix, desc] of familyDefs) {
  const matched = classes.filter((c) => c === prefix.replace(/-$/, '') || c.startsWith(prefix));
  if (matched.length) utilities[prefix + '*'] = { desc, count: matched.length, sample: matched.slice(0, 14) };
}

const conventions = {
  theming: 'Dark by default. Add data-theme="light" to <html> to switch at runtime. RE-BRANDING (v1.3): every derived color (gradients, glows, meshes, body orbs, hover/active states, soft tints, focus rings) derives from the --fv-* custom properties at runtime — override --fv-primary / --fv-accent / --fv-info (and optionally --fv-success/danger/warning/secondary) on :root and the whole framework recolors, no build step. Companions: --fv-primary-text (readable tint for text on the dark surface) and --fv-{color}-contrast (text on filled components) when a brand flips between light and dark fills. NEVER re-color by overriding component CSS. SKINS (v1.4): prebuilt AA-gated theme packs on the same attribute — data-theme="synthwave|cyber|noir|forest|dawn" (dawn is light). JS: Farvist.theme("synthwave") applies + persists; <button data-fv-theme-cycle="synthwave,cyber"> cycles.',
  colors: ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'accent', 'light', 'dark'],
  breakpoints: { sm: '576px', md: '768px', lg: '992px', xl: '1200px' },
  responsive: 'Insert the breakpoint after the prefix: col-md-6, d-lg-flex, text-md-center.',
  spacingScale: '0,1,2,3,4,5,6,7 → 0, .25, .5, .75, 1, 1.5, 2, 3rem (e.g. p-4 = 1rem, gap-3 = .75rem).',
  notes: 'For glass to read, give the page a rich background (e.g. body class="bg-mesh-aurora"). Utilities win the cascade (no !important needed by you).',
  js: {
    include: '<script src="https://cdn.jsdelivr.net/npm/farvist/assets/farvist.js" defer></script> — auto-runs enhance() on load (modals, tabs, toasts, theme, copy buttons, auto-ARIA).',
    attributes: {
      'data-fv-open="#id"': 'open a <dialog class="modal" id="id">',
      'data-fv-dismiss': 'close the nearest dialog',
      'data-fv-tab="#panelId"': 'switch tabs (arrow-key nav added automatically)',
      'data-fv-theme-toggle': 'flip light/dark theme',
      'data-fv-nav-toggle': 'toggle the collapsed mobile navbar',
      'data-fv-open="#cmd"': 'also opens a <dialog class="command"> palette; ⌘K/Ctrl+K opens the first one on the page',
      'data-fv-command="url|#anchor|action"': 'on a .command-item — a URL/anchor navigates; any other value fires an fv:command event on the palette',
      'data-fv-copy': 'copy to clipboard on click — bare form copies the nearest pre.snippet, or the .message-bubble text when inside a chat .message-actions row; or pass "#sel" / literal text. The button flashes success.',
      'class="snippet" on <pre>': 'farvist.js wraps the code block and adds a hover copy button (requires the JS include)',
      'data-tooltip="text"': 'CSS tooltip; text is exposed to assistive tech',
    },
    api: "Farvist.toast({title, message, variant:'success'|'danger'|…, timeout}); Farvist.copy(text); Farvist.theme('synthwave'|'dark'|…) — applies a skin and persists it; Farvist.command('#cmd') — open a command palette; Farvist.enhance() — call after injecting new DOM so ARIA is re-wired.",
  },
};

// Curated component catalog — name → notable classes (with {placeholders}) → one example.
const components = [
  { name: 'buttons', classes: ['btn', 'btn-{color}', 'btn-outline-{color}', 'btn-gradient-{primary|sunset|aurora}', 'btn-glass', 'btn-link', 'btn-sm', 'btn-lg', 'btn-block'], example: '<button class="btn btn-gradient-primary">Save</button>' },
  { name: 'badges', classes: ['badge', 'badge-{color}', 'badge-soft-{color}', 'badge-pill'], example: '<span class="badge badge-soft-success">New</span>' },
  { name: 'alerts', classes: ['alert', 'alert-{color}', 'alert-heading'], example: '<div class="alert alert-info">Heads up.</div>' },
  { name: 'cards', classes: ['card', 'card-body', 'card-header', 'card-footer', 'card-title', 'card-text', 'card-glow', 'card-solid', 'hover-lift'], example: '<div class="card"><div class="card-body"><h3 class="card-title">Title</h3></div></div>' },
  { name: 'chips', classes: ['chip', 'chip-{color}', 'chip-close'], example: '<span class="chip chip-primary">Design <button class="chip-close" aria-label="Remove">&times;</button></span>' },
  { name: 'avatar', classes: ['avatar', 'avatar-{sm|lg|xl}', 'avatar-{color}', 'avatar-status', 'avatar-group'], example: '<span class="avatar avatar-primary">AL</span>' },
  { name: 'forms', classes: ['form-control', 'form-label', 'form-text', 'form-select', 'form-check', 'is-invalid', 'invalid-feedback', 'input-group', 'input-group-text'], example: '<label class="form-label" for="e">Email</label><input id="e" class="form-control">' },
  { name: 'range', classes: ['form-range'], example: '<input type="range" class="form-range">' },
  { name: 'switch', classes: ['switch'], example: '<label class="switch"><input type="checkbox"><span></span></label>' },
  { name: 'table', classes: ['table', 'table-hover', 'table-responsive'], example: '<div class="table-responsive"><table class="table table-hover">…</table></div>' },
  { name: 'navbar', classes: ['navbar', 'navbar-brand', 'navbar-nav', 'nav-link', 'navbar-toggle (data-fv-nav-toggle)', 'sticky-top'], example: '<nav class="navbar sticky-top">…</nav>' },
  { name: 'dropdown', classes: ['dropdown (<details>)', 'dropdown-menu', 'dropdown-menu-end', 'dropdown-item', 'dropdown-divider'], example: '<details class="dropdown"><summary class="btn btn-glass">Menu</summary><div class="dropdown-menu">…</div></details>' },
  { name: 'modal', classes: ['modal (<dialog>)', 'modal-header', 'modal-title', 'modal-body', 'modal-footer', 'modal-close'], example: '<button data-fv-open="#m">Open</button><dialog class="modal" id="m">…</dialog>' },
  { name: 'tabs', classes: ['tabs', 'tab (data-fv-tab="#id")', 'tab-panel'], example: '<div class="tabs"><button class="tab active" data-fv-tab="#p1">One</button></div><div class="tab-panel active" id="p1">…</div>' },
  { name: 'accordion', classes: ['accordion (<details>)', 'accordion-item', 'accordion-header', 'accordion-body'], example: '<details class="accordion-item" open><summary class="accordion-header">Q</summary><div class="accordion-body">A</div></details>' },
  { name: 'toast', classes: ['(JS only)'], example: "Farvist.toast({ title: 'Saved', variant: 'success' })" },
  { name: 'tooltip', classes: ['data-tooltip="text"'], example: '<button class="btn btn-glass" data-tooltip="Settings" aria-label="Settings">⚙</button>' },
  { name: 'progress', classes: ['progress', 'progress-bar', 'progress-striped', 'progress-animated'], example: '<div class="progress"><div class="progress-bar" style="width:60%"></div></div>' },
  { name: 'spinner', classes: ['spinner', 'spinner-{sm|lg}', 'spinner-{color}', 'spinner-dots'], example: '<div class="spinner spinner-primary"></div>' },
  { name: 'skeleton', classes: ['skeleton', 'skeleton-text', 'skeleton-circle'], example: '<div class="skeleton skeleton-text"></div>' },
  { name: 'breadcrumb', classes: ['breadcrumb', 'breadcrumb-item', 'active (gets aria-current)'], example: '<ol class="breadcrumb"><li class="breadcrumb-item active">Now</li></ol>' },
  { name: 'pagination', classes: ['pagination', 'page-item', 'page-link', 'active'], example: '<nav aria-label="Pagination"><ul class="pagination"><li class="page-item active"><a class="page-link" href="#">1</a></li></ul></nav>' },
  { name: 'stepper', classes: ['stepper', 'step', 'step-dot', 'step-label', 'is-active', 'is-done'], example: '<ol class="stepper"><li class="step is-active"><span class="step-dot">1</span><span class="step-label">Plan</span></li></ol>' },
  { name: 'timeline', classes: ['timeline', 'timeline-item', 'timeline-marker', 'timeline-{color}', 'timeline-title', 'timeline-time'], example: '<ul class="timeline"><li class="timeline-item timeline-primary"><div class="timeline-marker"></div><div class="timeline-content">…</div></li></ul>' },
  { name: 'segmented', classes: ['segmented (radio group, no JS)'], example: '<div class="segmented"><input type="radio" id="a" name="g" checked><label for="a">A</label></div>' },
  { name: 'rating', classes: ['rating', 'rating-empty'], example: '<span class="rating" role="img" aria-label="4 of 5">★★★★☆</span>' },
  { name: 'stat', classes: ['stat-value', 'stat-label'], example: '<div class="stat-value text-gradient">8.4k</div><div class="stat-label">Users</div>' },
  { name: 'empty-state', classes: ['empty-state', 'empty-state-icon'], example: '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Nothing here yet.</p></div>' },
  { name: 'list-group', classes: ['list-group', 'list-group-item'], example: '<ul class="list-group"><li class="list-group-item">Item</li></ul>' },
  { name: 'callout', classes: ['callout', 'callout-{color}'], example: '<div class="callout callout-accent">Note.</div>' },
  { name: 'backgrounds', classes: ['bg-mesh-{aurora|sunset|ocean|nebula}', 'bg-grid', 'bg-dots', 'bg-graph', 'bg-spotlight', 'bg-spotlight-{color}', 'bg-fade', 'bg-drift'], example: '<body class="bg-mesh-aurora">' },
  { name: 'chat (AI)', classes: ['chat', 'message', 'message-out (user)', 'message-body', 'message-bubble', 'message-meta', 'message-actions (hover copy/vote row)', 'typing', 'streaming (caret while tokens arrive)', 'cite (superscript source chip)', 'sources (footnote list)'], example: '<div class="chat"><div class="message"><span class="avatar avatar-sm avatar-accent">AI</span><div class="message-body"><div class="message-bubble streaming">Hi</div></div></div></div>' },
  { name: 'prompt (AI)', classes: ['prompt', 'prompt-field', 'prompt-actions', 'prompt-meta'], example: '<form class="prompt"><textarea class="prompt-field" aria-label="Message"></textarea><div class="prompt-actions"><button class="btn btn-gradient-primary">Send</button></div></form>' },
  { name: 'status (AI)', classes: ['status', 'status-{online|busy|idle|error}'], example: '<span class="status status-online">Agent online</span>' },
  { name: 'prose (AI)', classes: ['prose', 'prose-sm'], example: '<div class="message-bubble"><div class="prose prose-sm">…rendered markdown…</div></div> — ALWAYS wrap rendered-markdown HTML in .prose (bubbles preserve raw newlines otherwise); also styles bare tables/images from model output.' },
  { name: 'tool-call (AI)', classes: ['tool-call', 'tool-call-header', 'tool-call-name', 'tool-call-status', 'tool-call-args', 'tool-call-result', 'tool-call-{running|done|error}'], example: '<div class="tool-call tool-call-running"><div class="tool-call-header"><svg class="icon" aria-hidden="true"><use href="assets/icons/farvist-icons.svg#i-terminal"/></svg><span class="tool-call-name">fetch_data</span><span class="tool-call-status">Running…</span></div><div class="tool-call-args">{"id": 42}</div></div> — state classes tint the rail; keep the status TEXT so meaning never relies on color.' },
  { name: 'reasoning (AI)', classes: ['reasoning (<details>)', 'reasoning-summary (<summary>)', 'reasoning-body'], example: '<details class="reasoning"><summary class="reasoning-summary">Thought for 12 seconds</summary><div class="reasoning-body">…model thinking…</div></details>' },
  { name: 'command palette (⌘K)', classes: ['command (<dialog>)', 'command-search', 'command-input', 'command-list', 'command-group', 'command-item (data-fv-command="url|#anchor|action", optional data-fv-keywords)', 'command-kbd', 'command-empty', 'command-hint'], example: '<button data-fv-open="#cmd">Search</button><dialog class="command" id="cmd" aria-label="Command menu"><div class="command-search"><svg class="icon"><use href="assets/icons/farvist-icons.svg#i-search"/></svg><input class="command-input" placeholder="Type a command…"></div><ul class="command-list"><li class="command-group">Jump to</li><li class="command-item" data-fv-command="/docs/"><span class="command-label">Docs</span></li></ul><div class="command-empty" hidden>No matches.</div></dialog> — opens on data-fv-open / ⌘K / Ctrl+K / Farvist.command("#cmd"); type-to-filter + arrow keys + Enter; a URL/#anchor navigates, any other value fires an fv:command event.' },
];

const out = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  homepage: pkg.homepage,
  license: pkg.license,
  install: {
    cdn: 'https://cdn.jsdelivr.net/npm/farvist/dist/farvist.min.css',
    js: 'https://cdn.jsdelivr.net/npm/farvist/assets/farvist.js',
    npm: 'npm i farvist',
  },
  totals: { classes: classes.length, components: components.length, icons: iconNames.length, recipes: recipes.length, skins: skinNames.length },
  skins: { usage: '<html data-theme="NAME"> or Farvist.theme("NAME") — prebuilt AA-gated theme packs; "dawn" is a light skin. Default (no attribute) is the dark glass theme.', names: skinNames },
  conventions,
  utilities,
  components,
  icons: {
    usage: '<svg class="icon" aria-hidden="true"><use href="assets/icons/farvist-icons.svg#i-NAME"/></svg> — inherits currentColor; size via font-size or width/height.',
    names: iconNames,
  },
  recipes,
};

writeFileSync(join(root, 'ai-context.json'), JSON.stringify(out, null, 2) + '\n');

// ---- assemble llms-full.txt (markdown) ----
const L = [];
L.push(`# ${out.name} — full context for AI assistants`);
L.push('');
L.push(`> ${out.description}`);
L.push('');
L.push(`Version ${out.version} · ${out.license} · ${out.homepage} · ${out.totals.classes} utility/component classes.`);
L.push('');
L.push('## Install');
L.push('```html');
L.push(`<link rel="stylesheet" href="${out.install.cdn}">`);
L.push(`<script src="${out.install.js}" defer></script> <!-- optional, for modal/tabs/toast/theme -->`);
L.push('```');
L.push(`Or: \`${out.install.npm}\`. Dark theme by default — give the page a rich background so the glass reads.`);
L.push('');
L.push('## Conventions');
L.push(`- **Colors:** ${conventions.colors.join(', ')} (use as suffixes: btn-primary, text-success, bg-accent).`);
L.push(`- **Theming:** ${conventions.theming}`);
L.push(`- **Breakpoints:** ${Object.entries(conventions.breakpoints).map(([k, v]) => `${k}=${v}`).join(', ')}. ${conventions.responsive}`);
L.push(`- **Spacing scale:** ${conventions.spacingScale}`);
L.push(`- **Notes:** ${conventions.notes}`);
L.push('');
L.push('## JavaScript hooks');
L.push(conventions.js.include);
for (const [attr, desc] of Object.entries(conventions.js.attributes)) L.push(`- \`${attr}\` — ${desc}`);
L.push(`- API: ${conventions.js.api}`);
L.push('');
L.push('## Utility families');
for (const [name, f] of Object.entries(utilities)) L.push(`- \`${name}\` — ${f.desc} (${f.count}): ${f.sample.join(', ')}${f.count > f.sample.length ? ', …' : ''}`);
L.push('');
L.push('## Components');
for (const c of components) {
  L.push(`### ${c.name}`);
  L.push(`Classes: ${c.classes.map((x) => '`' + x + '`').join(', ')}`);
  L.push('```html');
  L.push(c.example);
  L.push('```');
}
L.push('## Skins');
L.push(out.skins.usage);
L.push(`Names (${skinNames.length}): ${skinNames.join(', ')}`);
L.push('');
L.push('## Icons');
L.push(out.icons.usage);
L.push(`Names (${iconNames.length}): ${iconNames.join(', ')}`);
L.push('');
L.push('## Recipes — copy-paste whole sections');
for (const r of recipes) {
  L.push(`### ${r.name}`);
  L.push('```html');
  L.push(r.html);
  L.push('```');
}
writeFileSync(join(root, 'llms-full.txt'), L.join('\n') + '\n');

console.log(`gen-ai-context: ${classes.length} classes, ${components.length} components, ${iconNames.length} icons, ${recipes.length} recipes -> ai-context.json + llms-full.txt`);
