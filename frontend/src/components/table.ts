import { esc, type Html } from "./html.ts";

// Where a column lands in the <600px card layout (see the `@media` block in
// style.css). "title"/"subtitle" stack top-left, "badge" sits top-right, "grid"
// cells flow into the 2-column labelled grid. A column with no `card` is hidden
// on the card. The card is driven entirely off these slots — one source of truth.
export type CardSlot = "title" | "subtitle" | "badge" | "grid";

// A single column of a table over rows of type `T`. Typing the column array as
// `Column<StocktakeLine>[]` ties every `cell`/`html` accessor to the row type,
// so a typo (`row.snapshotNumPacks`) or reading a field the query didn't select
// is a compile error — the table and the GraphQL selection stay in lockstep.
export interface Column<T> {
  header: string;
  // Plain text for the cell; the renderer ESCAPES it — safe by default.
  cell: (row: T) => string;
  // Escape hatch for trusted markup (e.g. a checkbox/delete button in a later
  // step). Build it with `esc()`/a future `html``, never by hand.
  html?: (row: T) => Html;
  // "right" renders as class="num" (right-aligned, tabular figures).
  align?: "left" | "right";
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
  // Stable per-row key, emitted as data-id on each <tr> (for later row actions).
  rowKey?: (row: T) => string;
}

// Render rows + columns to a single <table> HTML string. One string, one
// `innerHTML` write at the call site — the native parser is the cheapest way to
// materialise a large table under CPU throttle.
export function renderTable<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  opts: TableOptions<T> = {},
): Html {
  const cols = columns.filter((c) => c.include !== false);
  const colClass = (c: Column<T>) => (c.align === "right" ? ' class="num"' : "");

  const head =
    "<thead><tr>" +
    cols.map((c) => `<th${colClass(c)}>${esc(c.header)}</th>`).join("") +
    "</tr></thead>";

  const body =
    "<tbody>" +
    rows
      .map((row) => {
        const key = opts.rowKey ? ` data-id="${esc(opts.rowKey(row))}"` : "";
        const cells = cols
          .map((c) => {
            const content: Html = c.html ? c.html(row) : esc(c.cell(row));
            // Card attributes only on columns that opt in (keeps the HTML lean).
            // data-label carries the field label for the grid cells' ::before.
            const cardAttr = c.card ? ` data-card="${c.card}"` : "";
            const labelAttr = c.card === "grid" ? ` data-label="${esc(c.header)}"` : "";
            return `<td${colClass(c)}${cardAttr}${labelAttr}>${content}</td>`;
          })
          .join("");
        return `<tr${key}>${cells}</tr>`;
      })
      .join("") +
    "</tbody>";

  const attrs =
    (opts.className ? ` class="${esc(opts.className)}"` : "") +
    (opts.testId ? ` data-testid="${esc(opts.testId)}"` : "") +
    (opts.ready ? ` data-ready="true"` : "");

  return `<table${attrs}>${head}${body}</table>` as Html;
}
