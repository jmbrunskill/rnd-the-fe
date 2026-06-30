import { setupCounter } from "../counter.ts";

export function render(outlet: HTMLElement) {
  outlet.innerHTML = `
    <section class="page">
      <h1>Home</h1>
      <p>A vanilla TypeScript single-page app. Click the nav above &mdash; the
         view swaps with no full page reload.</p>
      <button id="counter" type="button" class="counter"></button>
      <p><small>Tip: increment the counter, navigate away and back &mdash; it
         resets, because each view gets a fresh render.</small></p>
    </section>
  `;
  setupCounter(outlet.querySelector<HTMLButtonElement>("#counter")!);
}
