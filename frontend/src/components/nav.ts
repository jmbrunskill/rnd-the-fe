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
    const active = a.getAttribute("href") === currentPath;
    a.classList.toggle("active", active);
    a.toggleAttribute("aria-current", active); // a11y: marks the current page
  });
}
