import { gqlRequest } from "../api/request.ts";
import {
  StocktakeDocument,
  StocktakesDocument,
  type StocktakeFragment,
  type StocktakeLineFragment,
  type StocktakeRowFragment,
} from "../api/stocktake/operations.generated.ts";
import type { StocktakeNodeStatus } from "../api/schema-types.ts";

// All shapes come straight from the generated query types — there is no
// hand-written interface to drift from the schema. Re-exported under friendly
// names so views import them from here rather than reaching into generated files.
//
// `StocktakeRow` is the list view's narrow row (no lines); `Stocktake` is the
// detail object (a superset — includes lines); `StocktakeLine` is one line.
export type StocktakeRow = StocktakeRowFragment;
export type Stocktake = StocktakeFragment;
export type StocktakeLine = StocktakeLineFragment;

// The two store preferences that gate optional detail-table columns.
export interface StocktakePrefs {
  manageVaccinesInDoses: boolean;
  allowTrackingOfStockByDonor: boolean;
}

// Everything the detail view needs from one round trip.
export interface StocktakeDetail {
  stocktake: Stocktake;
  lines: StocktakeLine[];
  prefs: StocktakePrefs;
}

// From the reference data set (see GOAL_README). Hard-coded for this R&D app;
// a real app would read it from auth / store context.
const STORE_ID = "5B28901C52396E4BB098B9862CCF5DF9";

// Fetch all stocktakes for the store, newest first. `variables` is fully typed:
// changing a field or passing an unknown one is a compile error.
export async function fetchStocktakes(): Promise<StocktakeRow[]> {
  const { stocktakes } = await gqlRequest(StocktakesDocument, {
    storeId: STORE_ID,
    // `key` is checked against the schema's sort-field union ('createdDatetime'
    // | 'status' | …); an unknown field is a compile error.
    sort: [{ key: "createdDatetime", desc: true }],
  });
  // `stocktakes` is a StocktakeConnector (single-member union — no guard needed).
  return stocktakes.nodes;
}

// One round trip: the stocktake header, all its lines, and the column-gating
// preferences (a second root field, not a second request).
export async function getStocktake(id: string): Promise<StocktakeDetail | undefined> {
  const { stocktake, preferences } = await gqlRequest(StocktakeDocument, {
    stocktakeId: id,
    storeId: STORE_ID,
  });
  // `stocktake` is a union (StocktakeNode | NodeError). The __typename guard is
  // the source of truth that narrows it to the node with lines; a NodeError
  // (e.g. bad id) falls through to `undefined` — rendered as "not found".
  if (stocktake.__typename !== "StocktakeNode") return undefined;
  return {
    stocktake,
    lines: stocktake.lines.nodes,
    prefs: {
      manageVaccinesInDoses: preferences.manageVaccinesInDoses,
      allowTrackingOfStockByDonor: preferences.allowTrackingOfStockByDonor,
    },
  };
}

// --- display helpers (the status enum is the generated, type-checked one) ---

// Takes the narrow StocktakeRow shape so it serves both the list view and the
// detail object (which is a superset and stays assignable).
export function stocktakeTitle(s: StocktakeRow): string {
  return s.description || s.comment || `Stocktake #${s.stocktakeNumber}`;
}

const STATUS_LABELS: Record<StocktakeNodeStatus, string> = {
  NEW: "New",
  FINALISED: "Finalised",
};

export function statusLabel(status: StocktakeNodeStatus): string {
  return STATUS_LABELS[status];
}
