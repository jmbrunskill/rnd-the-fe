import type { View } from "../../router.ts";
import {
  getStocktake,
  lineHaystack,
  statusLabel,
  stocktakeTitle,
  type StocktakeLine,
} from "../../data/stocktakes.ts";
import { esc } from "../../components/html.ts";
import { renderTable } from "../../components/table.ts";
import { lineColumns } from "./columns.ts";

// page--table opts this view into the full-width, viewport-bounded table layout
// (edge-to-edge, internal scroll region) instead of the centered .page column.
const page = (body: string) =>
  `<section class="page page--table"><p><a href="/stocktake">← Back to stocktakes</a></p>${body}</section>`;

// params is typed { id: string }, derived from the "/stocktake/:id" pattern.
// Accessing params.idd (or any name not in the pattern) is a compile error.
export const render: View<"/stocktake/:id"> = (outlet, params) => {
  outlet.innerHTML = page(`<p class="muted">Loading…</p>`);

  let cancelled = false;
  // Tears down the filter input listener + pending debounce on nav-away.
  let teardownFilter: (() => void) | undefined;

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

      // The whole view — header + table — is built as one string and assigned
      // once. data-testid / data-ready land in the same write as the rows, so
      // the perf collector stamps "data rendered" only when rows are on screen.
      const header =
        `<h1>${esc(stocktakeTitle(stocktake))}</h1>` +
        `<p>ID: <code>${esc(stocktake.id)}</code> · #${stocktake.stocktakeNumber}` +
        ` · ${esc(statusLabel(stocktake.status))}` +
        ` · created ${esc(new Date(stocktake.createdDatetime).toLocaleString())}</p>` +
        (stocktake.comment ? `<p>${esc(stocktake.comment)}</p>` : "");

      const table = renderTable(lines, lineColumns(prefs), {
        className: "stock-table",
        testId: "stocktake-table",
        ready: true,
        rowKey: (l) => l.id,
      });

      // Search box + live count live ABOVE the table so filter updates never
      // touch the input (focus/value survive). Left unstyled on purpose — the
      // design-system "inputs" increment owns the presentation.
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

      if (lines.length) teardownFilter = wireFilter(outlet, lines);
    })
    .catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      outlet.innerHTML = page(`<p class="error">Failed to load: ${esc(message)}</p>`);
    });

  return () => {
    cancelled = true;
    teardownFilter?.();
  };
};

// Wire the client-side filter over the already-rendered rows. Uses the
// row-visibility-toggle strategy (flip each <tr>'s inline display) — the
// measured-cheapest update: ~57ms median / ~104ms p95 vs ~90/450ms for
// rebuilding the tbody at 1506 rows (see docs/perf/interaction-runs.md). Purely
// client-side over loaded data, so filtering fires no GraphQL requests.
function wireFilter(outlet: HTMLElement, lines: readonly StocktakeLine[]): () => void {
  const input = outlet.querySelector<HTMLInputElement>(".stock-filter");
  const countEl = outlet.querySelector<HTMLElement>(".stock-count");
  const rowEls = Array.from(
    outlet.querySelectorAll<HTMLElement>('[data-testid="stocktake-table"] tbody tr'),
  );
  if (!input || !countEl) return () => {};

  // rowEls[i] corresponds to lines[i]: renderTable emits rows in array order.
  const haystacks = lines.map(lineHaystack);
  const total = lines.length;
  const setCount = (shown: number) => {
    countEl.textContent = `Showing ${shown} of ${total}`;
  };
  setCount(total);

  const applyFilter = (raw: string) => {
    const q = raw.trim().toLowerCase();
    let shown = 0;
    for (let i = 0; i < rowEls.length; i++) {
      const match = q === "" || haystacks[i].includes(q);
      const want = match ? "" : "none";
      if (rowEls[i].style.display !== want) rowEls[i].style.display = want;
      if (match) shown++;
    }
    setCount(shown);
  };

  // Debounce so a fast typist coalesces keystrokes into one update.
  let timer = 0;
  const onInput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => applyFilter(input.value), 120);
  };
  input.addEventListener("input", onInput);

  return () => {
    clearTimeout(timer);
    input.removeEventListener("input", onInput);
  };
}
