import type { Column } from "../../components/table.ts";
import { html } from "../../components/html.ts";
import {
  statusLabel,
  stocktakeTitle,
  type StocktakeLine,
  type StocktakePrefs,
  type StocktakeRow,
} from "../../data/stocktakes.ts";
import type { StocktakeSortFieldInput } from "../../api/schema-types.ts";

// Difference = (counted ?? snapshot) − snapshot. An uncounted line reads 0
// (no change yet), matching open-mSupply's accessor. Always a number.
function difference(l: StocktakeLine): number {
  return (l.countedNumberOfPacks ?? l.snapshotNumberOfPacks) - l.snapshotNumberOfPacks;
}

// Doses counted = counted packs × pack size × doses per unit — vaccines only,
// and only once the line has been counted. Returns the raw number (or null when
// N/A) so it both formats and SORTS as a number. Mirrors open-mSupply's accessor.
function dosesCountedValue(l: StocktakeLine): number | null {
  if (!l.item.isVaccine) return null;
  const counted = l.countedNumberOfPacks;
  if (counted == null) return null;
  return counted * (l.packSize || l.item.defaultPackSize || 1) * (l.item.doses ?? 1);
}

// The stocktake-line columns, in the same order open-mSupply renders them
// (client/packages/inventory/src/Stocktake/DetailView/columns.tsx). Each column
// declares its `kind` (data type) — the single source of truth for alignment,
// tabular-nums, formatting, and the sort comparator — plus a typed `value`
// accessor (a field typo is a compile error). `card` slots drive the <600px card
// layout; three columns are preference-gated via `include`. Nullable accessors
// end in `?? null` so blanks render "" and sort last.
export function lineColumns(prefs: StocktakePrefs): Column<StocktakeLine>[] {
  const { manageVaccinesInDoses, allowTrackingOfStockByDonor } = prefs;
  return [
    { header: "Code", card: "subtitle", value: (l) => l.item.code },
    { header: "Name", cellClass: "cell-name", card: "title", value: (l) => l.itemName },
    { header: "Batch", card: "grid", value: (l) => l.batch ?? null },
    { header: "Expiry Date", kind: "date", card: "grid", value: (l) => l.expiryDate ?? null },
    { header: "Manufacture Date", kind: "date", value: (l) => l.manufactureDate ?? null },
    { header: "Location", card: "grid", value: (l) => l.location?.code ?? null },
    { header: "Unit Name", value: (l) => l.item.unitName ?? null },
    { header: "Pack Size", kind: "number", value: (l) => l.packSize ?? null },
    {
      header: "Doses Per Unit",
      kind: "number",
      include: manageVaccinesInDoses,
      value: (l) => (l.item.isVaccine ? l.item.doses : null),
    },
    {
      header: "Snapshot # Packs",
      kind: "number",
      card: "grid",
      value: (l) => l.snapshotNumberOfPacks,
    },
    {
      header: "Counted # Packs",
      kind: "number",
      card: "grid",
      value: (l) => l.countedNumberOfPacks ?? null,
    },
    {
      header: "Doses Counted",
      kind: "number",
      key: "dosesCounted",
      include: manageVaccinesInDoses,
      value: dosesCountedValue,
    },
    {
      header: "Difference",
      kind: "number",
      key: "difference",
      card: "badge",
      value: difference,
      format: (v) => (typeof v === "number" && v > 0 ? `+${v}` : String(v ?? "")),
    },
    { header: "Reason", card: "grid", value: (l) => l.reasonOption?.reason ?? null },
    {
      header: "Donor",
      include: allowTrackingOfStockByDonor,
      value: (l) => l.donorName ?? null,
    },
    { header: "Manufacturer", card: "grid", value: (l) => l.manufacturer?.name ?? null },
    { header: "Comment", value: (l) => l.comment ?? null },
  ];
}

// Identity function that constrains a column's sort `key` to a real server
// sort-field. `sortField("descriptionn")` is a compile error, so a sortable
// list column can't declare a key the server would reject. The list view builds
// its URL-validation set from these same keys (via columnKey), so the two can't
// drift.
const sortField = <K extends StocktakeSortFieldInput>(key: K): K => key;

// The stocktake LIST columns (the narrow row — no lines). Sort runs on the
// server, so each column carries a `key` that IS a StocktakeSortFieldInput; the
// table component renders the sortable header button + aria-sort for free and the
// view wires a refetch on click. Description is a link into the detail view.
export function stocktakeColumns(): Column<StocktakeRow>[] {
  return [
    {
      header: "#",
      kind: "number",
      key: sortField("stocktakeNumber"),
      card: "subtitle",
      value: (s) => s.stocktakeNumber,
    },
    {
      header: "Description",
      key: sortField("description"),
      cellClass: "cell-name",
      card: "title",
      // `html` renders the link; `value` is what makes the header sortable
      // (isSortable requires it) — the server does the actual ordering.
      value: (s) => stocktakeTitle(s),
      html: (s) => html`<a href="/stocktake/${s.id}">${stocktakeTitle(s)}</a>`,
    },
    {
      header: "Status",
      key: sortField("status"),
      card: "badge",
      value: (s) => statusLabel(s.status),
    },
    {
      header: "Created",
      kind: "date",
      key: sortField("createdDatetime"),
      card: "grid",
      value: (s) => s.createdDatetime,
    },
    {
      header: "Comment",
      key: sortField("comment"),
      card: "grid",
      value: (s) => s.comment ?? null,
    },
  ];
}
