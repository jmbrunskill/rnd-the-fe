import { html, type Html } from "./html.ts";

// Reusable Prev/Next pager for any server-paged table. Pure: it returns markup
// from the current page state; the caller re-renders it after each fetch and
// wires one delegated click listener that reads `data-page` ("prev" | "next").
// State is the caller's source of truth — this component holds none.

// Total pages for `total` items at `pageSize` per page. At least 1 (an empty
// result set is still "page 1 of 1"), so the pager renders consistently.
export const totalPages = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

export interface PagerState {
  page: number; // 1-based
  pageSize: number;
  total: number;
}

// A <nav> with Prev/Next buttons (natively `disabled` at the bounds, so keyboard
// + focus behave) and a live label. `data-page` is the click contract.
export function renderPager({ page, pageSize, total }: PagerState): Html {
  const pages = totalPages(total, pageSize);
  const atFirst = page <= 1;
  const atLast = page >= pages;
  return html`<nav class="pager" aria-label="Pagination">
  <button type="button" class="pager-btn" data-page="prev" ${atFirst ? "disabled" : ""}>← Prev</button>
  <span class="stock-count" aria-live="polite">Page ${page} of ${pages} · ${total} total</span>
  <button type="button" class="pager-btn" data-page="next" ${atLast ? "disabled" : ""}>Next →</button>
</nav>` as Html;
}
