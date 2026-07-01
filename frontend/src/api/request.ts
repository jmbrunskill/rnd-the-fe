import type { DocumentTypeDecoration } from "@graphql-typed-document-node/core";

// The entire GraphQL runtime: POST a generated operation and return its typed
// `data`. Each generated document carries its own result + variable types, so
// callers get full inference (and compile errors on wrong variables) with zero
// per-operation boilerplate. See codegen.ts for how the documents are produced.
const GRAPHQL_URL = "/graphql"; // same-origin; vite proxies it to the server

interface GraphQLResponse<Result> {
  data?: Result;
  errors?: { message: string }[];
}

export async function gqlRequest<Result, Variables>(
  document: DocumentTypeDecoration<Result, Variables>,
  variables: Variables,
): Promise<Result> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Documents are pre-printed query strings (see codegen.ts `documentMode`),
    // so `String(document)` is the query text — no runtime `graphql` import.
    body: JSON.stringify({ query: String(document), variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const { data, errors }: GraphQLResponse<Result> = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  if (!data) throw new Error("GraphQL response contained no data");
  return data;
}
