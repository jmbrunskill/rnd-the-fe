---
name: perf-measure
description: >-
  Measure this app's frontend page performance under CPU/network throttling and
  append one comparable row to the team bake-off results doc
  (docs/perf/frontend-runs.html). Use when the user says "measure page
  performance", "run a perf test", "benchmark this screen", "perf measure",
  "how fast does the stocktake page load", "measure the <page> under
  throttling", or otherwise wants throttled SPA load timings. Drives Chrome via
  the chrome-devtools MCP, runs N reloads, and reports MEDIAN content-based
  timings (time-to-data-rendered, time-to-network-quiet) — never the misleading
  load/LCP events as the headline.
argument-hint: '[scenario-name] [--runs N] [--cpu 6] [--net "Slow 4G"] [--cold] [--notes "..."]'
---

# perf-measure

Measure a page's load performance under throttling and append a row to the
shared results doc. This is a **team bake-off**: every row must be comparable
across people and machines, so the metric set, the collector, and the doc
format are fixed. Do not improvise columns or timings.

All paths below are relative to this skill folder unless noted:
`.claude/skills/perf-measure/`.

## Files

- `scenarios.json` — committed config: app build/serve commands, base URL,
  defaults, and the list of measurable scenarios. (`scenarios.example.json` is
  the template.)
- `perf.local.json` — gitignored local secrets (headers/cookies/login). May be
  absent or `{}` when the app needs no auth. (`perf.local.example.json` shows
  the shape.) **Never** write its contents to the results doc.
- `collect.js` — the deterministic in-page collector. Read it **verbatim**;
  never hand-edit metrics per run. Bump its `COLLECTOR_VERSION` if you change
  what it collects.
- `append-row.mjs` — owns the results HTML (the `COLUMNS` array is the single
  source of truth) and the append-only marker logic.
- `heap-size.mjs` — turns a `.heapsnapshot` into a live-MB number.

## Procedure

### 0. Resolve arguments + config
- Read `scenarios.json`. Pick the scenario by the name argument; default to the
  first scenario if none given.
- Merge `defaults` with any flags: `--runs N` (default 5), `--cpu X` (default
  6), `--net "<preset>"` (default `none`; one of `Slow 3G|Fast 3G|Slow 4G|Fast
  4G|Offline`), `--cold` (sets cache=cold, reloads ignore cache; default warm),
  `--notes "..."`.
- If `perf.local.json` exists, read it for `extraHttpHeaders` / `cookies` /
  `login`. Treat it as secret.

### 1. Start / confirm the app
- Probe `app.readyProbeUrl`. If it doesn't respond, run `app.buildCommand`, then
  start `app.serveCommand` **in the background**, and poll `readyProbeUrl` until
  it responds (build a production bundle — we measure the prod build, not the
  dev server, to avoid HMR overhead).
- Note whether you started the server (so you can stop it afterwards).

### 2. Open the page + apply auth
- `new_page` at `app.baseUrl`.
- If `perf.local.json` has `extraHttpHeaders`, call `emulate({extraHttpHeaders})`.
- If it defines `cookies` or a `login` flow, set the cookies / drive the login
  form (`fill`/`click`) and wait for `login.successSignal` before continuing.

### 3. Apply throttling
- `emulate({ cpuThrottlingRate: <cpu> })` (omit/1 = off).
- If network preset is not `none`: `emulate({ networkConditions: "<preset>" })`.
- Keep CPU + network throttle constant for every run in the batch.

### 4. Build the init script (runs BEFORE page scripts)
The collector must be installed before any page script so it can catch SPA
data-calls and content that arrive after first paint. Construct:

```
initScript = 'window.__PERF_CONFIG = ' + JSON.stringify({
  readySignal:           scenario.readySignal,
  dataItemCountSelector: scenario.dataItemCountSelector,
  dataRequestUrlPattern: scenario.dataRequestUrlPattern,
  netQuietMs:            defaults.netQuietMs,        // 500
  collectTimeoutMs:      defaults.collectTimeoutMs,  // 20000
}) + ';\n' + <verbatim contents of collect.js>
```

### 5. Run the load N times (reload between; drop the first)
For `i` in `1..N`:
1. `navigate_page({ type: "url", url: baseUrl + scenario.path, initScript,
   ignoreCache: (cache === "cold") })`. A full URL navigation gives a fresh
   document each time, so `initScript` runs before the page boots.
2. `evaluate_script(() => window.__perfCollect())`. The collector itself waits
   for the ready signal **and** for the data layer to go quiet (no in-flight
   data calls for `netQuietMs`), up to `collectTimeoutMs`, then returns the
   fixed metric set as JSON. (Optional: for a `text:`-style ready signal you may
   also `wait_for([...])` first, but `__perfCollect` already blocks on it.)
