#!/usr/bin/env node
/*
 * perf-measure — results-document owner.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the results HTML: the column
 * set, their order/grouping, the number formatting, and the on-disk layout all
 * live here. The skill hands it one aggregated `record` per measured scenario;
 * this file decides how that becomes a <tr>.
 *
 * Append-only by construction: a new row is inserted immediately before a
 * marker comment that sits at the end of <tbody>. If the marker is missing (or
 * duplicated) we refuse to write, so a corrupted/edited doc can't silently grow
 * malformed history.
 *
 * CLI:  node append-row.mjs <results.html> <record.json>
 *   - creates <results.html> from a template if it doesn't exist
 *   - reads the aggregated record from <record.json> (or "-" for stdin)
 *
 * Record shape:
 *   {
 *     context: { utc, scenario, branch, commit, cpu, cores, os, chrome,
 *                cpuThrottle, network, cache, dataItems, runs,
 *                collectorVersion, heapSnapshotMB, notes },
 *     samples: { <metricKey>: number[] , ... }   // per-kept-run values
 *   }
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

// Bump when the column set changes in a way that breaks comparability with
// existing docs (start a fresh doc, or migrate old rows, when you do).
export const RESULTS_FORMAT_VERSION = "1.0.0";

// Marker that the appender inserts new rows before. Must appear exactly once.
export const ROW_MARKER = "<!-- perf-measure:rows (do not remove) -->";

/*
 * COLUMNS — the fixed, team-wide schema. Order here == column order in the doc.
 * `src` is where the value comes from:
 *    "ctx"  -> record.context[key]            (stamped string/number)
 * and the rest read record.samples[key] (an array of per-run numbers):
 *    "stat" -> "median (min–max)" integer ms  (headline + slowest data req)
 *    "int"  -> median, rounded integer
 *    "f1"   -> median, 1 decimal
 *    "f3"   -> median, 3 decimals
 *    "lcp"  -> median, or "—" if every run was null (normal for SPAs)
 *    "num"  -> single number from context (null -> "—", 1 decimal)
 */
export const COLUMNS = [
  // --- Run context ----------------------------------------------------------
  { key: "utc", label: "UTC time", group: "Run context", src: "ctx" },
  { key: "scenario", label: "Scenario", group: "Run context", src: "ctx" },
  { key: "branch", label: "Branch", group: "Run context", src: "ctx" },
  { key: "commit", label: "Commit", group: "Run context", src: "ctx" },
  { key: "cpu", label: "CPU", group: "Run context", src: "ctx" },
  { key: "cores", label: "Cores", group: "Run context", src: "ctx" },
  { key: "os", label: "OS", group: "Run context", src: "ctx" },
  { key: "chrome", label: "Chrome", group: "Run context", src: "ctx" },
  { key: "cpuThrottle", label: "CPU×", group: "Run context", src: "ctx" },
  { key: "network", label: "Net", group: "Run context", src: "ctx" },
  { key: "cache", label: "Cache", group: "Run context", src: "ctx" },
  { key: "dataItems", label: "Data items", group: "Run context", src: "ctx" },
  { key: "runs", label: "Runs (N)", group: "Run context", src: "ctx" },
  { key: "collectorVersion", label: "Collector", group: "Run context", src: "ctx" },

  // --- Headline (content-based) — RANK ON THESE -----------------------------
  { key: "timeToDataRenderedMs", label: "Data rendered (ms)", group: "Headline", src: "stat" },
  { key: "timeToNetworkQuietMs", label: "Network quiet (ms) ★", group: "Headline", src: "stat" },

  // --- Network waterfall ----------------------------------------------------
  { key: "dataRequestCount", label: "Data reqs", group: "Network", src: "int" },
  { key: "slowestDataRequestMs", label: "Slowest req (ms)", group: "Network", src: "stat" },

  // --- Reference (record, do NOT rank) --------------------------------------
  { key: "ttfbMs", label: "TTFB (ms)", group: "Reference", src: "int" },
  { key: "fcpMs", label: "FCP (ms)", group: "Reference", src: "int" },
  { key: "loadMs", label: "load (ms)", group: "Reference", src: "int" },
  { key: "cls", label: "CLS", group: "Reference", src: "f3" },
  { key: "lcpMs", label: "LCP (ms)", group: "Reference", src: "lcp" },

  // --- Memory ---------------------------------------------------------------
  { key: "jsHeapMB", label: "JS heap (MB)", group: "Memory", src: "f1" },
  { key: "heapSnapshotMB", label: "Heap snapshot (MB)", group: "Memory", src: "num" },

  // --- Weight ---------------------------------------------------------------
  { key: "domNodes", label: "DOM nodes", group: "Weight", src: "int" },
  { key: "requestCount", label: "Requests", group: "Weight", src: "int" },
  { key: "transferDecodedKB", label: "Transfer dec. (KB)", group: "Weight", src: "f1" },

  // --- Free text ------------------------------------------------------------
  { key: "notes", label: "Notes", group: "Notes", src: "ctx" },
];

// ---- number helpers ---------------------------------------------------------
// Drop null/undefined BEFORE Number() — note Number(null) === 0, so a column
// of nulls (e.g. LCP on an SPA) must filter to empty, not to a column of zeros.
const finite = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter((n) => n != null)
    .map(Number)
    .filter((n) => Number.isFinite(n));

