import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSpecText, readiness, RULES_VERSION } from "../src/index.js";
// A plain .mjs script with no types: it runs in the Action with no build step.
import { MARKER, findMarked, formatComment, parseMinScore, scoreChange, topFindings } from "../scripts/action-comment.mjs";

const report = (name: string) => {
  const doc = parseSpecText(readFileSync(new URL(`./fixtures/cases/${name}/openapi.json`, import.meta.url), "utf8")).doc!;
  return { rulesVersion: RULES_VERSION, ...readiness(doc, { manifest: null, authMode: "passthrough" }) };
};

describe("the Action's comment", () => {
  it("starts with the hidden marker, and finds only its own comment by it", () => {
    const body = formatComment({ head: report("good"), spec: "openapi.json", version: "1.2.0" });
    expect(body.startsWith(`${MARKER}\n`)).toBe(true);
    const comments = [
      { id: 1, body: "LGTM" },
      { id: 2, body: `Quoting the bot: ${MARKER}` },
      { id: 3, body },
      { id: 4, body: null },
    ];
    expect(findMarked(comments)?.id).toBe(3);
    expect(findMarked([{ id: 1, body: "nothing here" }])).toBeUndefined();
  });

  it("shows the score and its change against the base branch", () => {
    expect(scoreChange(80, 75)).toBe("+5");
    expect(scoreChange(70, 75)).toBe("−5");
    expect(scoreChange(75, 75)).toBe("±0");
    expect(scoreChange(75, undefined)).toBeNull();
    const head = report("orders-thin");
    const body = formatComment({ head, base: { ...head, score: 60 }, baseRef: "main", spec: "openapi.json", version: "1.2.0" });
    expect(body).toContain(`### Agent readiness: ${head.score}/100`);
    expect(body).toContain(`−${60 - head.score} against \`main\` (60/100).`);
    expect(formatComment({ head, baseRef: "main", spec: "openapi.json" })).toContain("No score on `main`");
  });

  it("lists the top three findings, one per costly rule first", () => {
    const head = report("orders-thin");
    const top = topFindings(head);
    expect(top).toHaveLength(3);
    expect(new Set(top.map((t: { rule: { id: string } }) => t.rule.id)).size).toBe(3);
    const body = formatComment({ head, spec: "openapi.json", version: "1.2.0" });
    expect(body.match(/^\| (?!Rule|---)/gm)).toHaveLength(3);
    expect(body).toMatch(/And \d+ more/);
    expect(topFindings(report("good"))).toEqual([]);
    expect(formatComment({ head: report("good"), spec: "openapi.json" })).toContain("every rule passes");
  });

  it("says whether the score meets min-score", () => {
    const head = report("orders-thin");
    expect(formatComment({ head, spec: "x", minScore: 90 })).toContain("**Below the minimum of 90.**");
    expect(formatComment({ head, spec: "x", minScore: 10 })).toContain("Meets the minimum of 10.");
    expect(parseMinScore("")).toBeUndefined();
    expect(parseMinScore(undefined)).toBeUndefined();
    expect(parseMinScore("80")).toBe(80);
    expect(() => parseMinScore("eighty")).toThrow(/min-score/);
    expect(() => parseMinScore("101")).toThrow(/min-score/);
  });

  it("says how to apply the fixes when suggest-fixes wrote them", () => {
    const body = formatComment({ head: report("orders-thin"), spec: "api/openapi.json", fixed: "api/openapi.fixed.json", version: "1.2.0" });
    expect(body).toContain("`api/openapi.fixed.json`");
    expect(body).toContain("`npx openapi-agent-check@1.2.0 api/openapi.json --fix --write`");
  });

  it("keeps a table cell in one piece", () => {
    const head = report("orders-thin");
    head.rules[0]!.findings = [{ rule: head.rules[0]!.id, where: "GET /a|b", message: "line one\nline two | more" }];
    head.rules[0]!.share = 0;
    const body = formatComment({ head, spec: "x" });
    expect(body).toContain("line one line two \\| more");
    expect(body).toContain("`GET /a\\|b`");
  });
});
