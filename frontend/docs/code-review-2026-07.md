# Stocktake POC — Code Review (2026-07)

_Whole-project review of `frontend/src/**` (detail CRUD + list view workstreams,
shared table/modal/toast/html primitives, data layer, router). Produced by a
multi-agent review (5 reviewers → adversarial verification → synthesis); 31 of 32
findings were CONFIRMED against the code, 1 refuted and dropped. All findings
below are CONFIRMED unless marked "(worth checking)"._

## Top risks (ranked)

1. **Edit modal is orphaned on nav-away** — open a row edit, click a nav link → the `<dialog>` stays in the top layer trapping focus. → §2 _(FIXED 2026-07)_
2. **Two opposite table strategies with no written rule** — client-side detail vs server-side list; the next table gets built inconsistently. → §1
3. **Nav "Stocktake" link doesn't reset stale query** — clicking it on `?page=3&status=NEW` re-applies the old filter. → §2 _(FIXED 2026-07)_
4. **Edit modal has no reason field** — count adjustments that need a reason are a dead-end. → §2
5. **Row-click-to-edit has no keyboard path** — keyboard/SR users can't open the modal at all. → §2
6. **`Column.kind`/`value` decoupled + magic-string sort keys** — the shared table type lets wrong shapes through silently. → §4

---

## 1. Consistency risks as the codebase grows

_The dominant theme: the two parallel workstreams (detail + list) reimplemented the
same scaffolding and have already diverged, with no shared rule to stop further drift._

### High
- **No documented rule for client-side vs server-side tables.** Detail loads all ~1506 lines in one query and does filter/sort/select/edit entirely client-side (`detail.ts:38`, `wireTable` at `detail.ts:104`); list re-requests one 20-row page per change (`list.ts:105`). Both sit on the same `Column<T>`/`renderTable` primitives, and nothing in code or `CLAUDE.md` says which to pick. **Fix:** add a heuristic to `CLAUDE.md` — e.g. "bounded child collections that arrive in the parent round-trip → client-side wireTable; unbounded top-level collections → server-paged" — and cross-link the perf note at `detail.ts:122-126`.
- **Detail and list use incompatible sort-key spaces; detail URL-encodes header text.** List keys columns to the schema enum via `sortField()` (`columns.ts:95`) → clean `?sort=stocktakeNumber`. Detail omits `key` on most columns, so `columnKey()` falls back to header text (`table.ts:125`) and `syncUrl` writes it verbatim (`detail.ts:203-208`) → brittle `?sort=Snapshot+%23+Packs`. Any header rename silently invalidates every bookmarked deep link (the mount gate `sortableByKey.has(urlSort)` at `detail.ts:382` then fails). **Fix:** give each sortable detail column a stable URL-safe `key` slug, mirroring the list.

### Medium
- **Filter/sort/URL controller logic is copy-pasted and drifting.** Six near-identical pieces exist in both views: `sortableByKey` build (`detail.ts:148`/`list.ts:44`), `updateAriaSort` (`detail.ts:190`/`list.ts:88`), the asc→desc→none cycle (`detail.ts:230-238`/`list.ts:203-205`), `syncUrl` (`detail.ts:203`/`list.ts:79`), read-URL-on-mount (`detail.ts:379`/`list.ts:148`), debounced search. Already diverged: debounce **120ms** (`detail.ts:218`) vs **250ms** (`list.ts:174`). **Fix:** extract framework-free helpers now while there are exactly two call sites — `sortController(cols)` and a read/write-sort-to-URL pair — keeping the client-vs-server apply step per view. At minimum reconcile or comment the debounce.
- **`Column.value` is overloaded into two modes.** Its contract (`table.ts:22-24`) is that `value` drives both display and the client sort. But the list's Description column sets a throwaway `value` purely to satisfy `isSortable`'s `c.value != null` gate (`table.ts:126`) while `html` renders the link and the server does the ordering. **Fix:** make server-sortability first-class (an explicit `sortable:true`, or let a present server-field `key` suffice), or at least document the dual mode on `table.ts:22`.
- **`.stock-count` reused for two different meanings.** Detail's toolbar uses it for a live "Showing X of Y" client-filter count (`detail.ts:154`); the pager uses the same class for "Page N of M · T total" (`pager.ts:27`). Defensible but undocumented. **Fix:** split the classes or add a one-line comment in `style.css`.

### Low
- **Sort-direction toggle resets to page 1 (list).** Any header click does `state.page=1` (`list.ts:206`), including asc→desc on the already-active column. **Fix:** reset page only when the sort *key* or a filter changes.
- **Magic values scattered, no source of truth.** The two debounce literals (120 vs 250) are the one genuine cross-file drift; `STORE_ID` (`stocktakes.ts:42`), default sort (`stocktakes.ts:82`), toast durations (`toast.ts:30`) are single-site but bare. **Fix:** a small constants module or named consts with a one-line reason.

---

## 2. Likely bugs / things needing more user feedback

