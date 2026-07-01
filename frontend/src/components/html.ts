// Minimal, dependency-free HTML escaping for our `innerHTML`-string views.
//
// `Html` is a *branded* string: an ordinary string at runtime, but a distinct
// type at compile time. Only `esc()` (and `html`` in the future) can produce
// one, so a value typed `Html` is a promise that its dynamic parts were escaped.
// This lets `renderTable` accept an `Html` escape-hatch cell without re-escaping
// it, while still forcing plain-string cells through `esc()`.
export type Html = string & { readonly __html: unique symbol };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escape a value for safe interpolation into an HTML string (element text or a
// double-quoted attribute). `null`/`undefined` become "" so callers can pass
// nullable fields directly; numbers are stringified.
export function esc(value: string | number | null | undefined): Html {
  if (value == null) return "" as Html;
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]) as Html;
}
