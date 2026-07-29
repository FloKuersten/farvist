# Show HN launch kit (not deployed — for you to post)

## When to post
- Tue–Thu, 14:00–16:00 UTC (morning US) gets the best HN traction.
- Be around for the first 2–3 hours to answer comments — that's what keeps a post alive.
- Post from your own account. HN penalizes new-account launches less than you'd think, but an account with any history is better.

## Title (pick one — HN strips "Show HN:" variants down, keep it plain)

Option A (recommended — concrete + differentiated):
> Show HN: Farvist – a glassmorphism CSS framework your AI assistant can theme

Option B (Bootstrap hook):
> Show HN: Farvist – a Bootstrap-style CSS framework built for the AI era

Option C (feature hook):
> Show HN: I built a CSS framework where re-branding is 5 CSS variables

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

Numbers, honestly: ~21 KB gzip, 42 components (incl. an AI-app kit: chat, tool-call
cards, streaming, diffs, ⌘K palette), 5 prebuilt skins, 6 CI gates (axe-core,
per-skin contrast, size budget, theming purity). The site's own docs run on it.

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
Bootstrap css alone is ~25 KB gzip. Per-module Sass builds work today
(@use the partials you want); a prebuilt slim bundle is on the roadmap.

**"Who's behind it / will it be maintained?"** → Solo, built in the open,
23 releases with changelogs since June. Ads on the docs keep it free; no paid tier.

## Cross-posts (same day, lower effort)
- r/webdev "Showoff Saturday" (only on Saturdays — else r/css, r/web_design)
- dev.to: repost the ai-era article with a canonical_url pointing at the blog
- X/Twitter: the Theme Builder GIF angle ("watch a whole framework re-brand live")
