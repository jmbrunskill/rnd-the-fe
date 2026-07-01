# perf-measure

A Claude Code skill that measures a page's **frontend load performance under
throttling** and appends one row to a shared HTML results doc
(`docs/perf/frontend-runs.html`). It exists for a **team bake-off**: several
people build their own version of a similar page and we need numbers that line
up. The columns, the in-page collector, and the doc format are fixed so every
row is comparable.

It measures what actually matters for a SPA — **when the real content is on
screen** and **when the data layer goes quiet** — not the browser `load` event
or LCP, which are misleading for client-rendered pages (see *Why these
metrics*).

## What you need (one time)

1. **Chrome DevTools MCP** connected in Claude Code (the skill drives Chrome
   through it). If `/mcp` doesn't list `chrome-devtools`, add it first.
2. **Node** (for the two `.mjs` helper scripts) — already required by the app.
3. Copy the config templates if they're missing and edit for your setup:
   ```bash
   cp .claude/skills/perf-measure/scenarios.example.json   .claude/skills/perf-measure/scenarios.json
   cp .claude/skills/perf-measure/perf.local.example.json  .claude/skills/perf-measure/perf.local.json
   ```
   - `scenarios.json` is **committed** (shared config, no secrets).
   - `perf.local.json` is **gitignored** (host-specific secrets). This demo needs
     no auth, so it's just `{}`. Verify it's ignored:
     ```bash
     git check-ignore .claude/skills/perf-measure/perf.local.json   # prints the path = good
     ```

## How to run

Just ask Claude Code, e.g.:

> measure page performance
> run a perf test on stocktake-detail-baseline
> benchmark this screen at 4× CPU, 8 runs
> perf measure --net "Slow 4G" --cold --notes "after virtualization"

Arguments (all optional):

```
[scenario-name] [--runs N] [--cpu X] [--net "Slow 4G"] [--cold] [--notes "..."]
```

Defaults live in `scenarios.json → defaults` (5 runs, drop the first, 6× CPU,
no network throttle, warm cache).

What happens: the app is built (`npm run build`) and served as a **production
build** (`vite preview`), Chrome is throttled, the page is loaded **N times**
(first run dropped as warm-up), each load is measured by `collect.js`, the
median (min–max) is appended to `docs/perf/frontend-runs.html`, and Claude
reports the headline numbers + compares against your last run.

Open `docs/perf/frontend-runs.html` in a browser to read the table (newest rows
at the bottom; sticky header).

## The metrics (fixed for everyone)

| Group | Columns |
| --- | --- |
| Run context | UTC time · scenario · branch · commit · CPU · cores · OS · Chrome · CPU× · net · cache · **data items** · runs (N) · collector ver · notes |
| **Headline** (rank on these) | `timeToDataRenderedMs` (nav → ready signal) · `timeToNetworkQuietMs` ★ (nav → data layer idle — **primary ranking**) |
| Network | data-request count · slowest single data request (ms) |
| Reference (record, don't rank) | TTFB · FCP · `load` · CLS · LCP *(often blank — expected)* |
| Memory | JS heap (MB) · heap-snapshot (MB) |
| Weight | DOM nodes · request count · decoded transfer (KB) |

Headline + slowest-request cells are shown as **median (min–max)** across the
kept runs.

### Why these metrics (and why NOT load/LCP)

On a real SPA the `load` event fired at ~441 ms while the data the user came for
didn't finish arriving until ~4.2 s — `load` missed 16 data calls that happen
*after* it. LCP was null/early because the largest element is a table rendered
client-side after first interaction. So we rank on **content-based** timings
instead. A blank LCP in the doc is normal.

## Add a scenario

Edit `scenarios.json → scenarios` and add:

```json
{
  "name": "my-page",
  "path": "/some/route",
  "readySignal": "[data-testid=\"my-table\"][data-ready=\"true\"]",
  "dataItemCountSelector": "[data-testid=\"my-table\"] tbody tr",
  "dataRequestUrlPattern": "/graphql"
}
```

- `readySignal` — the moment the **real content** the user wants is on screen.
  A CSS selector, or `"text:Some visible string"`. The single most important
  field: make it the content, not the `load` event. The cleanest approach is a
  stable hook your view sets when it's truly ready, e.g.
  `<table data-testid="my-table" data-ready="true">`.
- `dataItemCountSelector` — elements counted as "data items" (e.g. table rows).
  Recorded on the row so a 50-row and a 2000-row page aren't compared blindly.
- `dataRequestUrlPattern` — a substring of your data-call URLs (`/graphql`,
  `/api/`). The collector wraps `fetch`/XHR and times calls whose URL contains
  it; "network quiet" is when the last one finishes. (No data layer yet? Leave
  your intended pattern — it simply matches 0 requests, and the row records 0.)

## Add a metric

1. Return the new value from `collect.js → window.__perfCollect()` and **bump
   `COLLECTOR_VERSION`**.
2. Add a column to the `COLUMNS` array in `append-row.mjs` (that array is the
   single source of truth for order, label, group, and formatting). If the
   change breaks comparability with existing docs, bump `RESULTS_FORMAT_VERSION`
   and start a fresh doc (the header is written only when the doc is created).
3. Add the metric's per-run values under `samples` in the record the skill
   appends.

## Files

```
.claude/skills/perf-measure/
  SKILL.md                  the procedure Claude follows
  collect.js                deterministic in-page collector (read verbatim)
  append-row.mjs            owns the results HTML + append-only marker
  heap-size.mjs             .heapsnapshot -> live MB
  scenarios.json            committed config + scenarios
  scenarios.example.json    template
  perf.local.example.json   secrets template
  perf.local.json           your secrets (gitignored; {} here)
docs/perf/
  frontend-runs.html        the shared results doc (created on first run)
  snapshots/                heap snapshots (gitignored)
```

## Troubleshooting

- **"Target crashed" during a run** — expected occasionally under heavy CPU
  throttle. The skill discards that sample and retries the run; it isn't
  recorded.
- **`timeToDataRenderedMs` is "—" / `ready: false`** — the `readySignal` never
  matched. Check the selector/text against the live page.
- **LCP is blank** — expected for SPAs; not an error.
- **Appender refuses to write** — the row marker in the HTML is missing or
  duplicated (someone hand-edited the doc). Restore the single
  `<!-- perf-measure:rows (do not remove) -->` marker at the end of `<tbody>`.
