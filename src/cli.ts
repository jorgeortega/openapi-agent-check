/**
 * openapi-agent-check <file|url> [--json | --quiet | --badge] [--min <score>] [--max <n>]
 * openapi-agent-check <file|url> --fix [--write | --patch]
 *
 * Exit codes: 0 the spec was scored (and met --min) or fixed, 1 the score is
 * below --min, 2 the spec couldn't be read or written, or the arguments are
 * wrong.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { RULES_VERSION, badge, check, fix, fixedText, formatReport, loadSpec } from "./index.js";

const USAGE = `Usage: openapi-agent-check <openapi.json|openapi.yaml|https://…> [options]

Scores how well AI agents will use your API, 0-100, over 13 rules.

Options:
  --json         print the full report as JSON
  --quiet        print only the score line
  --min <score>  exit with code 1 when the score is below <score> (for CI)
  --max <n>      findings to show per rule (default 5)
  --badge        print a Markdown badge for the score
  --fix          write the fixed spec to <name>.fixed.<ext> (rules only, no model)
  --fix --write  overwrite the input file with the fixed spec
  --fix --patch  print the fixes as a JSON Patch (RFC 6902) instead
  -v, --version  print the package and rules versions
  -h, --help     show this help`;

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  color?: boolean;
  fetcher?: typeof fetch;
  /** Where `--fix` writes the fixed copy of a spec read from a URL (default: the current directory). */
  cwd?: string;
  /** The environment, for `CI` (default: process.env). */
  env?: Record<string, string | undefined>;
}

/** The one line after a report that says what comes next. */
export const POINTER_LINE = "Serve this API to agents: npx openapi-agentify init";

/** True when CI is set to anything but "", "0" or "false" (GitHub Actions, GitLab and most others set CI=true). */
export function inCi(env: Record<string, string | undefined>): boolean {
  const value = (env.CI ?? "").trim().toLowerCase();
  return value !== "" && value !== "0" && value !== "false";
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

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const isUrl = (input: string) => /^https?:\/\//i.test(input);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Where `--fix` writes: `<name>.fixed.<ext>` next to a file, or in `cwd` for a URL. */
export function fixedPath(input: string, isJson: boolean, cwd = process.cwd()): string {
  let dir: string;
  let file: string;
  if (isUrl(input)) {
    dir = cwd;
    const last = new URL(input).pathname.split("/").filter(Boolean).pop() ?? "";
    file = last.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "") || "openapi";
  } else {
    dir = dirname(input);
    file = basename(input);
  }
  const ext = extname(file);
  const keep = /^\.(json|ya?ml)$/i.test(ext);
  const stem = keep ? file.slice(0, -ext.length) : file;
  return join(dir, `${stem}.fixed${keep ? ext : isJson ? ".json" : ".yaml"}`);
}

async function runFix(input: string, mode: { write: boolean; patch: boolean }, opts: RunOptions): Promise<CliResult> {
  const loaded = await loadSpec(input, opts.fetcher);
  if (loaded.error) return { code: 2, stdout: "", stderr: loaded.error };
  const result = fix(loaded.doc!);
  const scores = `Agent readiness: ${result.scoreBefore}/100 → ${result.scoreAfter}/100, ${plural(result.operations, "operation")} changed.`;
  if (mode.patch) return { code: 0, stdout: JSON.stringify(result.patch, null, 2), stderr: scores };
  if (result.patch.length === 0) return { code: 0, stdout: `Agent readiness: ${result.scoreBefore}/100, nothing to fix.`, stderr: "" };
  const out = mode.write ? input : fixedPath(input, loaded.text!.trim().startsWith("{"), opts.cwd);
  try {
    writeFileSync(out, fixedText(loaded.text!, result.fixed, result.patch));
  } catch (error) {
    return { code: 2, stdout: "", stderr: `Couldn't write ${out}: ${(error as Error).message}` };
  }
  return { code: 0, stdout: `${scores}\nWrote ${out}`, stderr: "" };
}

export async function run(argv: string[], opts: RunOptions = {}): Promise<CliResult> {
  const args = [...argv];
  if (args.includes("-h") || args.includes("--help")) return { code: 0, stdout: USAGE, stderr: "" };
  if (args.includes("-v") || args.includes("--version")) {
    return { code: 0, stdout: `openapi-agent-check ${packageVersion()} (rules ${RULES_VERSION})`, stderr: "" };
  }
  const json = flag(args, "--json");
  const quiet = flag(args, "--quiet");
  const showBadge = flag(args, "--badge");
  const doFix = flag(args, "--fix");
  const write = flag(args, "--write");
  const patch = flag(args, "--patch");
  const min = intOption(args, "--min");
  const max = intOption(args, "--max");
  if (min === null || (min !== undefined && min > 100)) return { code: 2, stdout: "", stderr: "--min takes a score from 0 to 100." };
  if (max === null) return { code: 2, stdout: "", stderr: "--max takes a whole number." };
  const unknown = args.find((a) => a.startsWith("-"));
  if (unknown) return { code: 2, stdout: "", stderr: `Unknown option ${unknown}.\n\n${USAGE}` };
  if (args.length !== 1) return { code: 2, stdout: "", stderr: USAGE };
  if ((write || patch) && !doFix) return { code: 2, stdout: "", stderr: `${write ? "--write" : "--patch"} only goes with --fix.` };
  if (doFix && (json || quiet || showBadge || min !== undefined || max !== undefined)) {
    return { code: 2, stdout: "", stderr: "--fix doesn't combine with --json, --quiet, --badge, --min or --max: fix first, then check the fixed spec." };
  }
  if (write && patch) return { code: 2, stdout: "", stderr: "Choose one of --write and --patch." };
  if (write && isUrl(args[0]!)) return { code: 2, stdout: "", stderr: "--write overwrites a local file, not a URL. Use --fix alone to write a fixed copy here." };
  if ([json, quiet, showBadge].filter(Boolean).length > 1) return { code: 2, stdout: "", stderr: "Choose one of --json, --quiet and --badge." };

  if (doFix) return runFix(args[0]!, { write, patch }, opts);

  const result = await check(args[0]!, { fetcher: opts.fetcher });
  if (result.error) return { code: 2, stdout: "", stderr: result.error };
  const report = result.report!;
  const below = min !== undefined && report.score < min;
  const pointer = inCi(opts.env ?? process.env) ? "" : `\n\n${POINTER_LINE}`;
  const stdout = json
    ? JSON.stringify({ source: result.source, rulesVersion: RULES_VERSION, ...report }, null, 2)
    : showBadge
      ? badge(report.score)
      : quiet
        ? `Agent readiness: ${report.score}/100`
        : formatReport(report, { color: opts.color, max }) + pointer;
  const stderr = below ? `Score ${report.score} is below the minimum of ${min}.` : "";
  return { code: below ? 1 : 0, stdout, stderr };
}
