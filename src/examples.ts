/**
 * Example values made from JSON Schemas, for the examples `fix` adds to
 * operations that have none.
 */
import type { ManifestTool } from "./manifest.js";

export function exampleArguments(op: ManifestTool | null, schema: Record<string, any>): Record<string, unknown> {
  const accepted = op?.suggestions?.accepted ? op.suggestions.examples : undefined;
  const ex = op?.examples?.[0]?.arguments ?? accepted?.[0]?.arguments;
  if (ex) return ex;
  const out: Record<string, unknown> = {};
  for (const name of (schema.required as string[] | undefined) ?? []) out[name] = exampleValue(schema.properties?.[name], name);
  return out;
}

export function exampleValue(s: any, name = "", depth = 0): unknown {
  if (!s || typeof s !== "object" || depth > 4) return name.toLowerCase().endsWith("id") ? `${name.replace(/_?id$/i, "") || "item"}_123` : "string";
  if (s.examples?.length) return s.examples[0];
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.const !== undefined) return s.const;
  const type = Array.isArray(s.type) ? s.type.find((t: string) => t !== "null") : s.type;
  if (s.oneOf?.[0] || s.anyOf?.[0]) return exampleValue(s.oneOf?.[0] ?? s.anyOf?.[0], name, depth + 1);
  switch (type) {
    case "integer":
      return typeof s.minimum === "number" ? s.minimum : 1;
    case "number":
      return typeof s.minimum === "number" ? s.minimum : 1.5;
    case "boolean":
      return true;
    case "array":
      return [exampleValue(s.items, name, depth + 1)];
    case "object": {
      const o: Record<string, unknown> = {};
      for (const k of (s.required as string[] | undefined) ?? Object.keys(s.properties ?? {}).slice(0, 3)) o[k] = exampleValue(s.properties?.[k], k, depth + 1);
      return o;
    }
    default:
      if (s.format === "date-time") return "2026-09-29T12:00:00Z";
      if (s.format === "date") return "2026-09-29";
      if (s.format === "email") return "ada@example.com";
      if (s.format === "uri") return "https://example.com";
      if (s.format === "uuid") return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      return name.toLowerCase().endsWith("id") ? `${name.replace(/_?id$/i, "") || "item"}_123` : "string";
  }
}
