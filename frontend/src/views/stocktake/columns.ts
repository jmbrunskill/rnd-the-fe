import type { Column } from "../../components/table.ts";
import type { StocktakeLine, StocktakePrefs } from "../../data/stocktakes.ts";

// One formatter instance, reused for every date cell — constructing an
// Intl.DateTimeFormat per row is measurably expensive at scale.
const dateFormat = new Intl.DateTimeFormat();

// NaiveDate arrives as "YYYY-MM-DD" (or null). Blank when absent; falls back to
// the raw string if it isn't a parseable date.
function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : dateFormat.format(d);
}

// Blank for a null number (e.g. a line not yet counted); otherwise the value.
function num(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

// Difference = (counted ?? snapshot) − snapshot. An uncounted line reads 0
// (no change yet), matching open-mSupply's accessor.
function difference(l: StocktakeLine): number {
  return (l.countedNumberOfPacks ?? l.snapshotNumberOfPacks) - l.snapshotNumberOfPacks;
}

// Doses counted = counted packs × pack size × doses per unit — vaccines only,
// and only once the line has been counted. Mirrors open-mSupply's accessor.
function dosesCounted(l: StocktakeLine): string {
  if (!l.item.isVaccine) return "";
  const counted = l.countedNumberOfPacks;
  if (counted == null) return "";
  return num(counted * (l.packSize || l.item.defaultPackSize || 1) * (l.item.doses ?? 1));
}

// The stocktake-line columns, in the same order open-mSupply renders them
// (client/packages/inventory/src/Stocktake/DetailView/columns.tsx). The three
// preference-gated columns use `include` so they vanish when the store pref is
// off. Every `l.*` access is checked against the generated StocktakeLine type.
export function lineColumns(prefs: StocktakePrefs): Column<StocktakeLine>[] {
  const { manageVaccinesInDoses, allowTrackingOfStockByDonor } = prefs;
  return [
    { header: "Code", cell: (l) => l.item.code },
    { header: "Name", cell: (l) => l.itemName },
    { header: "Batch", cell: (l) => l.batch ?? "" },
    { header: "Expiry Date", cell: (l) => fmtDate(l.expiryDate) },
    { header: "Manufacture Date", cell: (l) => fmtDate(l.manufactureDate) },
    { header: "Location", cell: (l) => l.location?.code ?? "" },
    { header: "Unit Name", cell: (l) => l.item.unitName ?? "" },
    { header: "Pack Size", align: "right", cell: (l) => num(l.packSize) },
    {
      header: "Doses Per Unit",
      align: "right",
      include: manageVaccinesInDoses,
      cell: (l) => (l.item.isVaccine ? num(l.item.doses) : ""),
    },
    { header: "Snapshot # Packs", align: "right", cell: (l) => num(l.snapshotNumberOfPacks) },
    { header: "Counted # Packs", align: "right", cell: (l) => num(l.countedNumberOfPacks) },
    {
      header: "Doses Counted",
      align: "right",
      include: manageVaccinesInDoses,
      cell: dosesCounted,
    },
    {
      header: "Difference",
      align: "right",
      cell: (l) => {
        const d = difference(l);
        return d > 0 ? `+${d}` : String(d);
      },
    },
    { header: "Reason", cell: (l) => l.reasonOption?.reason ?? "" },
    {
      header: "Donor",
      include: allowTrackingOfStockByDonor,
      cell: (l) => l.donorName ?? "",
    },
    { header: "Manufacturer", cell: (l) => l.manufacturer?.name ?? "" },
    { header: "Comment", cell: (l) => l.comment ?? "" },
  ];
}