### High
- **Edit modal is orphaned when you navigate away mid-edit.** `openModal()` appends the `<dialog>` to `document.body` and calls `showModal()` (top-layer focus trap); `openLineEdit` discards the returned `ModalHandle` (`line-edit.ts:32`); `wireTable`'s teardown (`detail.ts:394-402`) never closes a dialog; the router just swaps `outlet.innerHTML` (`router.ts:83-84`). So opening a row edit then clicking a nav link leaves the modal on screen over the new page, still trapping focus. **Fix:** keep the `ModalHandle` in `wireTable` and call `handle.close()` in teardown.
- **Nav "Stocktake" link doesn't reset stale query state.** `navigate()` only pushes when `path !== location.pathname`, and pathname excludes the query (`router.ts:90`). The link is `href="/stocktake"` (`nav.ts:3`). On `/stocktake?page=3&status=NEW&sort=status&dir=desc`, clicking it is a no-op push; the list re-mounts and re-reads the stale query (`list.ts:148-159`). **Fix:** compare/replace the full `pathname + search` in `navigate()`.
- **Edit modal has no reason field → count adjustments requiring a reason are a dead-end.** The form has only Counted #, Batch, Comment (`line-edit.ts:15-30`); `updateStocktakeLine` sends only those (`stocktakes.ts:159-181`) — no `reasonOptionId` (schema supports it, `schema.graphql:9854`). open-mSupply rejects a counted-vs-snapshot mismatch with `AdjustmentReasonNotProvided`; `fail()` renders that as read-only inline text with no way to supply the reason. **Fix:** add a reason selector populated from the store's reason options and send `reasonOptionId`; at minimum, a client-side hint when counted ≠ snapshot.
- **Row-click-to-edit has no keyboard path (a11y).** The modal opens only via a `click` listener on the plain `<tr>` (`detail.ts:375`); rows have no `tabindex`/`role`/keydown. **Fix:** a real per-row Edit `<button>` (a `kind:"actions"` column), or `tabindex=0`+`role=button`+`aria-label`+keydown, sharing one handler with the click path.

### Medium
- **Sort not re-applied after an in-place edit.** `onSaved` updates `current[i]`, swaps the `<tr>` via `replaceWith`, and calls `applyFilter()` — but never `applySort()` (`detail.ts:347-364`). If sorted by e.g. "Counted # Packs" and you edit that value, the row keeps its old slot while `aria-sort` still shows sorted. **Fix:** call `applySort()` (when `view.sortKey` is set) after the swap.
- **Delete silently removes selected rows filtered out of view.** `selected` persists across filter changes (`applyFilter` only toggles display, `detail.ts:162-174`); `onDelete` deletes `[...selected]` (`detail.ts:310`) and the "Delete (N)" count includes hidden rows. This contradicts select-all's visible-only semantics (`detail.ts:294-302`). **Fix:** scope delete to visible-selected, or clear/annotate selection on filter change.
- **Back/forward doesn't restore filter/sort/page (replaceState-only).** All in-view URL writes use `history.replaceState` (`url.ts:17`); the router pushes only on route change (`router.ts:90`). Back jumps straight out of the list — contradicts the "browser back into this view" comment at `detail.ts:378`. **Fix:** decide intent — push an entry for user-initiated changes (with popstate re-reading), or drop the framing.
- **popstate = full refetch.** `popstate` → `renderRoute()` tears down and re-invokes the view (`router.ts:80-87,110`), so every back/forward re-runs `fetchStocktakes()` or the whole ~1506-line `getStocktake`. Directly relevant to the time-to-network-quiet metric. **Fix:** a lightweight per-view URL-keyed state cache, or document popstate = refetch.

### Low
- **Cancel during an in-flight save still fires the success toast and `onSaved`.** The submit does `if (await opts.onSubmit(dialog)) close()` (`modal.ts:55`); the only guard is `saveBtn.disabled`, and Cancel is never disabled (`modal.ts:38`). **Fix:** a closed/cancelled flag `onSubmit`/`close` cooperate on, or disable Cancel while saving.
- **Destructive delete has no undo, only native `confirm()`** (`detail.ts:312`), then a fire-and-forget success toast. **Fix:** an undo action-toast (restore mutation) or soft-delete window.

---

## 3. General best-practice recommendations

### Medium
- **Modal doesn't restore focus to the trigger on close.** `openModal()` never captures `document.activeElement` and `close()` just removes the node (`modal.ts:20-66`), so focus drops to `<body>`. **Fix:** capture the opener at open, `opener?.focus?.()` on close.
- **Toast nests conflicting live-region roles.** Container is `aria-live="polite"` (`toast.ts:16`) and each toast adds `role="alert"`/`role="status"` inside it. **Fix:** pick one mechanism (recommended: drop container `aria-live`, keep per-toast roles).
- **Native `confirm()` breaks the app's own dialog/toast UX** (`detail.ts:312`) — blocking, unstyled, suppressible. **Fix:** a small `openModal()` confirm variant returning `Promise<boolean>`.
- **No lint/format config and no tests.** With a non-strict tsconfig, explicit types are the only guardrail. **Fix:** add Prettier + `format:check` and typescript-eslint (`no-floating-promises`, `no-explicit-any`); a handful of Vitest tests for pure logic (`sortRows` null-ordering, `esc`/`html` escaping, `deleteStocktakeLines` partial-error parsing).

