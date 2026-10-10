/**
 * openapi-agent-check: how well AI agents will use your API, from its
 * OpenAPI 3.0/3.1 spec, scored 0–100 over 13 rules.
 */
import type { Manifest } from "./manifest.js";
import { type ReadinessReport, readiness } from "./rules.js";
import { loadSpec } from "./spec.js";

export { formatReport, readiness, type Finding, type ReadinessReport, type RuleResult } from "./rules.js";
export { loadSpec, parseSpecText, specProblem, type LoadedSpec } from "./spec.js";
export type { Manifest, ManifestTool } from "./manifest.js";

/** The version of the rules: a report's score only changes when this does. */
export const RULES_VERSION = "1.0.3";

export interface CheckOptions {
  /** An Agentify tool list (agentify.tools.json); its accepted suggestions count. */
  manifest?: Manifest | null;
  fetcher?: typeof fetch;
}

/** Load a spec from a file path or URL and score it. */
export async function check(input: string, opts: CheckOptions = {}): Promise<{ report?: ReadinessReport; source?: string; error?: string }> {
  const loaded = await loadSpec(input, opts.fetcher);
  if (loaded.error) return { error: loaded.error };
  return { report: readiness(loaded.doc!, { manifest: opts.manifest ?? null, authMode: "passthrough" }), source: loaded.source };
}
