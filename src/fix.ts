/**
 * `fix`: the rules-only fixes written into the spec itself. The same fixes the
 * hosted registry at latitude10.tech applies: deterministic, local, no model
 * and no network. Answered as the fixed document and as an RFC 6902 JSON
 * Patch against the document as given.
 */
import { parseDocument, isMap, isScalar, isSeq, stringify as stringifyYaml, type Document, type Node } from "yaml";
import { importOpenApi } from "./convert.js";
import { improve } from "./improve.js";
import { type PatchOp, applyPatch, jsonPatch } from "./json-patch.js";
import { readiness } from "./rules.js";
import { mergeSuggestions } from "./suggestions.js";

type Json = Record<string, any>;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

export interface FixResult {
  scoreBefore: number;
  scoreAfter: number;
  /** How many operations the fixes changed. */
  operations: number;
  /** RFC 6902 JSON Patch from the document as given to `fixed`. */
  patch: PatchOp[];
  fixed: Json;
}

const score = (doc: Json) => readiness(doc, { manifest: null, authMode: "passthrough" }).score;

// mergeSuggestions marks every operation with x-agentify (the tool name); the
// fixed spec keeps only the x-agentify it had.
function withOwnMarkers(original: Json, merged: Json): Json {
  const paths = (merged.paths ?? {}) as Record<string, Record<string, Json>>;
  const before = (original.paths ?? {}) as Record<string, Record<string, Json>>;
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      const had = before[path]?.[method];
      if (had && typeof had === "object" && "x-agentify" in had) op["x-agentify"] = had["x-agentify"];
      else delete op["x-agentify"];
    }
  }
  return merged;
}

/** The operations (`/paths/<path>/<method>`) a patch touches. */
function changedOperations(patch: PatchOp[]): number {
  const ops = new Set<string>();
  for (const { path } of patch) {
    const [, root, item, method] = path.split("/");
    if (root === "paths" && item !== undefined && method !== undefined && METHODS.includes(method)) ops.add(`${item}/${method}`);
  }
  return ops.size;
}

/**
 * The rules-only fixes for an OpenAPI 3.0/3.1 document: operationIds,
 * summaries, descriptions, parameter descriptions, examples and an
 * Idempotency-Key header on writes. Throws when the document isn't OpenAPI 3.
 * The document passed in is not changed.
 */
export function fix(doc: Json): FixResult {
  const scoreBefore = score(doc);
  const improved = improve(doc, importOpenApi(doc).manifest, { accept: true });
  const merged = withOwnMarkers(doc, mergeSuggestions(doc, improved.manifest.tools));
  const patch = jsonPatch(doc, merged);
  const fixed = applyPatch(doc, patch);
  return { scoreBefore, scoreAfter: score(fixed), operations: changedOperations(patch), patch, fixed };
}

const isJsonText = (text: string) => text.trim().startsWith("{");

/** The indent a JSON text uses (2 when it can't tell; 0 when it's on one line). */
function jsonIndent(text: string): string | number {
  const match = /\n([ \t]+)"/.exec(text);
  if (match) return match[1]!;
  return /\n/.test(text.trim()) ? 2 : 0;
}

/** Walks a YAML node by JSON Pointer segments; undefined where it can't follow (an alias, a missing key). */
function yamlNode(node: unknown, parts: string[]): unknown {
  let cur = node;
  for (const part of parts) {
    if (isMap(cur)) cur = cur.items.find((pair) => isScalar(pair.key) && String(pair.key.value) === part)?.value;
    else if (isSeq(cur)) cur = cur.items[Number(part)];
    else return undefined;
  }
  return cur;
}

const unescape = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");

/** Applies a patch to a parsed YAML document in place, keeping key order and most comments. False when it can't. */
function patchYaml(doc: Document, patch: PatchOp[]): boolean {
  for (const { op, path, value } of patch) {
    if (path === "") {
      doc.contents = doc.createNode(value) as Node;
      continue;
    }
    const parts = path.slice(1).split("/").map(unescape);
    const last = parts.pop()!;
    const parent = yamlNode(doc.contents, parts);
    if (isMap(parent)) {
      const index = parent.items.findIndex((pair) => isScalar(pair.key) && String(pair.key.value) === last);
      if (op === "remove") {
        if (index === -1) return false;
        parent.items.splice(index, 1);
      } else if (index === -1) parent.items.push(doc.createPair(last, value));
      else parent.items[index]!.value = doc.createNode(value);
    } else if (isSeq(parent)) {
      const index = last === "-" ? parent.items.length : Number(last);
      if (!Number.isInteger(index) || index < 0 || index > parent.items.length) return false;
      if (op === "add") parent.items.splice(index, 0, doc.createNode(value));
      else if (op === "replace") parent.items[index] = doc.createNode(value);
      else parent.items.splice(index, 1);
    } else return false;
  }
  return true;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Json)[k])]));
  return v;
}

/**
 * The fixed spec as text in the format of the original: JSON with the same
 * indent, or YAML with the original's key order (and its comments where the
 * YAML library can keep them).
 */
export function fixedText(originalText: string, fixed: Json, patch: PatchOp[]): string {
  const newline = /\n$/.test(originalText) ? "\n" : "";
  if (isJsonText(originalText)) return JSON.stringify(fixed, null, jsonIndent(originalText)) + newline;
  try {
    const doc = parseDocument(originalText);
    if (doc.errors.length === 0 && patchYaml(doc, patch)) {
      const text = doc.toString({ lineWidth: 0 });
      // Only trust the edited document when it reads back as exactly the fixed spec.
      if (sameJson(parseDocument(text).toJS({ maxAliasCount: 100 }), fixed)) return text;
    }
  } catch {
    // fall through to a fresh YAML document
  }
  return stringifyYaml(fixed, { lineWidth: 0 });
}
