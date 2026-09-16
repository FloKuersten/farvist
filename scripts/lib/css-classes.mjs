// =============================================================================
// Farvist · scripts/lib/css-classes.mjs
// The ONE class extractor shared by the AI catalog (gen-ai-context) and the
// validator manifest (gen-agent-files), so the two can never disagree about
// which classes exist.
//
// Only SELECTOR text is scanned (everything between a block's start and its
// `{`). Scanning raw CSS also harvests dotted words out of declaration values:
// `www.w3.org` inside a data URI once published phantom classes `w3` and `org`.
// =============================================================================

export function classesFromCss(css) {
  const selectors = [];
  for (let k = 0, start = 0; k < css.length; k++) {
    const ch = css[k];
    if (ch === '{') { selectors.push(css.slice(start, k)); start = k + 1; }
    else if (ch === '}' || ch === ';') { start = k + 1; }
  }
  return [...new Set(selectors.flatMap((sel) => [...sel.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1])))].sort();
}
