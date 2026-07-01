import { esc, type Html } from "./html.ts";

// Where a column lands in the <600px card layout (see the `@media` block in
// style.css). "title"/"subtitle" stack top-left, "badge" sits top-right, "grid"
// cells flow into the 2-column labelled grid. A column with no `card` is hidden
// on the card. The card is driven entirely off these slots — one source of truth.
export type CardSlot = "title" | "subtitle" | "badge" | "grid";

// The raw, comparable/formattable value a column yields for one row.
// null = "no value": renders blank and sorts last (in both directions).
export type CellValue = string | number | boolean | Date | null;

// A column's data type — the single source of truth for alignment, tabular
// figures, default formatting, and the sort comparator.
export type ColumnKind = "text" | "number" | "currency" | "date" | "boolean" | "actions";

// A single column of a table over rows of type `T`. `value` is tied to `T`, so a
// typo (`row.snapshotNumPacks`) or reading a field the query didn't select is a
// compile error — the table and the GraphQL selection stay in lockstep.
export interface Column<T> {
  header: string;
  // Raw value for the cell. Drives BOTH the default formatter AND the sort
  // comparator, so display and sort never diverge. Omit only for kind "actions".
  value?: (row: T) => CellValue;
  // Data type; default "text". Drives align, tabular-nums, default format,
  // comparator, and default sortability.
  kind?: ColumnKind;
  // Per-column display override; receives the same raw value `value()` returned.
  // Returns plain text (the renderer escapes it). Falls back to the kind format.
  format?: (value: CellValue, row: T) => string;
  // Trusted-markup escape hatch (e.g. a checkbox/delete button); supersedes
  // value/format for rendering. Build it with `esc()`/`html``, never by hand.
  html?: (row: T) => Html;
  // Trusted-markup escape hatch for the HEADER cell (e.g. a select-all checkbox),
  // used instead of the `esc(header)` text / sortable button when present.
  headerHtml?: () => Html;
  // Opt a column OUT of sorting (kind "actions" is never sortable regardless).
  sortable?: boolean;
  // Stable sort id + header-click key; defaults to `header`.
  key?: string;
  // Extra class on the column's <th> and <td>s (e.g. "cell-name" for the clamp).
  cellClass?: string;
  // Default true. `false` drops the column — used for preference-gated columns.
  include?: boolean;
  // Mobile (<600px) card placement. Omit => the column is hidden on the card.
  card?: CardSlot;
}

export interface TableOptions<T> {
  className?: string;
  // Sets data-testid on the <table>; the perf collector keys off this.
  testId?: string;
  // Sets data-ready="true"; set it in the same render as the rows, never before.
  ready?: boolean;
  // Stable per-row key, emitted as data-id on each <tr> (row identity for sort
  // reordering + the client-side filter).
  rowKey?: (row: T) => string;
}

// kind → presentation class + whether it sorts by default.
const KIND: Record<ColumnKind, { cls: string; sortable: boolean }> = {
  text: { cls: "", sortable: true },
  number: { cls: "num", sortable: true },
  currency: { cls: "num", sortable: true },
  date: { cls: "", sortable: true },
  boolean: { cls: "ctr", sortable: true },
  actions: { cls: "", sortable: false },
};

// One formatter instance each — constructing an Intl formatter per row is
// measurably expensive at 1500+ rows.
const numberFmt = new Intl.NumberFormat();
const currencyFmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const toDate = (v: CellValue): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

// The kind's default display formatting. null → "" (blank cell).
function defaultFormat(kind: ColumnKind, v: CellValue): string {
  if (v == null) return "";
  switch (kind) {
    case "number":
      return numberFmt.format(v as number);
    case "currency":
      return currencyFmt.format(v as number);
    case "date": {
      const d = toDate(v);
      return d ? dateFmt.format(d) : String(v);
    }
    case "boolean":
      return v ? "Yes" : "No";
    default:
      return String(v);
  }
}

