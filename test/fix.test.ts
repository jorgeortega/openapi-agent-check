import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { applyPatch, badge, badgeColor, fix, fixedText, jsonPatch, parseSpecText, readiness, specProblem } from "../src/index.js";

const DIR = new URL("./fixtures/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, DIR), "utf8");
const fixtures: { cases: string[] } = JSON.parse(read("manifest.json"));

function load(name: string) {
  const options = JSON.parse(read(`cases/${name}/case.json`));
  const text = read(`cases/${name}/${options.spec}`);
  return { options, text, doc: parseSpecText(text).doc! };
}

describe("fix", () => {
  for (const name of fixtures.cases) {
    it(`never makes ${name} score worse, and keeps it valid`, () => {
      const { options, text, doc } = load(name);
      const original = structuredClone(doc);
      const result = fix(doc);
      expect(doc).toEqual(original);
      const opts = { manifest: null, authMode: options.authMode ?? "passthrough", baseUrl: options.baseUrl };
      const before = readiness(doc, opts);
      const after = readiness(result.fixed, opts);
      expect(result.scoreBefore).toBe(before.score);
      expect(result.scoreAfter).toBe(after.score);
      expect(after.score).toBeGreaterThanOrEqual(before.score);
      after.rules.forEach((rule, i) => {
        expect(rule.id).toBe(before.rules[i]!.id);
        expect(rule.share, rule.id).toBeGreaterThanOrEqual(before.rules[i]!.share);
      });
      // Still valid input, as written to disk.
      const written = parseSpecText(fixedText(text, result.fixed, result.patch));
      expect(written.error).toBeUndefined();
      // (JSON has no -0, so compare as JSON.)
      expect(written.doc).toEqual(JSON.parse(JSON.stringify(result.fixed)));
      expect(specProblem(written.doc!)).toBeNull();
      // The patch takes the original to the fixed spec.
      expect(applyPatch(doc, result.patch)).toEqual(result.fixed);
      expect(jsonPatch(doc, result.fixed)).toEqual(result.patch);
    });
  }

  it("fixes a thin spec", () => {
    const result = fix(load("orders-thin").doc);
    expect(result.scoreBefore).toBe(54);
    expect(result.scoreAfter).toBe(96);
    expect(result.operations).toBe(4);
    const op = result.fixed.paths["/v1/orders"].post;
    expect(op.operationId).toBe("createOrder");
    expect(op.summary).toBe("Create order");
    expect(op.parameters.some((p: { name: string }) => p.name === "Idempotency-Key")).toBe(true);
    expect(op["x-agentify"]).toBeUndefined();
  });

  it("changes nothing a second time", () => {
    const once = fix(load("orders-thin").doc);
    expect(fix(once.fixed).patch).toEqual([]);
  });

  it("keeps the examples and x-agentify you wrote", () => {
    const doc = {
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: { "/things/{id}": { delete: { "x-agentify": { name: "removeThing" }, "x-agentify-examples": [{ arguments: { id: "mine" } }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Gone" } } } } },
    };
    const op = fix(doc).fixed.paths["/things/{id}"].delete;
    expect(op["x-agentify-examples"]).toEqual([{ arguments: { id: "mine" } }]);
    expect(op["x-agentify"]).toEqual({ name: "removeThing" });
    expect(op.operationId).toBe("deleteThing");
  });

  it("throws on a document that isn't OpenAPI 3", () => {
    expect(() => fix({ swagger: "2.0", paths: {} })).toThrow(/Swagger 2.0/);
  });
});

describe("the fixed spec as text", () => {
  it("keeps JSON's indent", () => {
    const { text, doc } = load("orders-thin");
    const result = fix(doc);
    expect(fixedText(text, result.fixed, result.patch)).toBe(`${JSON.stringify(result.fixed, null, 2)}\n`);
    expect(fixedText(JSON.stringify(doc), result.fixed, result.patch)).toBe(JSON.stringify(result.fixed));
  });

  it("keeps YAML's key order and its comments", () => {
    const yaml = [
      "# The orders API",
      "openapi: 3.1.0",
      "info: { title: Orders, version: '1' }",
      "paths:",
      "  /v1/orders:",
      "    get:",
      "      responses:",
      "        '200': # the list",
      "          description: OK",
      "",
    ].join("\n");
    const result = fix(parseSpecText(yaml).doc!);
    const out = fixedText(yaml, result.fixed, result.patch);
    expect(out).toContain("# The orders API");
    expect(out).toContain("# the list");
    expect(parseYaml(out)).toEqual(result.fixed);
    expect(Object.keys(parseYaml(out))).toEqual(["openapi", "info", "paths"]);
    expect(Object.keys(parseYaml(out).paths["/v1/orders"].get)).toEqual(["responses", "operationId", "summary", "description", "x-agentify-examples"]);
  });
});

describe("badge", () => {
  it("is a shields.io static badge linked to the hosted check", () => {
    expect(badge(87)).toBe("[![agent-ready](https://img.shields.io/badge/agent--ready-87%2F100-green)](https://latitude10.tech/agent-readiness)");
  });

  it("is green at 80 or more, yellow at 50 or more, red below 50", () => {
    expect([100, 80, 79, 50, 49, 0].map(badgeColor)).toEqual(["green", "green", "yellow", "yellow", "red", "red"]);
    expect(badge(50)).toContain("-50%2F100-yellow)");
    expect(badge(49)).toContain("-49%2F100-red)");
  });
});
