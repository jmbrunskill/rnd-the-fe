# How we got here — the prompt journey

A record of the actual prompts (and answers to my clarifying questions) that took
us from "can you run a perf test?" to a portable meta-prompt teammates can use to
generate their own performance-measurement skill.
---

## 1. The opening question

> Are you able to run performance test on a front end in chrome? With
> throttling, to get like LCP, memory usage maybe cpu time?

I laid out the two tool paths (chrome-devtools MCP vs the `bdg` CLI) and asked
what to target, which metrics, and what throttling. Answers given:

- **Target:** "For now i want to question what you can do with different tools"
- **Metrics:** Core Web Vitals, CPU time / main thread, Memory (heap), Lighthouse audit
- **Throttling:** "6x"

## 2. Point it at a real page

> I want you to do it on this page, but first you will need to login as Admin,
> pass.
> https://localhost:8000/inventory/stocktakes/019f1702-0af1-744c-a1ed-a8d4a64930ab?sort=itemName&dir=asc

Follow-ups during the run:
- > first store
- > oops / hold on  *(caught that the stocktake wasn't in the first store)*
- > You will need to login to opau health center, can do it at the bottom click on store

This produced the first full run: 6× CPU throttle, a performance trace, a heap
snapshot, in-page metrics, and a Lighthouse pass. Headline findings: CLS 0.042,
FCP 464ms, **LCP null**, heap ~69MB, 1,626 DOM nodes.

## 3. Turn it into something reusable

> What i really want is a way to measure performance metrics like you have but in
> a table, that will be eventually populated by new rows from improvements, and i
> want others to be able to do something similar so I really want like a prompt or
> skill made for this I guess, what do you reckon?

I recommended a **skill** over a one-off prompt. Answers to my design questions:

- **Results store:** HTML file
- **Scenario scope:** a config file of named scenarios
- **Columns:** CWV + heap + DOM/resources + run context
- **Creds/env:** a gitignored local config

→ Built the `perf-measure` skill (`SKILL.md`, `collect.js`, `append-row.mjs`,
`heap-size.mjs`, example configs, README) and verified the Node scripts end-to-end.

## 4. Dig into the anomaly

> Why no LCP

Investigated live with a pre-installed `PerformanceObserver`. Found LCP froze on a
breadcrumb at 964ms (before the table rendered) and the buffered API reported zero
after the route change. Conclusion: not a bug — interaction timing + late
client-rendering; LCP is a poor metric for this screen.

## 5. The "load" number doesn't match reality

> What is load ms in this case? And actually the page does take awhile to load, i
> kind of do want to capture that somehow,

Instrumented `fetch` + a `MutationObserver`. Found the smoking gun: `load` fired at
441ms, but the **16 GraphQL calls** that fetch the real data start *after* load and
finish at ~4.2s. The real "page is done" moment is ~10× the `load` metric.
Recommended capturing **time-to-data-rendered** and **time-to-network-quiet**.

## 6. The real goal emerges

> So the reason i wanted all of this, is that i am going to ask our team to
> implement their own version of a page like this, using whatever tools they want,
> and I want to give them a tool or prompt to use to generate this document as they
> make changes, how would I go about it

Clarifications that reshaped the design:
- > they could have completely new project btw
- > but I do want kind of like a prompt for them to use, a prompt they can give you
>   and you can create a skill etc for them

So the deliverable became a **meta-prompt**: teammates paste it into Claude Code in
their own (possibly brand-new) project, and Claude interviews them and generates a
project-tailored `perf-measure` skill. Answers to my final design questions:

- **Output form:** a Claude Code skill (like ours)
- **Metric rigidity:** core fixed (for comparability) + project-flexible extras

→ Wrote [bench-prompt.md](bench-prompt.md).

## 7. This document

> Can you make another MD with all of the prompts i gave you here to get to this
> point

(You're reading it.)

---

## What the journey taught us (carried into the final prompt as fixed rules)

1. **Don't trust `load`/LCP for SPAs** — measure content-based timings instead
   (time-to-data-rendered, time-to-network-quiet). Proven live: 441ms vs ~4.2s.
2. **One run is noise** — run N times, take the median, record the spread.
3. **Comparability needs context** — stamp machine, throttle, cold/warm, and the
   data-item count on every row, or cross-person rows are meaningless.
4. **Determinism + append-only** — a versioned collector and a marker-guarded HTML
   writer keep history honest as rows accumulate.
