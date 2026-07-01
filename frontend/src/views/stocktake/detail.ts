import type { View } from "../../router.ts";
import {
  getStocktake,
  lineHaystack,
  statusLabel,
  stocktakeTitle,
  type StocktakeLine,
} from "../../data/stocktakes.ts";
import { esc } from "../../components/html.ts";
import {
  renderTable,
  sortRows,
  columnKey,
  isSortable,
  type Column,
} from "../../components/table.ts";
import { lineColumns } from "./columns.ts";
import { queryParams, setQuery } from "../../url.ts";

// page--table opts this view into the full-width, viewport-bounded table layout
// (edge-to-edge, internal scroll region) instead of the centered .page column.
const page = (body: string) =>
  `<section class="page page--table"><p><a href="/stocktake">← Back to stocktakes</a></p>${body}</section>`;

// params is typed { id: string }, derived from the "/stocktake/:id" pattern.
// Accessing params.idd (or any name not in the pattern) is a compile error.
export const render: View<"/stocktake/:id"> = (outlet, params) => {
  outlet.innerHTML = page(`<p class="muted">Loading…</p>`);

  let cancelled = false;
  // Tears down the filter + sort listeners and pending debounce on nav-away.
  let teardown: (() => void) | undefined;

  getStocktake(params.id)
    .then((detail) => {
      if (cancelled) return;
      if (!detail) {
        outlet.innerHTML = page(
          `<h1>Stocktake not found</h1>` +
            `<p>No stocktake with id <code>${esc(params.id)}</code>.</p>`,
        );
        return;
      }
      const { stocktake, lines, prefs } = detail;

      const header =
        `<h1>${esc(stocktakeTitle(stocktake))}</h1>` +
        `<p>ID: <code>${esc(stocktake.id)}</code> · #${stocktake.stocktakeNumber}` +
        ` · ${esc(statusLabel(stocktake.status))}` +
        ` · created ${esc(new Date(stocktake.createdDatetime).toLocaleString())}</p>` +
        (stocktake.comment ? `<p>${esc(stocktake.comment)}</p>` : "");

      const cols = lineColumns(prefs);
      const table = renderTable(lines, cols, {
        className: "stock-table",
        testId: "stocktake-table",
        ready: true,
        rowKey: (l) => l.id,
      });

      // Search box + live count live ABOVE the table so updates never touch the
      // input (focus/value survive). Left unstyled on purpose — the design-system
      // "inputs" increment owns the presentation.
      const toolbar =
        `<div class="stock-toolbar">` +
        `<input type="search" class="stock-filter"` +
        ` placeholder="Search item code, name or batch…"` +
        ` aria-label="Search stocktake lines" autocomplete="off" spellcheck="false">` +
        `<span class="stock-count" aria-live="polite"></span>` +
        `</div>`;

      outlet.innerHTML = page(
        header +
          (lines.length
            ? toolbar + `<div class="table-wrap">${table}</div>`
            : `<p class="muted">No lines in this stocktake.</p>`),
      );

      if (lines.length) teardown = wireTable(outlet, lines, cols);
    })
    .catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      outlet.innerHTML = page(`<p class="error">Failed to load: ${esc(message)}</p>`);
    });

  return () => {
    cancelled = true;
    teardown?.();
  };
};

