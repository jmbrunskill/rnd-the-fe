import type { View } from "../../router.ts";
import {
  fetchStocktakes,
  statusLabel,
  STOCKTAKE_STATUSES,
  type StocktakeListQuery,
} from "../../data/stocktakes.ts";
import type { StocktakeNodeStatus, StocktakeSortFieldInput } from "../../api/schema-types.ts";
import { esc } from "../../components/html.ts";
import { columnKey, isSortable, renderTable, type Column } from "../../components/table.ts";
import { stocktakeColumns } from "./columns.ts";
import { renderPager, totalPages } from "../../components/pager.ts";
import { queryParams, setQuery } from "../../url.ts";
import type { StocktakeRow } from "../../data/stocktakes.ts";

const PAGE_SIZE = 20;

// The stocktake list is a SERVER-driven table: pagination, sort and filter each
// re-request one page (20 rows). All three live in the URL query string, written
// in place (replaceState — shareable, survives refresh, no history spam). The
// toolbar (search + status) is rendered ONCE and persists so input focus/value
// survive refetches; only the `.stock-results` region is swapped. A request
// token drops stale responses when the user types/pages quickly. Mirrors the
// detail view's read-URL-on-mount → state → setQuery pattern, but each change
// hits GraphQL instead of filtering loaded rows.

// The list's whole UI state. `sort.key`/`status` are the schema unions, so the
// state can't hold a value the server would reject.
interface ListState {
  page: number; // 1-based
  search: string;
  status: StocktakeNodeStatus | null;
  sort: { key: StocktakeSortFieldInput; dir: "asc" | "desc" } | null;
}

// Validate a URL ?status value against the generated status union; junk → null.
const parseStatus = (v: string | null): StocktakeNodeStatus | null =>
  v && (STOCKTAKE_STATUSES as readonly string[]).includes(v) ? (v as StocktakeNodeStatus) : null;

