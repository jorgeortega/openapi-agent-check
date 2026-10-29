/**
 * The readiness rules as a Spectral ruleset: `extends: [openapi-agent-check/spectral]` in a
 * `.spectral.yaml`. Each of the 13 rules is one Spectral rule on the whole document (`$`) that runs
 * this package's rule code, so Spectral reports exactly the findings the CLI does, each at the
 * operation or parameter it's about.
 *
 * `@stoplight/spectral-core` is an optional peer dependency: this module only imports its types.
 */
import type { IFunctionResult, RuleDefinition, RulesetDefinition, RulesetFunctionContext } from "@stoplight/spectral-core";
import { pointerSegment } from "./convert.js";
import { type ReadinessReport, readiness } from "./rules.js";

type Json = Record<string, any>;
type JsonPath = Array<string | number>;

/** Spectral rule names: `agent-ready-` and the readiness rule's id. */
export const SPECTRAL_PREFIX = "agent-ready-";

/**
 * Rules with weight 8 or more (operation-ids, descriptions, summaries, parameter-descriptions,
 * response-schemas, security) are errors: together they're over half the score. The rest
 * (weights 4 to 6) are warnings.
 */
export const ERROR_WEIGHT = 8;

const METHODS = new Set(["get", "put", "post", "delete", "patch", "head"]);

function deref(doc: Json, v: any, depth = 0): any {
  if (depth > 10 || !v || typeof v !== "object" || typeof v.$ref !== "string" || !v.$ref.startsWith("#/")) return v;
  let cur: any = doc;
  for (const p of v.$ref.slice(2).split("/")) cur = cur?.[pointerSegment(p)];
  return deref(doc, cur, depth + 1);
}

/**
 * A finding's `where` as a JSON path into the document: "GET /orders" is the operation,
 * "GET /orders query:limit" the parameter (on the operation, else on the path item), and "spec"
 * the document's root.
 */
export function wherePath(doc: Json, where: string): JsonPath {
  const m = /^([A-Z]+) (.+?)(?: (query|header|path|cookie):(.*))?$/.exec(where);
  if (!m) return [];
  const method = m[1]!.toLowerCase();
  const path = m[2]!;
  if (!METHODS.has(method) || !doc.paths || typeof doc.paths !== "object" || !(path in doc.paths)) return [];
  const operation: JsonPath = ["paths", path, method];
  if (!m[3]) return operation;
  const matches = (p: any) => {
    const param = deref(doc, p);
    return param?.in === m[3] && param?.name === m[4];
  };
  const item = deref(doc, doc.paths[path]) ?? {};
  const own = Array.isArray(item[method]?.parameters) ? (item[method].parameters as unknown[]).findIndex(matches) : -1;
  if (own !== -1) return [...operation, "parameters", own];
  const shared = Array.isArray(item.parameters) ? (item.parameters as unknown[]).findIndex(matches) : -1;
  if (shared !== -1) return ["paths", path, "parameters", shared];
  return operation;
}

const reports = new WeakMap<object, { doc: Json; report: ReadinessReport }>();

/**
 * One report per document, shared by the 13 rules, with the same options as the CLI's check. The
 * rule code runs on a plain JSON copy: Spectral's document can't be structured-cloned.
 */
function reportFor(data: Json): { doc: Json; report: ReadinessReport } {
  let entry = reports.get(data);
  if (!entry) {
    const doc = JSON.parse(JSON.stringify(data)) as Json;
    entry = { doc, report: readiness(doc, { manifest: null, authMode: "passthrough" }) };
    reports.set(data, entry);
  }
  return entry;
}

const isOpenApi3 = (doc: unknown): doc is Json =>
  !!doc && typeof doc === "object" && !Array.isArray(doc) && typeof (doc as Json).openapi === "string" && (doc as Json).openapi.startsWith("3.");

/** The Spectral function for one readiness rule: its findings, each at its location. */
export function readinessRule(id: string) {
  return function agentReadiness(target: unknown, _options: unknown, context?: RulesetFunctionContext): IFunctionResult[] {
    const input = context?.document?.data ?? target;
    if (!isOpenApi3(input)) return [];
    const { doc, report } = reportFor(input);
    const rule = report.rules.find((r) => r.id === id);
    return (rule?.findings ?? []).map((f) => ({ message: `${f.where}: ${f.message}`, path: wherePath(doc, f.where) }));
  };
}

// The rules' ids, titles, weights and fixes, read from the rule code itself.
const catalogue = readiness({ openapi: "3.1.0", info: { title: "", version: "" }, paths: {} }).rules;

const rules: Record<string, RuleDefinition> = Object.fromEntries(
  catalogue.map((rule) => [
    `${SPECTRAL_PREFIX}${rule.id}`,
    {
      description: `${rule.title}. ${rule.fix}`,
      // Each finding's own message ("GET /orders: no operationId"), not the description.
      message: "{{error}}",
      documentationUrl: "https://github.com/jorgeortega/openapi-agent-check#the-rules",
      severity: rule.weight >= ERROR_WEIGHT ? "error" : "warn",
      given: "$",
      // The rule code follows the document's own $refs, as the CLI does.
      resolved: false,
      then: { function: readinessRule(rule.id) },
    } satisfies RuleDefinition,
  ]),
);

/** The ruleset: `extends: [openapi-agent-check/spectral]`. */
const ruleset = { rules } satisfies RulesetDefinition;

export default ruleset;
