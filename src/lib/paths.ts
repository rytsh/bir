/** Match GitHub Pages' directory URLs without changing query strings or hashes. */
export function normalizePagePath(path: string): string {
  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex < 0 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : path.slice(suffixIndex);
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return `${normalized === "/" ? normalized : `${normalized}/`}${suffix}`;
}
