import { defineConfig } from "vite";

// Proxy GraphQL to the local open-mSupply server so the browser can POST to a
// same-origin /graphql (no CORS). Run the server on the v3.0.0-RC branch with
// `debug_no_access_control: true` so requests don't need an auth token.
// Adjust `target` if your server listens elsewhere (default port is 8000).
const graphqlProxy = {
  "/graphql": {
    target: "http://localhost:8000",
    changeOrigin: true,
  },
};

// `server` covers `vite` (dev); `preview` covers `vite preview` (prod build).
// Both need the proxy — perf-measure runs against the production build, so
// without preview.proxy the served bundle would 404 on /graphql.
export default defineConfig({
  server: { proxy: graphqlProxy },
  preview: { proxy: graphqlProxy },
});
