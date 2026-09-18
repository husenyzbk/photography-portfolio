/**
 * Builds an in-site href that respects the configured base path, so the site
 * works both at husenyzbk.github.io/photography-portfolio and later at the
 * root of a bought domain, with no link edits.
 */
export function href(...segments: (string | undefined)[]): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const path = segments.filter(Boolean).join('/').replace(/^\/+/, '');
  return path ? `${base}/${path}/` : `${base}/`;
}
