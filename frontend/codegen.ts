import type { CodegenConfig } from "@graphql-codegen/cli";

// Rust scalars that travel over the wire as JSON strings. Mirrors the mapping
// in open-mSupply's codegen.yml so generated types match the server payloads.
const scalars = {
  DateTime: "string",
  NaiveDate: "string",
  NaiveDateTime: "string",
};

const sharedConfig = {
  nonOptionalTypename: true,
  scalars,
  // The app's tsconfig uses `erasableSyntaxOnly` (no runtime enums) and
  // `verbatimModuleSyntax` (type-only imports must say `import type`). These two
  // options keep the generated output within those rules: enums become
  // string-literal union types, and type imports are emitted as `import type`.
  enumsAsTypes: true,
  useTypeImports: true,
  // Emit each operation as a pre-printed query *string* (wrapped in a generated
  // `TypedDocumentString` class) instead of a parsed AST object. This prints the
  // query once, here at build time, so the browser bundle ships neither the
  // verbose AST JSON nor graphql-js's `print` — see src/api/request.ts.
  documentMode: "string",
};

// This mirrors open-mSupply's codegen approach: one base-types file from the
// `typescript` plugin, then a `.generated.ts` next to each `.graphql` operation
// file via the near-operation-file preset. The one deliberate swap is the
// `typed-document-node` plugin in place of `typescript-graphql-request` — it
// emits a plain TypedDocumentNode (query + result/variable types) that our tiny
// `fetch` wrapper runs, so there is no graphql-request runtime dependency.
//
// Regenerate with `npm run codegen` after editing any `.graphql` file. Refresh
// `schema.graphql` from the server with:
//   cd <open-msupply>/server && cargo run --bin remote_server_cli -- \
//     export-graphql-schema --path schema.graphql
const config: CodegenConfig = {
  overwrite: true,
  schema: "./schema.graphql",
  generates: {
    // Base types for the whole schema (enums, inputs, scalars, node types).
    "./src/api/schema-types.ts": {
      plugins: ["typescript"],
      config: sharedConfig,
    },
    // Per-operation documents + types, written alongside each .graphql file.
    "src/": {
      documents: ["./src/**/*.graphql"],
      preset: "near-operation-file",
      presetConfig: {
        extension: ".generated.ts",
        // Resolved relative to the `src/` generates base above.
        baseTypesPath: "api/schema-types.ts",
      },
      plugins: ["typescript-operations", "typed-document-node"],
      config: sharedConfig,
    },
  },
};

export default config;
