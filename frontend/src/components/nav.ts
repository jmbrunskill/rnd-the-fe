const links = [
  { href: "/", label: "Home" },
  { href: "/stocktake", label: "Stocktake" },
  { href: "/settings", label: "Settings" },
];

let mounted = false;

export function renderNav(currentPath: string) {
  const el = document.querySelector<HTMLElement>("#nav")!;
  if (!mounted) {
    el.innerHTML = `<nav class="nav">${links
      .map((l) => `<a href="${l.href}">${l.label}</a>`)
      .join("")}</nav>`;
    mounted = true;
  }
  el.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
    const href = a.getAttribute("href")!;
    // Light up the parent link on nested routes, e.g. "/stocktake/st-1001"
    // keeps the "/stocktake" link active. "/" only matches exactly.
    const active =
      href === "/"
        ? currentPath === "/"
        : currentPath === href || currentPath.startsWith(href + "/");
    a.classList.toggle("active", active);
    a.toggleAttribute("aria-current", active); // a11y: marks the current page
  });
}