3. **Crash / bad-sample handling.** Under heavy CPU throttle the renderer can
   briefly report "Target crashed", or a run can time out. If `navigate_page`
   or `evaluate_script` throws, or the result has `ready === false` or
   `timedOut === true` → discard that sample, wait ~1s (re-`new_page` if the tab
   died), and **retry the same run index** (up to 3 attempts). Never record a
   crashed/timed-out sample.
4. Keep the good result.

After the loop: if `dropFirst` and N > 1, drop sample #1 (warm-up). The kept
samples form the row.

### 6. Capture one heap snapshot (memory)
- `take_heapsnapshot({ filePath: "<snapshotDir>/<scenario>-<utc>.heapsnapshot" })`
  (the snapshot dir is gitignored — keep it out of git).
- Run `node .claude/skills/perf-measure/heap-size.mjs <that file>` → `heapSnapshotMB`.

### 7. Gather run context
- `git rev-parse --abbrev-ref HEAD` (branch), `git rev-parse --short HEAD` (commit).
- Machine: CPU model (`sysctl -n machdep.cpu.brand_string` on macOS / `/proc/cpuinfo`
  on Linux), logical cores (`sysctl -n hw.logicalcpu` / `nproc`), OS
  (`sw_vers` / `uname -sr`).
- Chrome version: from `navigator.userAgent` (`evaluate_script`), parse the
  `Chrome/<ver>`.
- `dataItems`: the collector's `dataItemCount` (use the value from the kept
  runs; it should be constant — if it varies, note it).
- UTC timestamp (ISO).

### 8. Aggregate + append
- Build the record:
  ```
  {
    "context": { utc, scenario, branch, commit, cpu, cores, os, chrome,
                 cpuThrottle: "<n>×", network, cache, dataItems,
                 runs: "<kept> of <N>", collectorVersion, heapSnapshotMB, notes },
    "samples": { <metricKey>: [<one value per KEPT run>], ... }
  }
  ```
  `samples` must contain arrays for: `timeToDataRenderedMs`,
  `timeToNetworkQuietMs`, `dataRequestCount`, `slowestDataRequestMs`, `ttfbMs`,
  `fcpMs`, `loadMs`, `cls`, `lcpMs` (nulls OK), `jsHeapMB`, `domNodes`,
  `requestCount`, `transferDecodedKB`.
- Write it to a temp JSON file, then:
  `node .claude/skills/perf-measure/append-row.mjs <defaults.resultsDoc> <temp.json>`.
  The appender computes the median (min–max), creates the doc on first run, and
  refuses to write if the row marker isn't present exactly once.

### 9. Report + compare
- Print the headline: median `timeToNetworkQuietMs` (the ranking metric) and
  `timeToDataRenderedMs`, with the min–max spread, plus data-item count and the
  slowest data request.
- Find the previous row for the **same scenario** in the doc and state whether
  this run is a regression or improvement on `timeToNetworkQuietMs`.
- Stop the dev server if you started it. Do **not** commit anything.

## Gotchas (do not skip — these are hard-won)

- **Never rank on the `load` event or LCP for an SPA.** On a real app `load`
  fired at ~441 ms while the data the user actually came for finished at ~4.2 s
  — `load` missed 16 post-load data calls. LCP was null/early-frozen because the
  largest content is a client-rendered table injected after first interaction.
  Record load/LCP for reference only; **the headline is the content-based
  timings** (`timeToDataRenderedMs`, `timeToNetworkQuietMs`). A blank (—) LCP is
  **expected, not a bug**.
- **One run is noise.** Cold-vs-warm cache, GC, background activity, and renderer
  hiccups under throttle swing results 20–40%. Always run N (default 5), drop
  the first as warm-up, and report the **median + min–max**.
- **Comparability needs context on every row.** A 0-row baseline and a 2000-row
  page are not comparable; neither are different CPU× or network presets. The
  fixed columns stamp all of this — keep them.
- **Determinism.** The in-page logic lives in `collect.js` and is read verbatim
  every run; the only per-run input is the injected `window.__PERF_CONFIG`. If
  you change what's collected, bump `COLLECTOR_VERSION` (and, if columns change,
  `RESULTS_FORMAT_VERSION` in `append-row.mjs`).
- **Append-only.** Only `append-row.mjs` writes the doc. It inserts before a
  marker comment and refuses to write if the marker is missing or duplicated —
  don't hand-edit rows.
- **Secrets.** Auth lives only in `perf.local.json` (gitignored). Never echo it
  into the results doc, logs, or a commit.
