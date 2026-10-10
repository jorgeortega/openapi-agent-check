import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES_VERSION, parseSpecText, readiness } from "../src/index.js";

// Every case scores exactly as written down in expected.json. A failure is a
// change in the rules: fix the code, or bump the rules version and regenerate
// the fixtures on purpose. Never edit an expected.json to make a test pass.
const DIR = new URL("./fixtures/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, DIR), "utf8");
const json = (path: string) => JSON.parse(read(path));
const serialised = (value: unknown) => JSON.parse(JSON.stringify(value));
const fixtures: { rulesVersion: string; cases: string[]; sha256: string } = json("manifest.json");

function caseFiles(folder = ""): string[] {
  return readdirSync(new URL(folder ? `cases/${folder}/` : "cases/", DIR), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .flatMap((entry) => {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      return entry.isDirectory() ? caseFiles(path) : [path];
    })
    .sort();
}

describe("conformance fixtures", () => {
  it("has a folder for each case in the manifest, and no other", () => {
    const folders = readdirSync(new URL("cases/", DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders).toEqual(fixtures.cases);
  });

  it("are unedited: the manifest's sha256 matches", () => {
    const hash = createHash("sha256");
    for (const path of caseFiles()) {
      hash.update(path);
      hash.update("\0");
      hash.update(readFileSync(new URL(`cases/${path}`, DIR)));
      hash.update("\0");
    }
    expect(hash.digest("hex")).toBe(fixtures.sha256);
  });

  it("pin the rules version the package reports", () => {
    expect(fixtures.rulesVersion).toBe(RULES_VERSION);
  });

  for (const name of fixtures.cases) {
    it(`scores ${name} as expected`, () => {
      const options = json(`cases/${name}/case.json`);
      const spec = parseSpecText(read(`cases/${name}/${options.spec}`));
      expect(spec.error).toBeUndefined();
      const report = readiness(spec.doc!, { manifest: null, authMode: options.authMode ?? "passthrough", baseUrl: options.baseUrl, serviceCredential: false });
      expect(serialised(report)).toEqual(json(`cases/${name}/expected.json`));
    });
  }
});