### Low
- **Client-side detail table has no scaling ceiling (documentation gap).** `getStocktake` loads every line unpaginated (`stocktakes.ts:91`); `wireTable` holds every `<tr>`, reorders all on sort, scans all on filter. Fine at ~1.5k, linear toward 10k. **Fix:** state the bounded assumption near `getStocktake`, or note the cliff with the server-paged list as migration target.
- **`html`` escapes every interpolation, so it can't emit attributes/markup — latent trap.** `pager.ts:26,28` `${... ? "disabled" : ""}` works only by luck. **Fix:** document that interpolations are always text (toggle attributes in JS post-render), or teach `html`` to pass branded `Html` through un-escaped.

---

## 4. Where types are too general / don't give clear context

_This is the project's stated primary goal (compile-time safety is the only guardrail under
non-strict tsconfig). None is a live runtime bug today — every current call site is authored
correctly — they are latent gaps where the type permits a wrong shape._

### High
- **`Column.kind` and `Column.value` are decoupled.** `kind?`, `value?:(row)=>CellValue`, `format?` are three independent fields over one flat `CellValue` union (`table.ts:11,20-31`). `{header:"Pack Size", kind:"number", value:(l)=>String(l.packSize)}` compiles cleanly, yet `baseCompare` does `(a as number)-(b as number)` → `NaN` sort. The `as number`/`as CellValue` casts (`table.ts:91,94,111`) are the tell. **Fix:** make `Column` a `kind`-discriminated union (`NumberColumn` has `value:(row)=>number|null`, etc.) — accessor/formatter/comparator types flow from `kind` and every cast disappears.
- **Sort keys / column keys are plain `string` with magic literals.** `Column.key?:string`, `columnKey():string` (`table.ts:40,125`), `view.sortKey:string|null` (`detail.ts:158`), untyped `th.dataset.sortKey` (`detail.ts:229`), literals `"__select"`/`"difference"`. `columns.ts:95` already shows the better pattern (`sortField<K extends StocktakeSortFieldInput>`). **Fix:** derive a `SortKey` union for the detail table from its columns; type `view.sortKey`/the handler to it; brand `"__select"`.

### Medium
- **`format` receives the wide `CellValue`, forcing hand re-narrowing.** `format?:(value:CellValue,row)=>string` (`table.ts:30`). The one override (`columns.ts:77`) writes `typeof v === "number" ...` purely to recover a type it already declared. **Fix:** falls out of the discriminated-union fix.
- **Detail `view` state is an inline literal with two inference-fixing casts.** `const view = { query:"", sortKey: null as string|null, sortDir: "asc" as "asc"|"desc" }` (`detail.ts:158`). The sibling list does this right with `interface ListState` (`list.ts:29-34`). **Fix:** declare a `DetailView` interface, annotate `view`, drop both casts.

### Low
- **`html`` interpolations typed `unknown[]` then cast into `esc`** (`html.ts:29,32`) — `html`${someObject}`` stringifies to `[object Object]`. **Fix:** type the rest param `(string|number|null|undefined)[]`.
- **`LineEdit` is the one hand-written shape the data layer claims not to have** (`stocktakes.ts:159-163`) — it hand-duplicates 3 fields of the generated `UpdateStocktakeLineInput`. **Fix:** `type LineEdit = Pick<UpdateStocktakeLineInput, "countedNumberOfPacks"|"batch"|"comment">`.

---

## What's solid (for balance)

- **The router is genuinely tidy and type-safe** — `PathParams<P>` deriving param names from the URL literal, the `route()` helper's `NoInfer<P>` catching pattern/view mismatches, and a tiny runtime.
- **The data layer's stated principle is largely honoured** — shapes come from codegen; `LineEdit` (§4 low) is the only violation, a one-line fix.
- **`esc`/`html`` escaping is correct at every current call site**; the `Html` brand is a nice touch — the traps flagged are latent, not live.
- **Both table strategies are individually correct and documented** — the gap is the missing shared rule, not either implementation.
- **The list's request-token cancellation** (`list.ts:102,107,113`) correctly prevents stale DOM writes.
- **No `any` widening, no strict-mode cheats** beyond the handful of inference-fixing casts called out.

**Net:** for a young R&D POC the correctness bar is already decent. The two things worth doing
before the codebase grows: (a) write down the client-vs-server table rule and extract the shared
sort/URL helpers (§1); (b) fix the orphaned-modal and nav-doesn't-reset-query bugs (§2) — the two
a bake-off demo will actually hit.
