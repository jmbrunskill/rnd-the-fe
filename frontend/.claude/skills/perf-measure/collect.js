/*
 * perf-measure — deterministic in-page collector.
 *
 * This file is read VERBATIM by the skill and installed as a Chrome init
 * script (chrome-devtools MCP `navigate_page({initScript})`) so it runs BEFORE
 * any page script on every reload. Running early is the whole point: a SPA
 * injects its real content (and fires its data calls) after first paint, so an
 * observer installed afterwards misses those candidates. We install the
 * observers/ wrappers up front, then read everything back via window.__perfCollect().
 *
 * The skill prepends `window.__PERF_CONFIG = {...}` right before this source.
 * Nothing else about this file changes between runs — that is what makes rows
 * comparable. If you change WHAT is collected, bump COLLECTOR_VERSION so old
 * rows stay interpretable next to new ones.
 */
(() => {
  "use strict";

  const COLLECTOR_VERSION = "1.0.0";

  // Defaults keep the collector runnable on its own; the skill overrides via
  // window.__PERF_CONFIG. readySignal is either a CSS selector or "text:<str>".
  const cfg = Object.assign(
    {
      readySignal: "",
      dataItemCountSelector: "",
      dataRequestUrlPattern: "", // substring; fetch/XHR URLs containing it = "data" calls
      netQuietMs: 500, // window of no in-flight data calls that counts as "quiet"
      collectTimeoutMs: 20000, // hard cap waiting for ready + quiet
    },
    window.__PERF_CONFIG || {},
  );

  if (window.__perfInstalled) return; // idempotent if injected twice
  window.__perfInstalled = true;

  const state = {
    version: COLLECTOR_VERSION,
    config: cfg,
    pageReadyAt: null, // performance.now() when readySignal first seen
    fcp: null,
    lcp: null,
    cls: 0,
    dataReqs: [], // { url, start, end }
    inFlight: 0,
    lastSettleAt: 0, // performance.now() when the most recent data call ended
    readyError: null,
  };
  window.__perf = state;

  // --- paint / LCP / CLS via buffered observers (installed pre-paint) --------
  const observe = (type, cb) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      po.observe({ type, buffered: true });
    } catch {
      /* type unsupported in this browser — leave the metric null */
    }
  };
  observe("paint", (e) => {
    if (e.name === "first-contentful-paint") state.fcp = e.startTime;
  });
  observe("largest-contentful-paint", (e) => {
    state.lcp = e.startTime; // last entry wins; may stay null for SPAs (expected)
  });
  observe("layout-shift", (e) => {
    if (!e.hadRecentInput) state.cls += e.value;
  });

  // --- data-call timing: wrap fetch + XHR ------------------------------------
  const isDataUrl = (url) =>
    !!cfg.dataRequestUrlPattern &&
    String(url).indexOf(cfg.dataRequestUrlPattern) !== -1;

  const startReq = (url) => {
    const rec = { url: String(url), start: performance.now(), end: null };
    state.dataReqs.push(rec);
    state.inFlight += 1;
    return rec;
  };
  const endReq = (rec) => {
    if (!rec || rec.end != null) return;
    rec.end = performance.now();
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.lastSettleAt = rec.end;
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      const url = input && input.url ? input.url : input;
      if (!isDataUrl(url)) return nativeFetch.apply(this, arguments);
      const rec = startReq(url);
      return nativeFetch.apply(this, arguments).then(
        (res) => {
          endReq(rec);
          return res;
        },
        (err) => {
          endReq(rec);
          throw err;
        },
      );
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__perfUrl = url;
      return open.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      if (isDataUrl(this.__perfUrl)) {
        const rec = startReq(this.__perfUrl);
        this.addEventListener("loadend", () => endReq(rec));
      }
      return send.apply(this, arguments);
    };
  }

  // --- ready signal: stamp the moment the real content lands -----------------
  const readyFound = () => {
    if (!cfg.readySignal) return false;
    if (cfg.readySignal.indexOf("text:") === 0) {
      const needle = cfg.readySignal.slice(5);
      return !!needle && !!document.body && document.body.innerText.indexOf(needle) !== -1;
    }
    try {
      return !!document.querySelector(cfg.readySignal);
    } catch (e) {
      state.readyError = String(e);
      return false;
    }
  };
  const stampReady = () => {
    if (state.pageReadyAt != null) return true;
    if (readyFound()) {
      state.pageReadyAt = performance.now();
      try {
        performance.mark("perf:page-ready");
      } catch {
        /* mark unsupported — pageReadyAt is the source of truth anyway */
      }
      return true;
    }
    return false;
  };
  if (!stampReady()) {
    const mo = new MutationObserver(() => {
      if (stampReady()) mo.disconnect();
    });
    // Observe `document` itself, NOT document.documentElement: this collector
    // runs as an init script at document-start, where <html> isn't parsed yet
    // and document.documentElement is null (observing null throws). The Document
    // node is always present, and subtree:true still catches every later change.
    mo.observe(document, { childList: true, subtree: true });
  }

  // --- collector: called via evaluate_script once the page should be settled -
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (n) => (n == null || !isFinite(n) ? null : Math.round(n));
  const round1 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 10) / 10);
  const round3 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 1000) / 1000);

  const countItems = () => {
    if (!cfg.dataItemCountSelector) return 0;
    try {
      return document.querySelectorAll(cfg.dataItemCountSelector).length;
    } catch {
      return 0;
    }
  };

  window.__perfCollect = async () => {
    const deadline = performance.now() + cfg.collectTimeoutMs;
    // Wait for content (ready signal) AND for the data layer to fall quiet.
    while (performance.now() < deadline) {
      const ready = state.pageReadyAt != null;
      const quiet =
        state.inFlight === 0 &&
        (state.dataReqs.length === 0 ||
          performance.now() - state.lastSettleAt >= cfg.netQuietMs);
      if (ready && quiet) break;
      await sleep(50);
    }

    const nav = performance.getEntriesByType("navigation")[0] || {};
    const resources = performance.getEntriesByType("resource");

    let decoded = nav.decodedBodySize || 0;
    resources.forEach((r) => {
      decoded += r.decodedBodySize || 0;
    });

    const durations = state.dataReqs
      .filter((r) => r.end != null)
      .map((r) => r.end - r.start);
    const lastDataEnd = state.dataReqs.reduce(
      (m, r) => (r.end != null && r.end > m ? r.end : m),
      0,
    );

    // Network quiet = when the LAST data call finished. With zero data calls
    // (a static baseline page) the content render is the limiting factor.
    const timeToNetworkQuietMs =
      state.dataReqs.length > 0 ? lastDataEnd : state.pageReadyAt;

    const memory = performance.memory || {};

    return {
      collectorVersion: COLLECTOR_VERSION,
      ready: state.pageReadyAt != null,
      readySignal: cfg.readySignal,
      readyError: state.readyError,
      timedOut: performance.now() >= deadline,

      // headline (content-based) — rank on these, NOT load/LCP
      timeToDataRenderedMs: round(state.pageReadyAt),
      timeToNetworkQuietMs: round(timeToNetworkQuietMs),

      // network waterfall
      dataRequestCount: state.dataReqs.length,
      slowestDataRequestMs: durations.length ? round(Math.max.apply(null, durations)) : 0,

      // weight / counts
      dataItemCount: countItems(),
      domNodes: document.getElementsByTagName("*").length,
      requestCount: resources.length + 1, // + the document itself
      transferDecodedKB: round1(decoded / 1024),

      // reference (record but do NOT rank on these for an SPA)
      ttfbMs: round(nav.responseStart),
      fcpMs: round(state.fcp),
      domContentLoadedMs: round(nav.domContentLoadedEventEnd),
      loadMs: round(nav.loadEventEnd),
      cls: round3(state.cls),
      lcpMs: state.lcp == null ? null : round(state.lcp),

      // memory
      jsHeapMB: memory.usedJSHeapSize ? round1(memory.usedJSHeapSize / 1048576) : null,
    };
  };
})();