// Compare two NON-null values by kind (ascending). Null handling lives in
// sortRows so "nulls last" stays direction-independent.
function baseCompare(kind: ColumnKind, a: CellValue, b: CellValue): number {
  switch (kind) {
    case "number":
    case "currency":
      return (a as number) - (b as number);
    case "date": {
      const da = toDate(a);
      const db = toDate(b);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    }
    case "boolean":
      return a === b ? 0 : a ? 1 : -1;
    default:
      return String(a).localeCompare(String(b));
  }
}

export const columnKind = <T>(c: Column<T>): ColumnKind => c.kind ?? "text";
export const columnKey = <T>(c: Column<T>): string => c.key ?? c.header;
export const isSortable = <T>(c: Column<T>): boolean =>
  KIND[columnKind(c)].sortable && c.sortable !== false && c.value != null;

const columnClass = <T>(c: Column<T>): string =>
  [KIND[columnKind(c)].cls, c.cellClass].filter(Boolean).join(" ");
const clsAttr = (cls: string) => (cls ? ` class="${cls}"` : "");

// Sort a COPY of `rows` by one column. Nulls sort last in both directions; ties
// keep original order (stable). `value` is computed once per row, not per
// comparison.
export function sortRows<T>(rows: readonly T[], col: Column<T>, dir: "asc" | "desc"): T[] {
  const val = col.value;
  if (!val) return rows.slice();
  const kind = columnKind(col);
  const mul = dir === "asc" ? 1 : -1;
  const keyed = rows.map((r, i) => ({ r, i, v: val(r) }));
  keyed.sort((a, b) => {
    if (a.v == null && b.v == null) return a.i - b.i;
    if (a.v == null) return 1; // nulls last — independent of direction
    if (b.v == null) return -1;
    const c = baseCompare(kind, a.v, b.v);
    return c !== 0 ? mul * c : a.i - b.i;
  });
  return keyed.map((k) => k.r);
}

// The <tr>… rows string (no <tbody> wrapper). Reused by the initial render and
// by the tbody-rebuild sort strategy. Cells carry the kind class (+ any
// cellClass) and the card attributes; each <tr> carries data-id for identity.
export function renderRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  opts: Pick<TableOptions<T>, "rowKey"> = {},
): Html {
  return rows
    .map((row) => {
      const key = opts.rowKey ? ` data-id="${esc(opts.rowKey(row))}"` : "";
      const cells = columns
        .map((c) => {
          let content: Html;
          if (c.html) {
            content = c.html(row);
          } else {
            const v = c.value ? c.value(row) : null;
            content = esc(c.format ? c.format(v, row) : defaultFormat(columnKind(c), v));
          }
          const cardAttr = c.card ? ` data-card="${c.card}"` : "";
          const labelAttr = c.card === "grid" ? ` data-label="${esc(c.header)}"` : "";
          return `<td${clsAttr(columnClass(c))}${cardAttr}${labelAttr}>${content}</td>`;
        })
        .join("");
      return `<tr${key}>${cells}</tr>`;
    })
    .join("") as Html;
}

// Render rows + columns to a single <table> HTML string. Sortable headers emit
// `aria-sort` + `data-sort-key` and a <button> control (keyboard/focus for
// free); the detail view flips aria-sort + reorders on click.
export function renderTable<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  opts: TableOptions<T> = {},
): Html {
  const cols = columns.filter((c) => c.include !== false);

  const head =
    "<thead><tr>" +
    cols
      .map((c) => {
        const cls = clsAttr(columnClass(c));
        if (c.headerHtml) {
          return `<th${cls}>${c.headerHtml()}</th>`;
        }
        if (isSortable(c)) {
          return (
            `<th${cls} aria-sort="none" data-sort-key="${esc(columnKey(c))}">` +
            `<button type="button" class="th-sort">${esc(c.header)}</button>` +
            "</th>"
          );
        }
        return `<th${cls}>${esc(c.header)}</th>`;
      })
      .join("") +
    "</tr></thead>";

  const body = "<tbody>" + renderRows(rows, cols, { rowKey: opts.rowKey }) + "</tbody>";

  const attrs =
    (opts.className ? ` class="${esc(opts.className)}"` : "") +
    (opts.testId ? ` data-testid="${esc(opts.testId)}"` : "") +
    (opts.ready ? ` data-ready="true"` : "");

  return `<table${attrs}>${head}${body}</table>` as Html;
}
