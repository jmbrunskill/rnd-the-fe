import type { View } from "../../router.ts";
import { getStocktake, statusLabel, stocktakeTitle } from "../../data/stocktakes.ts";
import { esc } from "../../components/html.ts";
import { renderTable } from "../../components/table.ts";
import { lineColumns } from "./columns.ts";

const page = (body: string) =>
  `<section class="page"><p><a href="/stocktake">← Back to stocktakes</a></p>${body}</section>`;

// params is typed { id: string }, derived from the "/stocktake/:id" pattern.
// Accessing params.idd (or any name not in the pattern) is a compile error.
export const render: View<"/stocktake/:id"> = (outlet, params) => {
  outlet.innerHTML = page(`<p class="muted">Loading…</p>`);

  let cancelled = false;

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

      outlet.innerHTML = page(
        header +
          `<div class="table-wrap">${table}</div>` +
          (lines.length ? "" : `<p class="muted">No lines in this stocktake.</p>`),
      );
    })
    .catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      outlet.innerHTML = page(`<p class="error">Failed to load: ${esc(message)}</p>`);
    });

  return () => {
    cancelled = true;
  };
};