// Wire client-side filter + sort over the already-rendered rows. Both are pure
// client-side over the loaded data — they fire NO GraphQL and never reload.
//
// - Filter: row-visibility toggle (flip each <tr>'s inline display) — the
//   measured-cheapest update (~57ms median / ~104ms p95; docs/perf/interaction-runs.md).
// - Sort: reorder the existing <tr> nodes into sorted order via one
//   DocumentFragment.appendChild (the measured winner: ~282ms median vs ~335ms
//   for a tbody rebuild). Because the SAME nodes move, each row's filter
//   `display` rides along — so sort and filter compose without re-evaluating
//   either. State is local (no store/library).
function wireTable(
  outlet: HTMLElement,
  lines: readonly StocktakeLine[],
  cols: readonly Column<StocktakeLine>[],
): () => void {
  const tableEl = outlet.querySelector<HTMLElement>('[data-testid="stocktake-table"]');
  const input = outlet.querySelector<HTMLInputElement>(".stock-filter");
  const countEl = outlet.querySelector<HTMLElement>(".stock-count");
  const tbody = tableEl?.querySelector("tbody");
  const thead = tableEl?.querySelector("thead");
  if (!tableEl || !input || !countEl || !tbody || !thead) return () => {};

  // Row identity by line id (data-id) — robust to reordering (unlike array
  // index). Both maps are built once.
  const nodeById = new Map<string, HTMLElement>();
  for (const tr of Array.from(tbody.children) as HTMLElement[]) {
    if (tr.dataset.id) nodeById.set(tr.dataset.id, tr);
  }
  const haystackById = new Map(lines.map((l) => [l.id, lineHaystack(l)]));
  const sortableByKey = new Map<string, Column<StocktakeLine>>();
  for (const c of cols) if (isSortable(c)) sortableByKey.set(columnKey(c), c);

  const total = lines.length;
  const setCount = (shown: number) => {
    countEl.textContent = `Showing ${shown} of ${total}`;
  };

  const view = { query: "", sortKey: null as string | null, sortDir: "asc" as "asc" | "desc" };

  // Filter: toggle each row's display by the query; update the count. Order-
  // independent, so it's unaffected by the current sort.
  const applyFilter = () => {
    const q = view.query.trim().toLowerCase();
    let shown = 0;
    for (const l of lines) {
      const node = nodeById.get(l.id);
      if (!node) continue;
      const match = q === "" || (haystackById.get(l.id) ?? "").includes(q);
      const want = match ? "" : "none";
      if (node.style.display !== want) node.style.display = want;
      if (match) shown++;
    }
    setCount(shown);
  };

  // Sort: reorder nodes into sorted (or natural) order. Nodes keep their
  // display, so the filter's visibility survives — no re-filter needed, and the
  // count is unchanged (same rows, reordered).
  const applySort = () => {
    const col = view.sortKey ? sortableByKey.get(view.sortKey) : undefined;
    const ordered = col ? sortRows(lines, col, view.sortDir) : lines;
    const frag = document.createDocumentFragment();
    for (const l of ordered) {
      const node = nodeById.get(l.id);
      if (node) frag.appendChild(node); // appendChild MOVES the existing node
    }
    tbody.appendChild(frag); // one reflow
  };

  const updateAriaSort = () => {
    for (const th of Array.from(thead.querySelectorAll<HTMLElement>("th[data-sort-key]"))) {
      const active = th.dataset.sortKey === view.sortKey;
      th.setAttribute(
        "aria-sort",
        active ? (view.sortDir === "asc" ? "ascending" : "descending") : "none",
      );
    }
  };

  // Mirror the current filter + sort into the URL (?search / ?sort / ?dir) via
  // replaceState — shareable, survives refresh, and (bypassing the router)
  // fires no refetch. `dir` is written only for desc; asc is implied.
  const syncUrl = () =>
    setQuery({
      search: view.query.trim() || null,
      sort: view.sortKey,
      dir: view.sortKey && view.sortDir === "desc" ? "desc" : null,
    });

  // Filter input — debounced so fast typing coalesces into one update.
  let timer = 0;
  const onInput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      view.query = input.value;
      applyFilter();
      syncUrl();
    }, 120);
  };
  input.addEventListener("input", onInput);

  // Sort — one delegated listener on <thead>. The header control is a native
  // <button>, so Enter/Space fire a click for free (no keydown handler).
  // Cycle: asc → desc → none (so the natural/server order is reachable).
  const onHeadClick = (e: Event) => {
    const th = (e.target as HTMLElement).closest<HTMLElement>("th[data-sort-key]");
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;
    if (view.sortKey !== key) {
      view.sortKey = key;
      view.sortDir = "asc";
    } else if (view.sortDir === "asc") {
      view.sortDir = "desc";
    } else {
      view.sortKey = null;
      view.sortDir = "asc";
    }
    updateAriaSort();
    applySort();
    syncUrl();
  };
  thead.addEventListener("click", onHeadClick);

  // Restore filter + sort from the URL on mount (deep link / refresh / browser
  // back into this view). Invalid/stale ?sort keys are ignored.
  const p = queryParams();
  view.query = p.get("search") ?? "";
  const urlSort = p.get("sort");
  if (urlSort && sortableByKey.has(urlSort)) {
    view.sortKey = urlSort;
    view.sortDir = p.get("dir") === "desc" ? "desc" : "asc";
  }
  input.value = view.query;
  updateAriaSort();
  if (view.sortKey) applySort();
  if (view.query) applyFilter();
  else setCount(total);

  return () => {
    clearTimeout(timer);
    input.removeEventListener("input", onInput);
    thead.removeEventListener("click", onHeadClick);
  };
}
