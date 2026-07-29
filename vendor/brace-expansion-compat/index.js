// brace-expansion v1 exported a callable function; v5 (the only version the
// 2026 unbounded-expansion advisory considers patched) exports { expand }.
// minimatch@3 — what serve and pa11y-ci still resolve — calls the module
// directly: `require('brace-expansion')(pattern)`. This shim bridges the two
// shapes over the vendored v5.0.8 source (upstream.js + balanced-match.js,
// copied verbatim from the upstream CJS builds; MIT licenses alongside).
'use strict';
const upstream = require('./upstream.js');
module.exports = upstream.expand;
module.exports.expand = upstream.expand;
module.exports.EXPANSION_MAX = upstream.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = upstream.EXPANSION_MAX_LENGTH;
