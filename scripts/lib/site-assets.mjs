// Version actual local asset tags without rewriting escaped documentation or
// third-party CDN URLs. The build refreshes this query on every release.
export function stampSiteAssets(html, version) {
  return html.replace(
    /(<(?:link|script)\b[^>]*?\b(?:href|src)=["'])((?:\.\.?\/|\/)*(?:assets\/farvist\.js|dist\/farvist(?:-ai-compat|-ai|-slim)?(?:\.min)?\.css))(?:\?v=[\w.-]+)?(["'])/g,
    (_, before, path, after) => `${before}${path}?v=${version}${after}`,
  );
}
