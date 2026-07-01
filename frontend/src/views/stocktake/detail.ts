import type { View } from "../../router.ts";
import { getStocktake, statusLabel, stocktakeTitle } from "../../data/stocktakes.ts";

const page = (body: string) =>
  `<section class="page"><p><a href="/stocktake">← Back to stocktakes</a></p>${body}</section>`;

// params is typed { id: string }, derived from the "/stocktake/:id" pattern.
// Accessing params.idd (or any name not in the pattern) is a compile error.
export const render: View<"/stocktake/:id"> = (outlet, params) => {
  outlet.innerHTML = page(`<p class="muted">Loading…</p>`);

  let cancelled = false;

  getStocktake(params.id)
    .then((stocktake) => {
      if (cancelled) return;
      if (!stocktake) {
        outlet.innerHTML = page(
          `<h1>Stocktake not found</h1>` +
            `<p>No stocktake with id <code>${params.id}</code>.</p>`,
        );
        return;
      }
      outlet.innerHTML = page(
        `<h1>${stocktakeTitle(stocktake)}</h1>` +
          `<p>ID: <code>${stocktake.id}</code> · #${stocktake.stocktakeNumber}` +
          ` · ${statusLabel(stocktake.status)}` +
          ` · created ${new Date(stocktake.createdDatetime).toLocaleString()}</p>` +
          (stocktake.comment ? `<p>${stocktake.comment}</p>` : "") +
          // Stocktake-lines table. Rendered only once the data has loaded, with a
          // data-ready hook so perf tooling can stamp "real content on screen"
          // (see .claude/skills/perf-measure). Rows are populated in a later
          // iteration; for now it's an intentionally empty baseline (0 rows).
          `<table class="stock-table" data-testid="stocktake-table" data-ready="true">` +
          `<thead><tr><th>Item</th><th>Code</th><th>Batch</th><th>Expiry</th>` +
          `<th>Snapshot qty</th><th>Counted qty</th></tr></thead>` +
          `<tbody></tbody>` +
          `</table>`,
      );
    })
    .catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      outlet.innerHTML = page(`<p class="error">Failed to load: ${message}</p>`);
    });

  return () => {
    cancelled = true;
  };
};
