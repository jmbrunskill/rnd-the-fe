/*
 * Interaction benchmark — sort DOM-update strategies.
 *
 * Sibling of filter-strategies.js. Injected VERBATIM via chrome-devtools
 * `evaluate_script` on a loaded stocktake detail page. Sorting REORDERS rows
 * (unlike the filter, which just toggles visibility), so it needs its own
 * measurement. Compares:
 *   A. reorder-nodes  — move the existing <tr> nodes into sorted order via one
 *                       DocumentFragment.appendChild (no re-parse; node identity
 *                       and the filter's inline display survive)
 *   B. tbody-rebuild  — tbody.innerHTML = sorted rows' HTML (re-parses)
 *
 * Method mirrors filter-strategies.js: each timed unit = { reset to natural
 * order (UNTIMED) → mutate → force layout via offsetHeight }, median-of-medians
 * over 3 runs under 6× CPU. Sort order is derived from the rendered cell text
 * (the bench measures DOM cost, not the app's comparator).
 *
 * Run: emulate 6× CPU → navigate to the detail page → wait for the table →
 * evaluate_script(<this file>) ×3 → append the winner to interaction-runs.md.
 */
(() => {
  "use strict";

  const cfg = Object.assign(
    {
      sorts: [
        { header: "Name", dir: "asc" },
        { header: "Snapshot # Packs", dir: "desc", numeric: true },
        { header: "Expiry Date", dir: "asc", date: true },
        { header: null, dir: "asc" }, // reset to natural/server order
      ],
      iterations: 10,
    },
    window.__BENCH_CONFIG || {},
  );

  const table = document.querySelector('[data-testid="stocktake-table"]');
  if (!table) return { error: "no [data-testid=stocktake-table] on page" };
  const tbody = table.querySelector("tbody");
  const thead = table.querySelector("thead");
  if (!tbody || !thead) return { error: "table structure not found" };

  const headers = Array.from(thead.querySelectorAll("th")).map((th) => (th.textContent || "").trim());
  const colIndex = (h) => headers.indexOf(h);

  const rowEls0 = Array.from(tbody.children); // stable node refs (strategy A)
  const rowHtml = rowEls0.map((tr) => tr.outerHTML);
  const naturalHtml = rowHtml.join("");
  const n = rowEls0.length;

  const cellText = (tr, ci) => (ci >= 0 && tr.children[ci] ? tr.children[ci].textContent || "" : "");
  const toNum = (s) => {
    const f = parseFloat(String(s).replace(/,/g, ""));
    return isNaN(f) ? -Infinity : f;
  };

  // Precompute a sorted index order per sort (UNTIMED — not what we measure).
  const orders = cfg.sorts.map((s) => {
    const idx = rowEls0.map((_, i) => i);
    if (s.header == null) return idx; // natural order
    const ci = colIndex(s.header);
    const mul = s.dir === "asc" ? 1 : -1;
    const valOf = (i) => {
      const t = cellText(rowEls0[i], ci);
      if (s.numeric) return toNum(t);
      if (s.date) {
        const d = Date.parse(t);
        return isNaN(d) ? -Infinity : d;
      }
      return t.toLowerCase();
    };
    idx.sort((a, b) => {
      const va = valOf(a);
      const vb = valOf(b);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return c !== 0 ? mul * c : a - b;
    });
    return idx;
  });
  const orderedHtml = orders.map((order) => order.map((i) => rowHtml[i]).join(""));

  const round2 = (x) => Math.round(x * 100) / 100;
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

  const appendOrder = (order) => {
    const frag = document.createDocumentFragment();
    for (let k = 0; k < n; k++) frag.appendChild(rowEls0[order[k]]);
    tbody.appendChild(frag); // appendChild MOVES existing nodes
  };
  const naturalOrder = rowEls0.map((_, i) => i);

  const results = {};

  // A. reorder existing nodes. Reset (untimed) puts nodes back in natural order.
  {
    const durations = [];
    for (let it = 0; it < cfg.iterations; it++) {
      for (let si = 0; si < orders.length; si++) {
        appendOrder(naturalOrder);
        void tbody.offsetHeight;
        const order = orders[si];
        const t0 = performance.now();
        appendOrder(order);
        void tbody.offsetHeight;
        durations.push(performance.now() - t0);
      }
    }
    results["reorder-nodes"] = stats(durations);
  }

  // Restore original nodes in natural order before switching to B.
  appendOrder(naturalOrder);

  // B. rebuild tbody.innerHTML from sorted HTML.
  {
    const durations = [];
    for (let it = 0; it < cfg.iterations; it++) {
      for (let si = 0; si < orderedHtml.length; si++) {
        tbody.innerHTML = naturalHtml; // reset (untimed)
        void tbody.offsetHeight;
        const html = orderedHtml[si];
        const t0 = performance.now();
        tbody.innerHTML = html;
        void tbody.offsetHeight;
        durations.push(performance.now() - t0);
      }
    }
    results["tbody-rebuild"] = stats(durations);
  }

  tbody.innerHTML = naturalHtml; // leave the page in natural order

  const rank = Object.entries(results).sort((a, b) => a[1].median - b[1].median);
  return {
    rowCount: n,
    sorts: cfg.sorts.map((s) => (s.header == null ? "none" : `${s.header}-${s.dir}`)),
    iterations: cfg.iterations,
    results,
    winner: rank[0][0],
    winnerMedianMs: rank[0][1].median,
  };
})();
