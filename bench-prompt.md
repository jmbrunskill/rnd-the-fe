# Prompt: generate a frontend performance-measurement skill for *this* project

**How to use:** open Claude Code in your project and paste everything in the
"PROMPT" block below as your message. Claude will interview you about your app,
then generate a `/perf-measure` skill tailored to your project plus a shared
results document. You don't need to know anything about Core Web Vitals — the
prompt tells Claude what to build and why.

The point: every teammate builds their own page however they like, but everyone
ends up with the **same measurement protocol** and the **same results-document
format**, so the numbers are comparable across implementations.

---

## PROMPT — paste from here ↓

I want you to create a Claude Code **skill** in this project called `perf-measure`
that measures the frontend performance of one of my pages under throttling and
appends a row to a shared HTML results document. This is part of a team-wide
bake-off: several people are each building their own version of a similar page,
and we all need comparable numbers. Build it for *this* project specifically.

### Step 1 — Interview me first (don't assume)

Ask me, concisely, and wait for answers:

1. **How do I run this app for measurement?** (e.g. `npm run dev` on a port, a
   deployed URL, a static build). Get the exact command and/or base URL.
2. **Does it need login or any setup to reach the page?** If yes, how — and where
   should credentials live? (Use a gitignored local file, never hardcode secrets.)
