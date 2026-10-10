import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

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
    expect(report.rulesVersion).toBe("1.0.3");
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
    expect((await run(["--version"])).stdout).toMatch(/^openapi-agent-check 1\.0\.0 \(rules 1\.0\.3\)$/);
  });
});
