// Autoprefixes the compiled dist/*.css for the browsers in package.json "browserslist".
// Run via `npm run build:prefix` (chained into build:all).
module.exports = { plugins: [require('autoprefixer')] };