3. **Which page(s) should be measurable?** Get a friendly name + path for each.
4. **What is the "page is actually ready" signal for each page?** This is the most
   important question. NOT the browser `load` event — the moment the *real content*
   the user came for is on screen (e.g. "the data table has rows", "a specific text
   appears", "the spinner is gone"). Ask for a text string or DOM selector I can
   detect. If my app fetches data after first paint, also ask how I'd know the data
   layer is idle (e.g. requests to a known API path have stopped).
5. **What framework / data layer?** (React/Vue/Svelte/vanilla; REST/GraphQL/RSC).
   You'll use this to detect the "data settled" moment.
6. **Any project-specific extra metrics** I care about beyond the fixed set below.

### Step 2 — Bake in these hard-won rules (these are NOT optional)

These come from measuring a real SPA; do not let me or yourself skip them:

- **Do NOT use the browser `load` event or LCP as the headline metric for an SPA.**
  We confirmed on a real app that `load` fired at ~441ms while the actual data
  finished arriving at ~4.2s — the `load` event missed 16 data calls that happen
  *after* it. LCP was also null/early-frozen because the largest content is a
  client-rendered table injected after first interaction. **Record load/LCP for
  reference, but the headline must be content-based timings (below).**
- **A single run is noise.** Cold vs warm cache, GC, background activity, and a
  renderer that can briefly crash under heavy CPU throttle all swing results
  20–40%. **Run each measurement N times (default 5), drop the first (warm-up),
  and report the median and the min–max spread.**
- **Comparability across machines/people requires context on every row.** Stamp:
  machine info (CPU model if available, core count, OS, Chrome/UA), the throttle
  settings, cold-vs-warm, the **count of data items rendered** (a 50-row vs
  2000-row page are not comparable), git branch + commit, and a UTC timestamp.
- **Determinism:** put the in-page measurement JS in its own file the skill reads
  verbatim each run (don't hand-write it per run) so every row is produced by
  identical code. Version it; bump the version if you change what's collected.
- **Append-only results:** the results doc is written by a small Node script that
  inserts one `<tr>` before a marker comment and refuses to write if the marker is
  missing — so history can't be silently corrupted.

### Step 3 — Fixed metric set (mandatory columns, identical for everyone)

Every row in the results doc MUST include these, so my teammates' docs line up:

- **Run context:** UTC timestamp · scenario name · git branch · git commit (short)
  · machine (cores, OS, Chrome version) · CPU throttle × · network preset ·
  cold/warm · **data-item count** · runs (N) · notes.
- **Headline (content-based):**
  - `timeToDataRenderedMs` — navigation start → my "page ready" signal appears.
  - `timeToNetworkQuietMs` — navigation start → data layer idle (no in-flight data
    requests for ~500ms). This is the primary ranking metric.
- **Network waterfall:** number of data requests (e.g. GraphQL/REST calls during
  load) and the slowest single one (ms) — this usually explains the headline.
- **Reference (record but don't rank on):** TTFB, FCP, `load` event, CLS, LCP
  (note it may be null — that's expected, not an error).
- **Memory:** JS heap used (MB) via `performance.memory`, plus a precise
  `.heapsnapshot` size if you capture one (store the snapshot file out of git).
- **Weight:** DOM node count, request count, total decoded transfer (KB).

All headline/network timings are reported as **median of N (min–max)**.

I may add project-specific extra columns on top of these — keep the fixed ones.

### Step 4 — How the skill should work (the procedure)

Drive Chrome via the **chrome-devtools MCP** (`new_page`, `navigate_page`,
`emulate`, `performance_start_trace`/`stop`, `take_heapsnapshot`,
`evaluate_script`, `wait_for`). For each measurement:

1. Read project config (base URL / run command, login, scenarios) from committed
   config + a gitignored local creds file.
2. Start/confirm the app is running; open it; do login/setup if needed.
3. Navigate to the scenario page. **Install instrumentation via an init script
   that runs before any page script** — a `PerformanceObserver` for paint/LCP, a
   wrapper around `fetch`/`XHR` to time data calls, and a `MutationObserver` (or
   `performance.mark`) that stamps the "page ready" signal. (Buffered perf APIs
   miss SPA candidates after a route change — the pre-installed observer is why we
   can capture them at all.)
4. Apply CPU throttle (default 6×) and optional network preset via `emulate`.
5. Run the load **N times** (default 5, reloading between), collecting the
   deterministic metrics file each time. After heavy-throttle reloads the renderer
   may briefly report "Target crashed" — detect, wait for recovery, and retry that
   run rather than recording a bad sample.
6. Compute median + spread; gather machine/git context.
7. Append one row to the results HTML via the Node appender.
8. Report the headline numbers and compare against the previous row for the same
   scenario (regression/improvement).

### Step 5 — Files to generate

Create these (adjust paths to project conventions):

- `.claude/skills/perf-measure/SKILL.md` — frontmatter (`name`, a `description`
  with explicit trigger phrases like "measure page performance", "run a perf
  test", "benchmark this screen", and an `argument-hint`) + the numbered
  procedure above + a "gotchas" section repeating the load/LCP and noise warnings.
- `.claude/skills/perf-measure/collect.js` — the deterministic in-page collector
  (versioned), returning the fixed metric set as JSON.
- `.claude/skills/perf-measure/append-row.mjs` — owns the HTML format; a `COLUMNS`
  array is the single source of truth for columns; inserts before a row marker;
  refuses to write if the marker is missing.
- `.claude/skills/perf-measure/heap-size.mjs` — turns a `.heapsnapshot` into a
  live-MB number (only if you capture snapshots).
- `scenarios.example.json` + `scenarios.json` — named pages with `{name, path,
  readySignal, dataItemCountSelector, dataRequestUrlPattern}`.
- A gitignored local creds template (e.g. copy `perf.local.example.json` →
  a `*.local.json` path your `.gitignore` already ignores; verify it's ignored
  with `git check-ignore` before relying on it).
- `README.md` in the skill folder — one-time setup + how to run + how to add a
  scenario + how to add a metric, written for a teammate who's never seen it.
- The results doc itself is created on first run at `docs/perf/frontend-runs.html`
  (or your repo's docs path). Self-contained HTML: explanatory header (including
  "LCP is often blank for SPAs — expected"), a sticky-header table, newest rows at
  the bottom, columns in the fixed order above.

### Step 6 — Verify before declaring done

- Run the Node scripts directly with sample JSON to prove the HTML is created and
  a second append doesn't corrupt the first row (check the marker count stays 1).
- Do one real measured run end-to-end and show me the resulting row.
- Confirm the creds file is gitignored and no secret is written to the results doc.
- Don't commit anything unless I ask; show me `git status` and let me decide.

Start with Step 1 — interview me now.

## PROMPT — paste to here ↑

---

### Notes for whoever shares this prompt

- This generates a **Claude Code skill** and assumes the teammate has the
  chrome-devtools MCP available. If someone isn't on Claude Code, ask Claude (in
  their project) to instead emit a standalone Playwright `npm run perf` script that
  follows the exact same protocol and writes the same results-HTML format — the
  fixed metric set and the rules in Step 2/3 are what make docs comparable, not the
  runner.
- The **fixed columns in Step 3 are the contract.** Tell teammates not to drop
  them; extra columns are fine. Two rows are only comparable when machine, throttle,
  cold/warm, and data-item count match — which is why those are mandatory context.
- The headline ranking metric is **time-to-network-quiet** (when the data layer
  goes idle), because that's the real "page is done" moment for a data-fetching
  SPA — the browser `load` event is misleading here.
```