export const render: View<"/stocktake"> = (outlet) => {
  const cols = stocktakeColumns();
  // Sortable columns keyed by their server sort-field — the URL ?sort validator
  // and the header-click handler both read this, so they can't drift.
  const sortableByKey = new Map<string, Column<StocktakeRow>>();
  for (const c of cols) if (isSortable(c)) sortableByKey.set(columnKey(c), c);

  const statusOptions =
    `<option value="">All statuses</option>` +
    STOCKTAKE_STATUSES.map((s) => `<option value="${s}">${esc(statusLabel(s))}</option>`).join("");

  outlet.innerHTML =
    `<section class="page">` +
    `<h1>Stocktakes</h1>` +
    `<div class="stock-toolbar">` +
    `<input type="search" class="stock-filter" placeholder="Search description…"` +
    ` aria-label="Search stocktakes by description" autocomplete="off" spellcheck="false">` +
    `<select class="stock-select" aria-label="Filter by status">${statusOptions}</select>` +
    `</div>` +
    `<div class="stock-results"></div>` +
    `</section>`;

  const input = outlet.querySelector<HTMLInputElement>(".stock-filter")!;
  const select = outlet.querySelector<HTMLSelectElement>(".stock-select")!;
  const resultsEl = outlet.querySelector<HTMLElement>(".stock-results")!;

  const state: ListState = { page: 1, search: "", status: null, sort: null };

  // Map the domain state to the data layer's typed query (offset from page).
  const toQuery = (): StocktakeListQuery => ({
    first: PAGE_SIZE,
    offset: (state.page - 1) * PAGE_SIZE,
    sort: state.sort ? { key: state.sort.key, desc: state.sort.dir === "desc" } : undefined,
    search: state.search.trim() || undefined,
    status: state.status ?? undefined,
  });

  // Reflect state in the URL. `dir` is written only for desc (asc is implied);
  // page/search/status/sort are dropped at their defaults so the URL stays clean.
  const syncUrl = () =>
    setQuery({
      page: state.page > 1 ? String(state.page) : null,
      search: state.search.trim() || null,
      status: state.status,
      sort: state.sort?.key ?? null,
      dir: state.sort?.dir === "desc" ? "desc" : null,
    });

  const updateAriaSort = () => {
    const thead = resultsEl.querySelector("thead");
    if (!thead) return;
    for (const th of Array.from(thead.querySelectorAll<HTMLElement>("th[data-sort-key]"))) {
      const active = !!state.sort && th.dataset.sortKey === state.sort.key;
      th.setAttribute(
        "aria-sort",
        active ? (state.sort!.dir === "asc" ? "ascending" : "descending") : "none",
      );
    }
  };

  // Drop late responses: only the newest request may write the DOM, and none may
  // write after the view is torn down (cleanup flips `disposed`).
  let token = 0;
  let disposed = false;

  const apply = () => {
    syncUrl();
    const my = ++token;
    resultsEl.setAttribute("aria-busy", "true");
    if (!resultsEl.innerHTML) resultsEl.innerHTML = `<p class="muted">Loading…</p>`;

    fetchStocktakes(toQuery())
      .then(({ rows, totalCount }) => {
        if (my !== token || disposed) return;
        resultsEl.removeAttribute("aria-busy");
        if (!totalCount) {
          resultsEl.innerHTML = `<p class="muted">No stocktakes found.</p>`;
          return;
        }
        // A deep-linked ?page beyond the result set (e.g. after the data shrank)
        // clamps to the last page and refetches, so we never show an empty
        // "Page 5 of 2". Terminates: the clamped page is always in range.
        const pages = totalPages(totalCount, PAGE_SIZE);
        if (state.page > pages) {
          state.page = pages;
          apply();
          return;
        }
        const table = renderTable(rows, cols, {
          className: "stock-table",
          testId: "stocktake-list",
          ready: true,
          rowKey: (s) => s.id,
        });
        resultsEl.innerHTML =
          `<div class="table-wrap">${table}</div>` +
          renderPager({ page: state.page, pageSize: PAGE_SIZE, total: totalCount });
        updateAriaSort();
      })
      .catch((error: unknown) => {
        if (my !== token || disposed) return;
        resultsEl.removeAttribute("aria-busy");
        const message = error instanceof Error ? error.message : String(error);
        resultsEl.innerHTML = `<p class="error">Failed to load: ${esc(message)}</p>`;
      });
  };

  // --- restore state from the URL (deep link / refresh) ---
  const p = queryParams();
  const pageNum = Number(p.get("page"));
  state.page = Number.isInteger(pageNum) && pageNum > 1 ? pageNum : 1;
  state.search = p.get("search") ?? "";
  state.status = parseStatus(p.get("status"));
  const urlSort = p.get("sort");
  if (urlSort && sortableByKey.has(urlSort)) {
    state.sort = {
      key: urlSort as StocktakeSortFieldInput,
      dir: p.get("dir") === "desc" ? "desc" : "asc",
    };
  }
  input.value = state.search;
  select.value = state.status ?? "";

  // --- listeners (all on nodes that persist across result re-renders) ---

  // Search — debounced so fast typing coalesces into one request. Any filter
  // change resets to page 1 (the old offset may exceed the new result set).
  let timer = 0;
  const onInput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.search = input.value;
      state.page = 1;
      apply();
    }, 250);
  };
  input.addEventListener("input", onInput);

  const onStatusChange = () => {
    state.status = parseStatus(select.value);
    state.page = 1;
    apply();
  };
  select.addEventListener("change", onStatusChange);

  // One delegated click for both pager buttons and sort headers — resultsEl is
  // stable (only its innerHTML is swapped), so this binds once.
  const onResultsClick = (e: Event) => {
    const target = e.target as HTMLElement;

    const pageBtn = target.closest<HTMLButtonElement>("[data-page]");
    if (pageBtn) {
      if (pageBtn.disabled) return;
      state.page = pageBtn.dataset.page === "next" ? state.page + 1 : Math.max(1, state.page - 1);
      apply();
      return;
    }

    const th = target.closest<HTMLElement>("th[data-sort-key]");
    const key = th?.dataset.sortKey;
    if (!key || !sortableByKey.has(key)) return;
    const k = key as StocktakeSortFieldInput;
    // Cycle asc → desc → none (none = the server's default order).
    if (!state.sort || state.sort.key !== k) state.sort = { key: k, dir: "asc" };
    else if (state.sort.dir === "asc") state.sort = { key: k, dir: "desc" };
    else state.sort = null;
    state.page = 1;
    apply();
  };
  resultsEl.addEventListener("click", onResultsClick);

  apply();

  return () => {
    disposed = true;
    clearTimeout(timer);
    input.removeEventListener("input", onInput);
    select.removeEventListener("change", onStatusChange);
    resultsEl.removeEventListener("click", onResultsClick);
  };
};
