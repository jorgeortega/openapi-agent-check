/**
 * openapi-agent-check <file|url> [--json] [--min <score>] [--max <n>]
 *
 * Exit codes: 0 the spec was scored (and met --min), 1 the score is below
 * --min, 2 the spec couldn't be read or the arguments are wrong.
 */
import { readFileSync } from "node:fs";
import { RULES_VERSION, check, formatReport } from "./index.js";

const USAGE = `Usage: openapi-agent-check <openapi.json|openapi.yaml|https://…> [options]

Scores how well AI agents will use your API, 0-100, over 13 rules.

Options:
  --json         print the full report as JSON
  --min <score>  exit with code 1 when the score is below <score> (for CI)
  --max <n>      findings to show per rule (default 5)
  -v, --version  print the package and rules versions
  -h, --help     show this help`;

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function packageVersion(): string {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
}

function intOption(args: string[], name: string): number | undefined | null {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = Number(args[i + 1]);
  args.splice(i, 2);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export async function run(argv: string[], opts: { color?: boolean; fetcher?: typeof fetch } = {}): Promise<CliResult> {
  const args = [...argv];
  if (args.includes("-h") || args.includes("--help")) return { code: 0, stdout: USAGE, stderr: "" };
  if (args.includes("-v") || args.includes("--version")) {
    return { code: 0, stdout: `openapi-agent-check ${packageVersion()} (rules ${RULES_VERSION})`, stderr: "" };
  }
  const json = args.includes("--json");
  if (json) args.splice(args.indexOf("--json"), 1);
  const min = intOption(args, "--min");
  const max = intOption(args, "--max");
  if (min === null || (min !== undefined && min > 100)) return { code: 2, stdout: "", stderr: "--min takes a score from 0 to 100." };
  if (max === null) return { code: 2, stdout: "", stderr: "--max takes a whole number." };
  const unknown = args.find((a) => a.startsWith("-"));
  if (unknown) return { code: 2, stdout: "", stderr: `Unknown option ${unknown}.\n\n${USAGE}` };
  if (args.length !== 1) return { code: 2, stdout: "", stderr: USAGE };

  const result = await check(args[0], { fetcher: opts.fetcher });
  if (result.error) return { code: 2, stdout: "", stderr: result.error };
  const report = result.report!;
  const below = min !== undefined && report.score < min;
  const stdout = json
    ? JSON.stringify({ source: result.source, rulesVersion: RULES_VERSION, ...report }, null, 2)
    : formatReport(report, { color: opts.color, max });
  const stderr = below ? `Score ${report.score} is below the minimum of ${min}.` : "";
  return { code: below ? 1 : 0, stdout, stderr };
}
