import type { View } from "../../router.ts";
import {
  fetchStocktakes,
  statusLabel,
  stocktakeTitle,
  type StocktakeRow,
} from "../../data/stocktakes.ts";
import { esc } from "../../components/html.ts";

const page = (body: string) => `<section class="page"><h1>Stocktakes</h1>${body}</section>`;

const row = (s: StocktakeRow) =>
  `<li><a href="/stocktake/${esc(s.id)}">${esc(stocktakeTitle(s))}</a>` +
  ` <span class="muted">#${s.stocktakeNumber} · ${esc(statusLabel(s.status))}` +
  ` · ${esc(new Date(s.createdDatetime).toLocaleDateString())}</span></li>`;

export const render: View<"/stocktake"> = (outlet) => {
  outlet.innerHTML = page(`<p class="muted">Loading…</p>`);

  // Guard against a late response landing after the user navigated away: the
  // router calls the returned cleanup on navigation, flipping `cancelled`.
  let cancelled = false;

  fetchStocktakes()
    .then((stocktakes) => {
      if (cancelled) return;
      outlet.innerHTML = page(
        stocktakes.length
          ? `<ul class="list">${stocktakes.map(row).join("")}</ul>`
          : `<p class="muted">No stocktakes found.</p>`,
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
