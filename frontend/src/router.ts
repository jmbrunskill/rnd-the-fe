import { renderNav } from "./components/nav.ts";
import { render as home } from "./views/home.ts";
import { render as stocktakeList } from "./views/stocktake/list.ts";
import { render as stocktakeDetail } from "./views/stocktake/detail.ts";
import { render as settings } from "./views/settings.ts";
import { render as notFound } from "./views/not-found.ts";

// Derive the param names from a route pattern literal.
//   "/stocktake/:id"  -> { id: string }
//   "/a/:x/b/:y"      -> { x: string; y: string }
//   "/settings"       -> {}
export type PathParams<P extends string> =
  P extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof PathParams<`/${Rest}`>]: string }
    : P extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {};

// A view renders into the outlet and may return a cleanup function the router
// calls when navigating away. View is generic over its pattern; the params type
// is derived from the pattern, not hand-written. Default = string so a paramless
// view (params: {}) is still assignable to the bare `View` type.
export type View<P extends string = string> = (
  outlet: HTMLElement,
  params: PathParams<P>,
) => void | (() => void);

interface Route<P extends string = string> {
  pattern: P;
  view: View<P>;
}

// Captures the literal pattern (`const P`) and ties it to the view. `NoInfer<P>`
// on the view position pins P to the PATTERN only, so a view whose own pattern
// disagrees (e.g. View<"/x/:slug"> on route "/stocktake/:id") is a compile error.
function route<const P extends string>(
  pattern: P,
  view: View<NoInfer<P>>,
): Route<P> {
  return { pattern, view };
}

// Declared just like before — one helper call instead of an object literal.
// `as Route[]` erases the per-row generic so the array is uniform for match().
const routes: Route[] = [
  route("/", home),
  route("/stocktake", stocktakeList),
  route("/stocktake/:id", stocktakeDetail),
  route("/settings", settings),
] as Route[];

type Params = Record<string, string>;

// Runtime UNCHANGED. The path is a plain string at runtime, so the surfaced
// dispatch type stays Record<string,string>; the typing payoff is at the view
// declaration + route-table wiring sites.
function match(path: string): { view: View; params: Params } {
  for (const route of routes) {
    const keys: string[] = [];
    const source =
      "^" +
      route.pattern.replace(/:([^/]+)/g, (_, key) => {
        keys.push(key);
        return "([^/]+)";
      }) +
      "$";
    const m = path.match(new RegExp(source));
    if (m) {
      const params: Params = {};
      keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1])));
      return { view: route.view, params };
    }
  }
  return { view: notFound, params: {} };
}

let outlet: HTMLElement;
let cleanup: (() => void) | void;

function renderRoute() {
  const path = location.pathname;
  const { view, params } = match(path);
  if (typeof cleanup === "function") cleanup(); // tear down the previous view
  cleanup = view(outlet, params); // params: Record<string,string> satisfies PathParams<string> ({})
  renderNav(path); // update the active link
  window.scrollTo(0, 0);
}

export function navigate(path: string) {
  // Compare against the FULL current URL (incl. query), not just pathname:
  // clicking a query-less link (e.g. "/stocktake") while on a filtered/paged
  // URL ("/stocktake?page=3&status=NEW") must push the clean path so the stale
  // query is cleared. Comparing pathname-only made that a no-op. match() still
  // keys off location.pathname, so a link that carries its own query works too.
  const current = location.pathname + location.search + location.hash;
  if (path !== current) history.pushState({}, "", path);
  renderRoute();
}

export function startRouter(mount: HTMLElement) {
  outlet = mount;

  // Intercept internal link clicks -> client-side nav. Links stay real
  // <a href> elements (progressive enhancement), we just skip the full reload.
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return; // external link or anchor
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // allow new-tab
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener("popstate", renderRoute); // back / forward buttons
  renderRoute(); // initial render
}
