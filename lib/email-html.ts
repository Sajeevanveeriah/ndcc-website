/**
 * Escape untrusted text before interpolating it into an HTML email.
 *
 * This helper is intentionally dependency-free so templates and regression
 * tests can share the exact same escaping behaviour.
 */
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
