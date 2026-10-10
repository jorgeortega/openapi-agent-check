/**
 * Types for the tool list the importer produces, and for an optional
 * Agentify `agentify.tools.json` (which the check honours, so it scores a spec
 * the same way the Agentify API kit does).
 */

export interface ManifestParam {
  name: string;
  in: "path" | "query" | "header";
  /** The property name in the tool's input (usually `name`). */
  arg: string;
  required: boolean;
  style?: "form" | "deepObject" | "simple";
  explode?: boolean;
}

export interface ManifestExample {
  description?: string;
  arguments: Record<string, unknown>;
}

export interface ToolSuggestions {
  /** "rules" (from the readiness rules) or "claude" (drafted by a model: review it). */
  source: "rules" | "claude";
  accepted: boolean;
  operationId?: string;
  title?: string;
  description?: string;
  /** Parameter (or body property) name → description. */
  params?: Record<string, string>;
  examples?: ManifestExample[];
  /** Document an Idempotency-Key header (Agentify honours it for agent writes). */
  idempotencyKey?: boolean;
}

export interface ManifestTool {
  name: string;
  enabled: boolean;
  /** "METHOD /path" in the spec; how re-imports match your edits back up. */
  operation: string;
  operationId?: string;
  title?: string;
  description: string;
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params: ManifestParam[];
  body: { arg: string; required: boolean; contentType: string } | null;
  inputSchema: { type: "object"; [k: string]: unknown };
  scope?: string;
  price?: string;
  costUsd?: number;
  timeoutMs?: number;
  rateLimit?: { capacity: number; refillPerSec: number };
  weight?: number;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  examples?: ManifestExample[];
  suggestions?: ToolSuggestions;
}

export interface Manifest {
  $schema?: string;
  source?: { spec: string; title?: string; version?: string; importedAt: string };
  /** The API's base URL from the spec's `servers` (informational here: dispatch is in-process). */
  baseUrl?: string;
  tools: ManifestTool[];
}
