export function render(outlet: HTMLElement) {
  outlet.innerHTML = `
    <section class="page">
      <h1>Page not found</h1>
      <p>No route matches <code>${location.pathname}</code>.</p>
      <p><a href="/">Back to home</a></p>
    </section>
  `;
}
