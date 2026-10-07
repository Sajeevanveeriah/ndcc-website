// `?new=` deep links that open a CMS editor straight away (one click from the
// dashboard instead of two). No imports, so tests can load it directly.

export type NewEditorRequest = { open: false } | { open: true; type: string | null };

/**
 * Reads `?new=1` (open a blank editor) or `?new=<type>` (open it with that
 * type preset, when the type is one of `allowedTypes`). Any other value still
 * opens a blank editor, so a stale link never fails silently.
 */
export function readNewEditorParam(search: string, allowedTypes: readonly string[] = []): NewEditorRequest {
  const value = new URLSearchParams(search).get('new');
  if (value === null) return { open: false };
  return { open: true, type: allowedTypes.includes(value) ? value : null };
}

/** The same URL without the `new` parameter, so a reload does not reopen the editor. */
export function withoutNewEditorParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('new');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Browser-only: consume the `?new=` request for this page, once. */
export function consumeNewEditorParam(allowedTypes: readonly string[] = []): NewEditorRequest {
  if (typeof window === 'undefined') return { open: false };
  const request = readNewEditorParam(window.location.search, allowedTypes);
  if (request.open) window.history.replaceState(window.history.state, '', withoutNewEditorParam(window.location.href));
  return request;
}
