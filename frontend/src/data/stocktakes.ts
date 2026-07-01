import { gqlRequest } from "../api/request.ts";
import {
  DeleteStocktakeLinesDocument,
  StocktakeDocument,
  StocktakesDocument,
  type StocktakeFragment,
  type StocktakeLineFragment,
  type StocktakeRowFragment,
} from "../api/stocktake/operations.generated.ts";
import type {
  StocktakeFilterInput,
  StocktakeNodeStatus,
  StocktakeSortFieldInput,
} from "../api/schema-types.ts";

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

// One page of results: the rows plus the server's total (for the pager). Generic
// so any future server-paged list can reuse the shape.
export interface Paged<T> {
  rows: T[];
  totalCount: number;
}

// The list view's whole query state, in domain terms (not GraphQL shapes). The
// view owns this; `fetchStocktakes` is the single place that maps it to typed
// GraphQL variables. `sort.key` is the schema's sort-field union, so a typo is a
// compile error; `status` is the generated status union.
export interface StocktakeListQuery {
  first: number;
  offset: number;
  sort?: { key: StocktakeSortFieldInput; desc: boolean };
  search?: string; // → filter.description { like } (case-insensitive contains)
  status?: StocktakeNodeStatus; // → filter.status { equalTo }
}

// Runtime list of the status values (the type is erased at runtime). `satisfies`
// keeps it in lock-step with the generated union — adding a status to the schema
// without listing it here is a compile error. Drives the filter <select> and the
// URL-value validation.
export const STOCKTAKE_STATUSES = ["NEW", "FINALISED"] as const satisfies readonly StocktakeNodeStatus[];

// Fetch one page of stocktakes for the store. Pagination, sort and filter all run
// on the server. `variables` is fully typed against the generated operation:
// changing a field, mistyping a sort key, or passing an unknown filter field is a
// compile error.
export async function fetchStocktakes(q: StocktakeListQuery): Promise<Paged<StocktakeRow>> {
  const filter: StocktakeFilterInput = {};
  if (q.search) filter.description = { like: q.search };
  if (q.status) filter.status = { equalTo: q.status };

  const { stocktakes } = await gqlRequest(StocktakesDocument, {
    storeId: STORE_ID,
    page: { first: q.first, offset: q.offset },
    // Default to newest-first when the user hasn't picked a sort.
    sort: [q.sort ?? { key: "createdDatetime", desc: true }],
    filter,
  });
  // `stocktakes` is a StocktakeConnector (single-member union — no guard needed).
  return { rows: stocktakes.nodes, totalCount: stocktakes.totalCount };
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

// The text a global search matches against for one line: the identifiers users
// search by (item code, name, batch), lowercased so filtering is a cheap
// substring scan. Precompute one per line at load; see the detail view's filter.
export function lineHaystack(l: StocktakeLine): string {
  return `${l.item.code}\n${l.itemName}\n${l.batch ?? ""}`.toLowerCase();
}

// Outcome of a batch delete: which ids the server actually deleted, and any
// per-line failures (so the caller removes only confirmed rows and surfaces the
// rest). gqlRequest throws on transport/GraphQL-level errors — caught upstream.
export interface DeleteResult {
  deleted: string[];
  errors: { id: string; message: string }[];
}

// Delete N stocktake lines in one batch request. Parses the per-id response.
export async function deleteStocktakeLines(ids: string[]): Promise<DeleteResult> {
  const { batchStocktake } = await gqlRequest(DeleteStocktakeLinesDocument, {
    storeId: STORE_ID,
    ids: ids.map((id) => ({ id })),
  });
  const deleted: string[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const line of batchStocktake.deleteStocktakeLines ?? []) {
    if (line.response.__typename === "DeleteResponse") deleted.push(line.id);
    else errors.push({ id: line.id, message: line.response.error.description });
  }
  return { deleted, errors };
}
