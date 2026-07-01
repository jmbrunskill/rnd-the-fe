import { gqlRequest } from "../api/request.ts";
import {
  StocktakesDocument,
  type StocktakeRowFragment,
} from "../api/stocktake/operations.generated.ts";
import type { StocktakeNodeStatus } from "../api/schema-types.ts";

// The row shape comes straight from the generated query type — there is no
// hand-written interface to drift from the schema. Re-exported under a friendly
// name so views import it from here rather than reaching into generated files.
export type Stocktake = StocktakeRowFragment;

// From the reference data set (see GOAL_README). Hard-coded for this R&D app;
// a real app would read it from auth / store context.
const STORE_ID = "5B28901C52396E4BB098B9862CCF5DF9";

// Fetch all stocktakes for the store, newest first. `variables` is fully typed:
// changing a field or passing an unknown one is a compile error.
export async function fetchStocktakes(): Promise<Stocktake[]> {
  const { stocktakes } = await gqlRequest(StocktakesDocument, {
    storeId: STORE_ID,
    // `key` is checked against the schema's sort-field union ('createdDatetime'
    // | 'status' | …); an unknown field is a compile error.
    sort: [{ key: "createdDatetime", desc: true }],
  });
  // `stocktakes` is a StocktakeConnector (single-member union — no guard needed).
  return stocktakes.nodes;
}

export async function getStocktake(id: string): Promise<Stocktake | undefined> {
  const all = await fetchStocktakes();
  return all.find((s) => s.id === id);
}

// --- display helpers (the status enum is the generated, type-checked one) ---

export function stocktakeTitle(s: Stocktake): string {
  return s.description || s.comment || `Stocktake #${s.stocktakeNumber}`;
}

const STATUS_LABELS: Record<StocktakeNodeStatus, string> = {
  NEW: "New",
  FINALISED: "Finalised",
};

export function statusLabel(status: StocktakeNodeStatus): string {
  return STATUS_LABELS[status];
}
