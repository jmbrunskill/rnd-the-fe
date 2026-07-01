import type { Column } from "../../components/table.ts";
import type { StocktakeLine, StocktakePrefs } from "../../data/stocktakes.ts";

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
