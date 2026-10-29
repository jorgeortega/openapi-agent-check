import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { run } from "../src/cli.js";
import { applyPatch } from "../src/index.js";

const fixture = (name: string, file = "openapi.json") => fileURLToPath(new URL(`./fixtures/cases/${name}/${file}`, import.meta.url));

describe("the CLI", () => {
  it("prints the score and each rule", async () => {
    const result = await run([fixture("good")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Agent readiness: 100\/100/);
    expect(result.stdout).toContain("✔ Every operation has a clear operationId");
  });

  it("lists findings and the fix for a failing rule", async () => {
    const result = await run([fixture("orders-thin")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("✖");
    expect(result.stdout).toContain("fix:");
  });

  it("reads YAML", async () => {
    const result = await run([fixture("yaml-input", "openapi.yaml")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Agent readiness: \d+\/100/);
  });

  it("prints JSON with --json", async () => {
    const result = await run([fixture("good"), "--json"]);
    const report = JSON.parse(result.stdout);
    expect(report.score).toBe(100);
    expect(report.rulesVersion).toBe("1.0.4");
    expect(report.rules).toHaveLength(13);
  });

  it("exits 1 below --min, 0 at or above it", async () => {
    const low = await run([fixture("orders-thin"), "--min", "90"]);
    expect(low.code).toBe(1);
    expect(low.stderr).toMatch(/below the minimum of 90/);
    expect((await run([fixture("good"), "--min", "100"])).code).toBe(0);
  });

  it("exits 2 when the spec can't be read or the arguments are wrong", async () => {
    expect((await run(["does-not-exist.json"])).stderr).toMatch(/No such file/);
    expect((await run(["does-not-exist.json"])).code).toBe(2);
    expect((await run([])).code).toBe(2);
    expect((await run([fixture("good"), "--min", "abc"])).code).toBe(2);
    expect((await run([fixture("good"), "--min", "101"])).code).toBe(2);
    expect((await run([fixture("good"), "--nope"])).code).toBe(2);
  });

  it("fetches a URL", async () => {
    const spec = JSON.stringify({ openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {} });
    const fetcher = (async () => new Response(spec, { status: 200 })) as typeof fetch;
    const result = await run(["https://api.example.com/openapi.json"], { fetcher });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("The spec has no operations.");
  });

  it("says when a URL answers an error", async () => {
    const fetcher = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const result = await run(["https://api.example.com/openapi.json"], { fetcher });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe("https://api.example.com/openapi.json answered HTTP 404.");
  });

  it("prints help and versions", async () => {
    expect((await run(["--help"])).stdout).toContain("Usage: openapi-agent-check");
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect((await run(["--version"])).stdout).toBe(`openapi-agent-check ${version} (rules 1.0.4)`);
  });

  it("prints a badge with --badge", async () => {
    const result = await run([fixture("orders-thin"), "--badge"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("[![agent-ready](https://img.shields.io/badge/agent--ready-54%2F100-yellow)](https://latitude10.tech/agent-readiness)");
    expect((await run([fixture("good"), "--badge"])).stdout).toContain("-100%2F100-green)");
    expect((await run([fixture("orders-thin"), "--badge", "--min", "90"])).code).toBe(1);
  });
});

describe("the CLI's --fix", () => {
  const scratch = () => mkdtempSync(join(tmpdir(), "openapi-agent-check-"));
  const copy = (name: string, file = "openapi.json", as = file) => {
    const dir = scratch();
    copyFileSync(fixture(name, file), join(dir, as));
    return join(dir, as);
  };

  it("writes <name>.fixed.<ext> next to the input and prints both scores", async () => {
    const input = copy("orders-thin");
    const before = readFileSync(input, "utf8");
    const result = await run([input, "--fix"]);
    expect(result.code).toBe(0);
    const out = input.replace(/openapi\.json$/, "openapi.fixed.json");
    expect(result.stdout).toBe(`Agent readiness: 54/100 → 96/100, 4 operations changed.\nWrote ${out}`);
    expect(readFileSync(input, "utf8")).toBe(before);
    expect((await run([out])).stdout).toMatch(/^Agent readiness: 96\/100/);
  });

  it("writes YAML for YAML", async () => {
    const dir = scratch();
    const input = join(dir, "orders.yml");
    writeFileSync(input, `# Orders\n${readFileSync(fixture("orders-thin"), "utf8")}`); // JSON is YAML; the comment makes it read as YAML
    const result = await run([input, "--fix"]);
    expect(result.code).toBe(0);
    const out = readFileSync(join(dir, "orders.fixed.yml"), "utf8");
    expect(out.startsWith("# Orders")).toBe(true);
    expect(parseYaml(out).paths["/v1/orders"].post.operationId).toBe("createOrder");
  });

  it("overwrites the input with --write", async () => {
    const input = copy("orders-thin");
    const result = await run([input, "--fix", "--write"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Wrote ${input}`);
    expect(existsSync(input.replace(/openapi\.json$/, "openapi.fixed.json"))).toBe(false);
    expect((await run([input])).stdout).toMatch(/^Agent readiness: 96\/100/);
  });

  it("prints a JSON Patch with --patch that gives the same spec as --fix", async () => {
    const input = copy("orders-thin");
    const result = await run([input, "--fix", "--patch"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("Agent readiness: 54/100 → 96/100, 4 operations changed.");
    const patch = JSON.parse(result.stdout);
    expect(patch.length).toBeGreaterThan(0);
    expect(existsSync(input.replace(/openapi\.json$/, "openapi.fixed.json"))).toBe(false);
    await run([input, "--fix"]);
    const original = JSON.parse(readFileSync(input, "utf8"));
    const fixed = JSON.parse(readFileSync(input.replace(/openapi\.json$/, "openapi.fixed.json"), "utf8"));
    expect(applyPatch(original, patch)).toEqual(fixed);
  });

  it("writes a URL's fixed copy to the current directory", async () => {
    const cwd = scratch();
    const spec = readFileSync(fixture("orders-thin"), "utf8");
    const fetcher = (async () => new Response(spec, { status: 200 })) as typeof fetch;
    const result = await run(["https://api.example.com/v1/openapi.json?x=1", "--fix"], { fetcher, cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Wrote ${join(cwd, "openapi.fixed.json")}`);
    expect(JSON.parse(readFileSync(join(cwd, "openapi.fixed.json"), "utf8")).paths["/v1/orders"].post.operationId).toBe("createOrder");
  });

  it("says when there's nothing to fix, and writes nothing", async () => {
    const input = copy("yaml-input", "openapi.yaml");
    const result = await run([input, "--fix"]);
    expect(result).toEqual({ code: 0, stdout: "Agent readiness: 100/100, nothing to fix.", stderr: "" });
    expect(existsSync(input.replace(/openapi\.yaml$/, "openapi.fixed.yaml"))).toBe(false);
    expect((await run([input, "--fix", "--patch"])).stdout).toBe("[]");
  });

  it("exits 2 on flags that don't go together", async () => {
    const input = fixture("orders-thin");
    for (const args of [["--write"], ["--patch"], ["--fix", "--write", "--patch"], ["--fix", "--json"], ["--fix", "--badge"], ["--fix", "--min", "80"], ["--json", "--badge"]]) {
      const result = await run([input, ...args]);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stdout).toBe("");
    }
    expect((await run(["https://api.example.com/openapi.json", "--fix", "--write"])).stderr).toMatch(/not a URL/);
    expect((await run(["does-not-exist.json", "--fix"])).code).toBe(2);
  });
});
