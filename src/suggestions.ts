/**
 * Applies per-operation `x-agentify` settings and accepted suggestions from
 * an Agentify tool list to a copy of the spec, so the check scores what agents
 * would actually be served.
 */
import type { ManifestTool } from "./manifest.js";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/** A copy of the spec with per-operation `x-agentify` and the accepted suggestions applied (also what `agentify check` scores). */
export function mergeSuggestions(original: Record<string, any>, ops: ManifestTool[]): Record<string, any> {
  const spec = structuredClone(original);
  const byOperation = new Map(ops.map((t) => [t.operation, t]));
  for (const [path, item] of Object.entries((spec.paths ?? {}) as Record<string, any>)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      const tool = byOperation.get(`${method.toUpperCase()} ${path}`);
      if (!tool) {
        op["x-agentify"] = { agents: false };
        continue;
      }
      // Your spec lists every operation (people use it too); a disabled one is marked
      // agents: false, with no tool name or price to advertise.
      op["x-agentify"] = tool.enabled ? { tool: tool.name, agents: true, ...(tool.price ? { price: `$${tool.price}` } : {}) } : { agents: false };
      const s = tool.suggestions;
      if (!s?.accepted) continue;
      if (s.operationId) op.operationId = s.operationId;
      if (s.title && !op.summary) op.summary = s.title;
      if (s.description) op.description = s.description;
      for (const p of (op.parameters ?? []) as any[]) {
        if (p && typeof p === "object" && !p.$ref && s.params?.[p.name] && !p.description) p.description = s.params[p.name];
      }
      if (s.idempotencyKey && !(op.parameters ?? []).some((p: any) => String(p?.name).toLowerCase() === "idempotency-key")) {
        op.parameters = [
          ...(op.parameters ?? []),
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            description: "A unique key (e.g. a UUID) per logical request. Retries with the same key and body return the first response instead of repeating the write.",
            schema: { type: "string", maxLength: 255 },
          },
        ];
      }
      if (s.examples?.length) op["x-agentify-examples"] = s.examples;
    }
  }
  return spec;
}
