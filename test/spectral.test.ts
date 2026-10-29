import { readFileSync } from "node:fs";
import { Document, Spectral } from "@stoplight/spectral-core";
import { Json, Yaml } from "@stoplight/spectral-parsers";
import { describe, expect, it } from "vitest";
import { parseSpecText, readiness } from "../src/index.js";
import ruleset, { ERROR_WEIGHT, SPECTRAL_PREFIX, wherePath } from "../src/spectral.js";

const DIR = new URL("./fixtures/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, DIR), "utf8");
const fixtures: { cases: string[] } = JSON.parse(read("manifest.json"));

async function lint(text: string, yaml: boolean) {
  const spectral = new Spectral();
  spectral.setRuleset(ruleset);
  return spectral.run(yaml ? new Document(text, Yaml, "openapi.yaml") : new Document(text, Json, "openapi.json"));
}

describe("the Spectral ruleset", () => {
  it("has one rule per readiness rule, on the whole document", () => {
    const rules = readiness({ openapi: "3.1.0", info: { title: "", version: "" }, paths: {} }).rules;
    expect(rules).toHaveLength(13);
    expect(Object.keys(ruleset.rules).sort()).toEqual(rules.map((r) => `${SPECTRAL_PREFIX}${r.id}`).sort());
    for (const rule of rules) {
      const def = ruleset.rules[`${SPECTRAL_PREFIX}${rule.id}`]!;
      expect(def.given).toBe("$");
      expect(def.severity, rule.id).toBe(rule.weight >= ERROR_WEIGHT ? "error" : "warn");
    }
  });

  for (const name of fixtures.cases) {
    it(`finds what the CLI finds in ${name}`, async () => {
      const options = JSON.parse(read(`cases/${name}/case.json`));
      const text = read(`cases/${name}/${options.spec}`);
      const doc = parseSpecText(text).doc!;
      const report = readiness(doc, { manifest: null, authMode: "passthrough" });
      const cli = report.rules.flatMap((r) => r.findings.map((f) => [`${SPECTRAL_PREFIX}${r.id}`, `${f.where}: ${f.message}`, JSON.stringify(wherePath(doc, f.where).map(String))]));
      const diagnostics = await lint(text, /\.ya?ml$/.test(options.spec));
      // Spectral's own diagnostics (an unresolvable $ref, say) aren't the ruleset's.
      const found = diagnostics.filter((d) => String(d.code).startsWith(SPECTRAL_PREFIX)).map((d) => [String(d.code), d.message, JSON.stringify(d.path)]);
      expect(found.sort()).toEqual(cli.sort());
    });
  }

  it("reports a finding at its operation or parameter", async () => {
    const text = read("cases/orders-thin/openapi.json");
    const doc = JSON.parse(text);
    const diagnostics = await lint(text, false);
    const ids = diagnostics.find((d) => d.code === `${SPECTRAL_PREFIX}operation-ids`)!;
    expect(ids.path.slice(0, 1)).toEqual(["paths"]);
    expect(ids.path).toHaveLength(3);
    const param = diagnostics.find((d) => d.code === `${SPECTRAL_PREFIX}parameter-descriptions`);
    if (param) expect(param.path).toContain("parameters");
    expect(wherePath(doc, "spec")).toEqual([]);
    expect(wherePath(doc, "GET /nowhere")).toEqual([]);
  });

  it("finds nothing in a document that isn't OpenAPI 3", async () => {
    expect(await lint(JSON.stringify({ swagger: "2.0", paths: {} }), false)).toEqual([]);
    expect(await lint(JSON.stringify({ name: "package" }), false)).toEqual([]);
  });
});
