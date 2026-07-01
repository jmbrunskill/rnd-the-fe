/*
 * Interaction benchmark — filter DOM-update strategies.
 *
 * Injected VERBATIM via chrome-devtools MCP `evaluate_script` on an already-
 * loaded stocktake detail page. It measures the cost of *applying a filter* to
 * the rendered table using three strategies, so we can pick the cheapest with
 * numbers instead of guessing (roadmap step 3, the perf bake-off).
 *
 * Strategies compared (all client-side over the rendered rows):
 *   A. full-rebuild  — rebuild the entire <table> string via innerHTML
 *   B. tbody-rebuild — set <tbody>.innerHTML to only the matching rows
 *   C. row-toggle    — keep all <tr> in the DOM, flip style.display per row
 *
 * Method: for each query we reset to the full table (UNTIMED), flush layout,
 * then time { mutate DOM + force layout via offsetHeight } with performance.now().
 * Forcing layout inside the timed window means the number includes style+layout
 * (reflow), which is what actually dominates a wide table — not just scripting.
 *
 * Run procedure (matches the load protocol so rows are comparable):
 *   1. emulate({ cpuThrottlingRate: 6 })
 *   2. navigate to /stocktake/019f17d0-1444-795c-ac53-da2216c73cff
 *   3. wait for [data-testid="stocktake-table"][data-ready="true"]
 *   4. (optional) set window.__BENCH_CONFIG = { queries: [...], iterations: N }
 *   5. evaluate_script(<this file>)  -> returns JSON stats per strategy
 *   6. repeat step 5 three times; take the median-of-medians per strategy
 *   7. append a row to docs/perf/interaction-runs.md
 */
(() => {
  "use strict";

  const cfg = Object.assign(
    {
      // A spread of result sizes: everything, common hits, a code prefix, none.
      queries: ["", "amox", "vaccine", "70_", "zzz-no-match"],
      iterations: 10,
    },
    window.__BENCH_CONFIG || {},
  );

  const table = document.querySelector('[data-testid="stocktake-table"]');
  if (!table) return { error: "no [data-testid=stocktake-table] on page" };
  const wrap = table.parentElement; // .table-wrap
  const thead = table.querySelector("thead");
  const tbody0 = table.querySelector("tbody");
  if (!wrap || !thead || !tbody0) return { error: "table structure not found" };

  // --- snapshot the full row set once (untimed corpus) ----------------------
  const fullTableHtml = table.outerHTML;
  const theadHtml = thead.outerHTML;
  const openTag = fullTableHtml.slice(0, fullTableHtml.indexOf(">") + 1); // faithful <table ...>
  const rowEls0 = Array.from(tbody0.children);
  const rowHtml = rowEls0.map((tr) => tr.outerHTML);
  const rowText = rowEls0.map((tr) => (tr.textContent || "").toLowerCase());
  const rowCount = rowHtml.length;

  // --- precompute per-query visibility (untimed; not the thing measured) -----
  const norm = (q) => q.trim().toLowerCase();
  const masks = cfg.queries.map((q) => {
    const nq = norm(q);
    return rowText.map((t) => nq === "" || t.indexOf(nq) !== -1);
  });
  const visibleHtml = masks.map((mask) => rowHtml.filter((_, i) => mask[i]).join(""));
  const visibleCounts = masks.map((mask) => mask.reduce((n, v) => n + (v ? 1 : 0), 0));

  // --- stats -----------------------------------------------------------------
  const round2 = (n) => Math.round(n * 100) / 100;
  const stats = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {
      median: round2(at(0.5)),
      p95: round2(at(0.95)),
      min: round2(s[0]),
      max: round2(s[s.length - 1]),
      mean: round2(s.reduce((a, b) => a + b, 0) / s.length),
      samples: s.length,
    };
  };

  // Time one strategy: resetFull(qi) restores the all-rows state (UNTIMED),
  // apply(qi) filters to query qi and IS what we time.
  const timeStrategy = (resetFull, apply) => {
    const durations = [];
    for (let it = 0; it < cfg.iterations; it++) {
      for (let qi = 0; qi < cfg.queries.length; qi++) {
        resetFull(qi);
        void wrap.offsetHeight; // flush the reset's layout, untimed
        const t0 = performance.now();
        apply(qi);
        void wrap.offsetHeight; // force this update's layout into the window
        durations.push(performance.now() - t0);
      }
    }
    return stats(durations);
  };

  const results = {};

  // A. full table rebuild via the wrapper's innerHTML.
  results["full-rebuild"] = timeStrategy(
    () => {
      wrap.innerHTML = fullTableHtml;
    },
    (qi) => {
      wrap.innerHTML = openTag + theadHtml + "<tbody>" + visibleHtml[qi] + "</tbody></table>";
    },
  );

  // B. tbody-only rebuild. Re-grab a stable tbody reference on each reset.
  let tb = null;
  results["tbody-rebuild"] = timeStrategy(
    () => {
      wrap.innerHTML = fullTableHtml;
      tb = wrap.querySelector("tbody");
    },
    (qi) => {
      tb.innerHTML = visibleHtml[qi];
    },
  );

  // C. row-visibility toggle. Render all rows once, keep stable references;
  // reset just shows every row again (no innerHTML churn, so refs stay valid).
  wrap.innerHTML = fullTableHtml;
  const rowEls = Array.from(wrap.querySelector("tbody").children);
  results["row-toggle"] = timeStrategy(
    () => {
      for (let i = 0; i < rowEls.length; i++) rowEls[i].style.display = "";
    },
    (qi) => {
      const mask = masks[qi];
      for (let i = 0; i < rowEls.length; i++) rowEls[i].style.display = mask[i] ? "" : "none";
    },
  );

  // Restore the page to the unfiltered table.
  wrap.innerHTML = fullTableHtml;

  const rank = Object.entries(results).sort((a, b) => a[1].median - b[1].median);
  return {
    rowCount,
    queries: cfg.queries,
    visibleCounts,
    iterations: cfg.iterations,
    results,
    winner: rank[0][0],
    winnerMedianMs: rank[0][1].median,
  };
})();
