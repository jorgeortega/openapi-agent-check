import { describe, expect, it } from "vitest";
import { parseSpecText, specProblem } from "../src/index.js";

describe("reading a spec", () => {
  it("parses JSON and YAML", () => {
    expect(parseSpecText('{"openapi":"3.1.0"}').doc).toEqual({ openapi: "3.1.0" });
    expect(parseSpecText("openapi: 3.0.3\n").doc).toEqual({ openapi: "3.0.3" });
  });

  it("says what is wrong with the text", () => {
    expect(parseSpecText("  ").error).toBe("The spec is empty.");
    expect(parseSpecText("{nope").error).toMatch(/^The spec isn't valid JSON/);
    expect(parseSpecText("- a\n- b").error).toMatch(/expected a JSON or YAML object/);
  });

  it("accepts OpenAPI 3.0 and 3.1 only", () => {
    expect(specProblem({ openapi: "3.1.0", info: {}, paths: {} })).toBeNull();
    expect(specProblem({ swagger: "2.0", info: {}, paths: {} })).toBeTypeOf("string");
  });
});
