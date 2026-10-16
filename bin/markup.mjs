// Forward-only scanners for the CLI's untrusted, size-bounded source files.
// This is a markup heuristic, not a JavaScript or HTML parser. Keep original
// UTF-16 offsets so diagnostics agree with the source, including CRLF input.
const space = (ch) => ch !== undefined && /\s/.test(ch);

function blankComments(text, opening, closing) {
  const parts = [];
  let copied = 0, match;
  while ((match = opening.exec(text))) {
    closing.lastIndex = opening.lastIndex;
    const end = closing.exec(text);
    // No later opener can have a closing delimiter either. Leave the unfinished
    // comment visible, as before, without rescanning its suffix for each opener.
    if (!end) break;
    parts.push(text.slice(copied, match.index), text.slice(match.index, closing.lastIndex).replace(/[^\n]/g, ' '));
    copied = opening.lastIndex = closing.lastIndex;
  }
  parts.push(text.slice(copied));
  return parts.join('');
}

export function stripComments(text, ext) {
  let out = blankComments(text, /<!--/g, /-->/g);
  if (['.jsx', '.tsx', '.vue', '.svelte', '.astro'].includes(ext)) {
    out = blankComments(out, /\{\s*\/\*/g, /\*\/\s*\}/g);
  }
  return out;
}

export function* markupTags(text) {
  const opening = /<(link|style|use)(?=[\s/>])/gi;
  const styleEnd = /<\/style\s*>/gi;
  let match, noStyleEnd = false;
  while ((match = opening.exec(text))) {
    let i = opening.lastIndex, complete = false;
    const attrs = Object.create(null);
    while (i < text.length) {
      if (space(text[i]) || text[i] === '/') { i++; continue; }
      if (text[i] === '>') { i++; complete = true; break; }
      if (text[i] === '<') break; // Recover at the next opener, never retry a suffix.
      const start = i;
      while (i < text.length && !/[\s"'<>/=]/.test(text[i])) i++;
      if (i === start) { i++; continue; }
      const name = text.slice(start, i).toLowerCase();
      while (space(text[i])) i++;
      let value = '';
      if (text[i] === '=') {
        i++;
        while (space(text[i])) i++;
        const quote = text[i];
        if (quote === '"' || quote === "'") {
          const valueStart = ++i;
          while (i < text.length && text[i] !== quote) i++;
          value = text.slice(valueStart, i);
          if (i < text.length) i++;
        } else {
          const valueStart = i;
          while (i < text.length && !/[\s<>]/.test(text[i])) i++;
          value = text.slice(valueStart, i);
        }
      }
      if (!(name in attrs)) attrs[name] = value;
    }
    opening.lastIndex = i;
    if (!complete) continue;
    const name = match[1].toLowerCase();
    const tag = { name, attrs, index: match.index, body: null };
    if (name === 'style') {
      if (text[i - 2] === '/') { tag.body = ''; yield tag; continue; }
      if (noStyleEnd) continue;
      styleEnd.lastIndex = i;
      const end = styleEnd.exec(text);
      // Search the remaining suffix at most once when there is no close. Keep
      // scanning other tags so malformed style markup cannot hide their checks.
      if (!end) { noStyleEnd = true; continue; }
      tag.body = text.slice(i, end.index);
      opening.lastIndex = styleEnd.lastIndex;
    }
    yield tag;
  }
}

export function* cssImports(text) {
  const opening = /\bimport\s+/g;
  let match;
  while ((match = opening.exec(text))) {
    const start = opening.lastIndex;
    let i = start;
    while (i < text.length && /[\w{}\s,*]/.test(text[i])) i++;
    const specifier = text.slice(start, i);
    // A failed earlier candidate (e.g. "// import styles") may precede a valid
    // side-effect import. Recognize its final keyword without retrying suffixes.
    const validPrefix = !specifier || /\sfrom\s+$/.test(specifier) || /\bimport\s+$/.test(specifier);
    const quote = text[i];
    if (quote === '"' || quote === "'") {
      const valueStart = ++i;
      while (i < text.length && text[i] !== '"' && text[i] !== "'") i++;
      const ref = text.slice(valueStart, i);
      if (validPrefix && text[i] === quote && ref.endsWith('.css')) yield ref;
      if (i < text.length) i++;
    }
    opening.lastIndex = i;
  }
}

export function sourceLocator(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (starts[mid] <= index) lo = mid; else hi = mid;
    }
    return { line: lo + 1, col: index - starts[lo] + 1 };
  };
}

// Called in ascending attribute order; no repeated prefix searches per match.
export function escapedSampleChecker(text) {
  let cursor = 0, literal = -1, escaped = -1;
  return (index) => {
    for (; cursor <= index; cursor++) {
      if (text[cursor] === '<') literal = cursor;
      else if (text[cursor] === '&' && text.startsWith('&lt;', cursor)) escaped = cursor;
    }
    return escaped > literal;
  };
}