export function median(arr) {
  const xs = finite(arr).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// "median (min–max)" for stat columns; collapses to "median" when all equal.
export function formatStat(arr) {
  const xs = finite(arr);
  if (xs.length === 0) return "—";
  const med = Math.round(median(xs));
  const lo = Math.round(Math.min(...xs));
  const hi = Math.round(Math.max(...xs));
  return lo === hi ? String(med) : `${med} (${lo}–${hi})`;
}

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Format a single column's cell text from the record.
function cellValue(col, record) {
  const ctx = record.context || {};
  const samples = record.samples || {};
  switch (col.src) {
    case "ctx": {
      const v = ctx[col.key];
      return v == null || v === "" ? "—" : String(v);
    }
    case "num": {
      const v = ctx[col.key];
      return v == null || !Number.isFinite(Number(v)) ? "—" : String(Math.round(Number(v) * 10) / 10);
    }
    case "stat":
      return formatStat(samples[col.key]);
    case "int": {
      const m = median(samples[col.key]);
      return m == null ? "—" : String(Math.round(m));
    }
    case "f1": {
      const m = median(samples[col.key]);
      return m == null ? "—" : String(Math.round(m * 10) / 10);
    }
    case "f3": {
      const m = median(samples[col.key]);
      return m == null ? "—" : String(Math.round(m * 1000) / 1000);
    }
    case "lcp": {
      const m = median(samples[col.key]);
      return m == null ? "—" : String(Math.round(m)); // "—" is normal for SPAs
    }
    default:
      return "—";
  }
}

export function renderRow(record) {
  const cells = COLUMNS.map((col) => {
    const cls = col.src === "ctx" || col.src === "stat" ? "" : ' class="num"';
    return `<td${cls}>${escapeHtml(cellValue(col, record))}</td>`;
  });
  return `      <tr>${cells.join("")}</tr>`;
}

// Contiguous group spans for the top header row.
function groupSpans() {
  const spans = [];
  for (const col of COLUMNS) {
    const last = spans[spans.length - 1];
    if (last && last.group === col.group) last.span += 1;
    else spans.push({ group: col.group, span: 1 });
  }
  return spans;
}

function theadHtml() {
  const groups = groupSpans()
    .map((g) => `<th colspan="${g.span}" class="grp">${escapeHtml(g.group)}</th>`)
    .join("");
  const labels = COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  return `    <thead>
      <tr class="groups">${groups}</tr>
      <tr class="labels">${labels}</tr>
    </thead>`;
}

export function documentTemplate() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Frontend perf bake-off — runs</title>
<!-- Generated by .claude/skills/perf-measure (results format v${RESULTS_FORMAT_VERSION}). Append-only. -->
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .intro { max-width: 70ch; color: #555; }
  .intro li { margin: 2px 0; }
  .intro code { background: #8881; padding: 1px 5px; border-radius: 4px; }
  .star { color: #c026d3; font-weight: 600; }
  .wrap { overflow: auto; border: 1px solid #8883; border-radius: 8px; margin-top: 16px; }
  table { border-collapse: collapse; width: 100%; white-space: nowrap; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #8882; text-align: left; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  thead th { position: sticky; background: Canvas; }
  thead tr.groups th { top: 0; z-index: 2; border-bottom: 1px solid #8884; }
  thead tr.labels th { top: 33px; z-index: 1; font-size: 12px; color: #666; }
  th.grp { text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  tbody tr:nth-child(even) { background: #8881; }
  tbody tr:hover { background: #c026d322; }
</style>
</head>
<body>
<h1>Frontend perf bake-off — runs</h1>
<div class="intro">
<p>Each row is the <strong>median of N runs</strong> (the first run of every batch is dropped as a warm-up). Stat cells show <code>median (min–max)</code>.</p>
<ul>
<li><span class="star">★ Network quiet</span> is the <strong>primary ranking metric</strong> — navigation start until the data layer stops fetching. Rank on the headline (content-based) columns.</li>
<li><strong>Do NOT rank on <code>load</code> or LCP.</strong> For an SPA the <code>load</code> event fires long before the data the user came for has arrived, and <strong>LCP is often blank (—)</strong> because the largest content is a client-rendered table injected after first interaction. Blank LCP is <em>expected, not an error</em>.</li>
<li>Only compare rows with a <strong>similar data-item count, CPU× and network preset</strong> — a 0-row baseline and a 2000-row page are not comparable.</li>
<li>Newest rows are at the <strong>bottom</strong>.</li>
</ul>
</div>
<div class="wrap">
  <table>
${theadHtml()}
    <tbody>
      ${ROW_MARKER}
    </tbody>
  </table>
</div>
</body>
</html>
`;
}

export function ensureDoc(htmlPath) {
  if (existsSync(htmlPath)) return false;
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, documentTemplate(), "utf8");
  return true;
}

export function appendRow(htmlPath, record) {
  const created = ensureDoc(htmlPath);
  const html = readFileSync(htmlPath, "utf8");

  // Refuse to write unless the marker is present exactly once.
  const occurrences = html.split(ROW_MARKER).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Row marker found ${occurrences} time(s) in ${htmlPath} (expected exactly 1). ` +
        `Refusing to write to avoid corrupting history.`,
    );
  }

  const row = renderRow(record);
  const next = html.replace(ROW_MARKER, `${row}\n      ${ROW_MARKER}`);
  writeFileSync(htmlPath, next, "utf8");
  return { created };
}

// ---- CLI --------------------------------------------------------------------
const isMain = pathToFileURL(process.argv[1] || "").href === import.meta.url;
if (isMain) {
  const [, , htmlPath, recordPath] = process.argv;
  if (!htmlPath || !recordPath) {
    console.error("usage: node append-row.mjs <results.html> <record.json|->");
    process.exit(2);
  }
  const raw = recordPath === "-" ? readFileSync(0, "utf8") : readFileSync(recordPath, "utf8");
  const record = JSON.parse(raw);
  const { created } = appendRow(htmlPath, record);
  console.log(`${created ? "created" : "appended to"} ${htmlPath} (1 row added)`);
}
