import { esc } from "./html.ts";

// Minimal, dependency-free transient notification. Lazily creates one fixed
// container and appends a banner that auto-dismisses. Used to report mutation
// outcomes (e.g. delete success/failure). Styling lives in style.css (.toast*).

type ToastType = "success" | "error";

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = document.createElement("div");
    container.className = "toast-container";
    // aria-live so screen readers announce toasts as they appear.
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message: string, type: ToastType = "error"): void {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = esc(message);
  getContainer().appendChild(el);

  // Fade out then remove (~4s visible). Errors linger a little longer.
  const ms = type === "error" ? 6000 : 3500;
  const timer = window.setTimeout(() => {
    el.classList.add("toast--leaving");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    // Fallback removal if no transition fires.
    window.setTimeout(() => el.remove(), 400);
  }, ms);

  // Click to dismiss immediately.
  el.addEventListener("click", () => {
    clearTimeout(timer);
    el.remove();
  });
}
