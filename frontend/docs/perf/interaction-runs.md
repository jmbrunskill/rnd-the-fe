# Interaction performance — runs

Companion to the load-perf doc (`frontend-runs.html`). This one measures the cost of an
**interaction** (applying a filter), not page load. Method: `docs/perf/bench/filter-strategies.js`
injected via chrome-devtools `evaluate_script` on the loaded detail page under CPU throttle; each
timed unit = { reset to full table (untimed) → mutate DOM → force layout via `offsetHeight` }, so the
number includes style + layout, not just scripting. Report median-of-medians across 3 runs.

Headline = **median** update ms, but watch **p95** (worst-case keystroke jank) — for a filter, a
tight distribution matters more than a good average.

## stocktake detail — filter strategies

Context: Apple M3 Pro (11 cores), macOS 26.5.1, Chrome 149, 6× CPU throttle, dev server, 1506 rows ×
14 cols. Query set `["", "amox", "vaccine", "70_", "zzz-no-match"]` (visible: 1506/12/12/205/0),
iterations 10 (50 samples/strategy/run), 3 runs. Commit f184892 (+ uncommitted).

| UTC | Strategy | median (ms) | mean (ms) | p95 (ms) | max (ms) | notes |
|-----|----------|-------------|-----------|----------|----------|-------|
| 2026-07-01T01:26Z | full-rebuild  | 91 (54–91) | ~146 | ~450 | ~607 | rebuild whole `<table>` innerHTML; cost scales with matched rows — spikes on broad matches |
| 2026-07-01T01:26Z | tbody-rebuild | 86 (44–87) | ~135 | ~400 | ~441 | rebuild `<tbody>` only; ~15% better than full, still spikes on broad matches |
| 2026-07-01T01:26Z | **row-toggle** ✅ | **57 (57–61)** | **~54** | **~104** | ~123 | keep all `<tr>`, flip `style.display`; flat O(rows) — ~1.5× better median, ~4× better worst-case, very stable |

**Winner: row-toggle.** The rebuild strategies win occasionally (small result sets) but spike to
400–500 ms whenever a query matches many rows; row-toggle is flat (~57 ms median, ~104 ms p95)
regardless of match count. Trade-off: all 1506 `<tr>` stay resident in the DOM. Decision: ship the
filter with the row-visibility-toggle strategy.
