# Show HN launch kit (not deployed — for you to post)

## When to post
- Tue–Thu, 14:00–16:00 UTC (morning US) gets the best HN traction.
- Be around for the first 2–3 hours to answer comments — that's what keeps a post alive.
- Post from your own account. HN penalizes new-account launches less than you'd think, but an account with any history is better.

## Title (pick one — HN strips "Show HN:" variants down, keep it plain)

Option A (recommended — leads with the differentiated build):
> Show HN: A 6.6 KB drop-in chat/agent UI for sites already on Tailwind or Bootstrap

Option B (framework hook):
> Show HN: Farvist – a glassmorphism CSS framework your AI assistant can theme

Option C (feature hook):
> Show HN: I built a CSS framework where re-branding is 5 CSS variables

Note: A and B pitch different products to different crowds. A is narrower but has a
clearer "I need this today" buyer — anyone building an AI product UI. B is the
broader framework story. Do not blend them; pick the audience.

**URL:** https://farvist.com

## First comment (post immediately after submitting — this is your pitch)

Hi HN! I built Farvist over the last two months: a free, MIT-licensed CSS framework
in the Bootstrap tradition (components + utilities, one stylesheet, no build step),
with two bets that I think are worth your skepticism:

1. **Glassmorphism as the default.** Frosted glass, neon glow, gradients — with the
   unglamorous parts done properly: WCAG AA contrast enforced in CI, an opaque
   @supports fallback when backdrop-filter is missing, and prefers-reduced-motion
   on every animation.

2. **Designed to be written by AI assistants.** A growing share of front-end code
   is written by models, and they hallucinate class names and can't run your Sass
   build. So Farvist publishes a machine catalog (llms.txt / llms-full.txt /
   ai-context.json — generated from the compiled CSS so it can't drift), and every
   color derivation resolves at runtime via color-mix(), so "re-brand the whole
   framework" is literally five CSS variables — something a model in a chat window
   can actually do. Try it: paste https://farvist.com/llms-full.txt into your
   assistant and ask it to build a pricing page.

There is a third thing I would actually lead with now: the AI-interface kit ships as
its OWN 6.6 KB stylesheet. If your product is already on Tailwind or Bootstrap and you
need a chat UI — bubbles, prompt composer, tool-call cards, reasoning disclosures,
streaming, code diffs, ⌘K palette — you can drop in farvist-ai.min.css without
adopting a second framework. Everything is emitted in @layer so your own CSS keeps
winning shared class names. Demo on a simulated non-Farvist page:
https://farvist.com/examples/ai-addon.html

Numbers, honestly: ~21 KB gzip for the full build, 42 components, 5 prebuilt skins,
6 CI gates (axe-core, per-skin contrast, size budget, theming purity, dist freshness). The site's own docs run on it.

What it's not: it's not trying to replace Tailwind for design-system teams, and
the AI angle isn't a moat — any framework could ship an llms.txt tomorrow. I just
think these are the right defaults for right now, and I'd genuinely like to hear
where this breaks for you.

Docs: https://farvist.com/docs/ · Theme builder: https://farvist.com/themer/ ·
Source: https://github.com/FloKuersten/farvist

## Comment-thread prep (likely questions + honest answers)

**"Glassmorphism is a fad / unreadable"** → Agree it's often shipped badly; that's
why contrast is CI-enforced and there's an opaque fallback. Wrote up the pitfalls:
https://farvist.com/blog/glassmorphism-accessibility/

**"The AI stuff is marketing"** → Partly fair — the honest version is in
https://farvist.com/blog/ai-era/ including a "what this doesn't fix" section.
The concrete artifact is ai-context.json: tokens, components, recipes as data.

**"Why not Tailwind?"** → Different model. Utility-only pushes composition into
markup; component classes are more stable for a model (and a human) to recall.
The Bootstrap-compatible utilities are there too.

**"21 KB isn't tiny"** → It's one file with 42 components and zero JS required;
Bootstrap css alone is ~25 KB gzip. There are three prebuilt bundles now — full (21 KB),
slim without the AI components (19 KB), and the AI kit alone (6.6 KB) — plus
per-module Sass builds (@use only the partials you want).

**"Who's behind it / will it be maintained?"** → Solo, built in the open,
24 tagged releases with changelogs since June, each feature release followed by an
adversarial review pass whose findings are reproduced before they are fixed.
The framework is MIT and stays free.

> Note to self: do NOT claim ads fund it — AdSense rejected the site 2026-08-02.
> If a paid template pack exists by launch day, say so plainly; if not, say
> "nothing to sell you yet" and leave it.

## Cross-posts (same day, lower effort)
- r/webdev "Showoff Saturday" (only on Saturdays — else r/css, r/web_design)
- dev.to: repost the ai-era article with a canonical_url pointing at the blog
- X/Twitter: the Theme Builder GIF angle ("watch a whole framework re-brand live")
