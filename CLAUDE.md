# CLAUDE.md — rnd-the-fe

## What this project is

An **R&D proof-of-concept**: build the open-mSupply **Stocktake page in vanilla TypeScript with
no framework**, while keeping **strong, real TypeScript type safety**. It's inspired by Rafael's
JS-only demo, but the whole point is to prove you can get that lean, framework-free result _without
giving up_ compile-time type checking.

It's also part of a team **bake-off**: several people build their own version of a similar page
(using whatever tools they like) and everyone measures performance with the _same_ protocol so the
numbers are comparable. Because this page fetches data after first paint, **performance of a
data-fetching SPA is a first-class concern**, not an afterthought.

## Primary goals — keep these front-of-mind on every change

1. **No framework, minimal dependencies.** Plain TS + Vite. VanJS and nanostores are things to consider for future if we need them, but first try to develop a nice pattern without them.
2. **Type safety is a primary goal.** Prefer compile-time guarantees; avoid `any`; derive types from
   a single source of truth (e.g. route param types are derived from the URL pattern, so names can't
   drift). NOTE: tsconfig is **not** `strict`/`noImplicitAny`, so the explicit types _are_ the
   guardrail — don't widen them back toward `any`. Clever types are welcome **when** they remove
   duplication, catch real bugs, and compile clean.
3. **Minimalism & readability.** Small, explicit code over abstraction. Match the existing style.
4. **Performance-aware.** The real "page is done" moment is **time-to-network-quiet**, not the
   browser `load` event or LCP (both are misleading for this SPA — `load` fired ~441ms while data
   finished ~4.2s). See `bench-prompt.md` for the measurement protocol.

## Layout

- **Repo root** — goal/reference docs only: `README.md`, `GOAL_README.md`, `bench-prompt.md`
  (perf-measurement protocol), `bench-prompt-journey.md`.
- **`frontend/`** — the actual Vite app; **all code work happens here.**
  - `src/main.ts` — bootstraps the router into `#app`.
  - `src/router.ts` — History-API SPA router: pattern matching with **typed params**, internal-link
    interception, `popstate`, 404 fallback. Runtime is intentionally tiny.
  - `src/components/nav.ts` — shared nav bar; parent-aware active-link highlighting.
  - `src/views/**` — one module per page, each `export`s `render(outlet, params)` (or just
    `render(outlet)` if it needs no params). **Nested folders mirror URL nesting** — e.g.
    `views/stocktake/list.ts` → `/stocktake`, `views/stocktake/detail.ts` → `/stocktake/:id`.
  - `src/data/**` — in-memory mock stores (until wired to GraphQL).
  - `src/style.css` — global styles + light/dark theme variables.

## Commands (run inside `frontend/`)

- `npm run dev` — Vite dev server. SPA history-fallback is on by default, so refreshing on any route
  (e.g. `/stocktake/st-1002`) works.
- `npm run build` — `tsc` typecheck **then** `vite build`. A change isn't done until this is clean.
- `npm run preview` — serve the production build.

## Conventions (enforced by tsconfig)

- **Explicit `.ts` extensions** on relative imports (`allowImportingTsExtensions`).
- **`import type { … }`** for type-only imports (`verbatimModuleSyntax`) — a value import of a
  type-only symbol fails to compile.
- **No unused locals/params** (`noUnusedLocals` / `noUnusedParameters`). A view that ignores params
  simply declares `render(outlet)` — a fewer-arg function is still assignable to `View`.
- `target` es2023; modern DOM APIs are fine.

## How to add a page / route

1. Create a view module exporting `render(outlet, params)` (nest the folder to match the URL).
2. Register it in `src/router.ts` via the **`route("/path/:id", view)` helper — never a raw
   `{ pattern, view }` object literal.** The helper's `NoInfer<P>` is what makes a view whose own
   pattern disagrees with the route a compile error; a hand-written entry skips that check.
3. Param names/types are **derived from the pattern literal** via `PathParams<P>`, so `params.id` is
   typed `string` and `params.idd` is a compile error. Values are always `string` — coerce locally
   (`Number(...)`) if needed. A per-route `parse()` function is the clean extension point if real
   validation/coercion is ever required (not built yet; don't pre-build it).

## Verify before declaring done

- `cd frontend && npm run build` must pass (typecheck + bundle).
- For behaviour, run `npm run dev` and drive it with the **chrome-devtools MCP** (navigate, click a
  link, confirm the view swaps **without a full reload**, back/forward, refresh-on-route).

## Stocktake page roadmap (from GOAL_README)

Basic table → graphql/codegen → filter → filter in URL param → per-row checkboxes + delete →
edit-stock-line modal → table updates after edits. **Measure perf at each step.**

## Reference

- Perf protocol & rules: `bench-prompt.md` (headline metric = **time-to-network-quiet**; don't trust
  `load`/LCP for this SPA; run N times, take the median, stamp run context).
- Reference data (open-mSupply): stocktake `019f17d0-1444-795c-ac53-da2216c73cff`, store_id
  `5B28901C52396E4BB098B9862CCF5DF9`, `v3.0.0-RC` branch, yaml `debug_no_access_control: true`.

- for reference to the original open-msupply code (types, graphql, datastructures etc) see the [open-mSupply repo](../open-msupply-3/) which is checked out on teh running server and is a good reference for the frontend and page designs.
