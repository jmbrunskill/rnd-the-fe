#!/usr/bin/env node
/*
 * perf-measure — heap-snapshot sizer.
 *
 * Turns a V8 .heapsnapshot (captured via chrome-devtools MCP `take_heapsnapshot`)
 * into a single "live JS heap (MB)" number, by summing the self_size of every
 * node in the snapshot. This is more precise and reproducible than
 * performance.memory.usedJSHeapSize (which is coarse and can lag GC).
 *
 * Snapshots are large and machine-specific — keep them OUT of git (the skill
 * writes them under docs/perf/snapshots/, which is gitignored). This script
 * only needs the file long enough to produce the MB figure for the results row.
 *
 * CLI:   node heap-size.mjs <file.heapsnapshot>   ->  prints MB (1 decimal)
 * API:   import { heapSnapshotMB } from "./heap-size.mjs"
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** @returns {number} total live JS heap size in MB (1 decimal). */
export function heapSnapshotMB(path) {
  const snap = JSON.parse(readFileSync(path, "utf8"));
  const meta = snap.snapshot && snap.snapshot.meta;
  const fields = meta && meta.node_fields;
  const nodes = snap.nodes;
  if (!Array.isArray(fields) || !Array.isArray(nodes)) {
    throw new Error(`${path} does not look like a .heapsnapshot (missing nodes/node_fields)`);
  }
  const selfSizeIdx = fields.indexOf("self_size");
  if (selfSizeIdx < 0) throw new Error("snapshot node_fields has no self_size");

  const stride = fields.length;
  let bytes = 0;
  for (let i = selfSizeIdx; i < nodes.length; i += stride) bytes += nodes[i];
  return Math.round((bytes / 1048576) * 10) / 10;
}

const isMain = pathToFileURL(process.argv[1] || "").href === import.meta.url;
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node heap-size.mjs <file.heapsnapshot>");
    process.exit(2);
  }
  console.log(heapSnapshotMB(path));
}
