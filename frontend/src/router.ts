import { renderNav } from "./components/nav.ts";
import { render as home } from "./views/home.ts";
import { render as stocktake } from "./views/stocktake.ts";
import { render as settings } from "./views/settings.ts";
import { render as notFound } from "./views/not-found.ts";

// A view renders into the outlet and may return a cleanup function that the
// router calls when navigating away (e.g. to remove listeners or timers).
export type View = (outlet: HTMLElement) => void | (() => void);

const routes: Record<string, View> = {
  "/": home,
  "/stocktake": stocktake,
  "/settings": settings,
};

let outlet: HTMLElement;
let cleanup: (() => void) | void;

function renderRoute() {
  const path = location.pathname;
  const view = routes[path] ?? notFound;
  if (typeof cleanup === "function") cleanup(); // tear down the previous view
  cleanup = view(outlet);
  renderNav(path); // update the active link
  window.scrollTo(0, 0);
}

export function navigate(path: string) {
  if (path !== location.pathname) history.pushState({}, "", path);
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
