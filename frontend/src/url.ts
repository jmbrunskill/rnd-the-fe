// Tiny URL query-state helper. Deliberately NOT coupled to the router: views
// read the query on mount and write it here via history.replaceState, so the
// address bar reflects UI state (shareable, survives refresh) without a
// navigation — no renderRoute, no data refetch, no history spam.

export const queryParams = (): URLSearchParams => new URLSearchParams(location.search);

// Merge `updates` into the current query string and replaceState. A null/""
// value deletes that key. The path is preserved; only the query changes.
export function setQuery(updates: Record<string, string | null>): void {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : ""));
}
