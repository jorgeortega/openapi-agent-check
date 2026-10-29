#!/usr/bin/env node
/**
 * The GitHub Action's last step: writes the job summary, posts or updates the one pull request
 * comment, and fails under `min-score`. No dependencies: Node's own fetch and the GitHub REST API,
 * with the workflow's GITHUB_TOKEN. Nothing is sent anywhere else.
 *
 * Reads (all set by action.yml):
 *   OAC_HEAD_JSON   the `--json` report of the spec in this commit
 *   OAC_BASE_JSON   the `--json` report of the spec on the base branch (may be missing)
 *   OAC_BASE_REF    the base branch's name
 *   OAC_SPEC        the spec's path or URL, as given
 *   OAC_MIN_SCORE   fail under this score ("" for report only)
 *   OAC_COMMENT     "true" to comment on pull requests
 *   OAC_FIXED       the path --fix wrote, when suggest-fixes is on
 *   OAC_VERSION     the openapi-agent-check version that ran
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Marks the action's comment, so a rerun updates it instead of adding another. */
export const MARKER = "<!-- openapi-agent-check -->";

/** Points a rule loses: what fixing all of it would win back, before rounding. */
const lost = (rule) => rule.weight * (1 - rule.share);

/**
 * The findings worth fixing first: one from each rule, the rules that cost the most points first
 * (the earlier rule on a tie), then a second from each, and so on.
 */
export function topFindings(report, n = 3) {
  const rules = report.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.share < 1 && rule.findings.length > 0)
    .sort((a, b) => lost(b.rule) - lost(a.rule) || a.index - b.index)
    .map(({ rule }) => rule);
  const out = [];
  for (let i = 0; out.length < n && rules.some((rule) => i < rule.findings.length); i++) {
    for (const rule of rules) if (i < rule.findings.length && out.length < n) out.push({ rule, finding: rule.findings[i] });
  }
  return out;
}

/** "+5", "−3" or "±0" against the base branch, or null without one. */
export function scoreChange(head, base) {
  if (typeof base !== "number") return null;
  const d = head - base;
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0";
}

const code = (s) => "`" + String(s).replace(/`/g, "'") + "`";
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** The comment's Markdown (also the job summary). */
export function formatComment({ head, base, baseRef, spec, minScore, fixed, version }) {
  const change = scoreChange(head.score, base?.score);
  const lines = [MARKER, `### Agent readiness: ${head.score}/100`, ""];
  if (change !== null) lines.push(`${change} against ${code(baseRef || "the base branch")} (${base.score}/100).`, "");
  else if (baseRef) lines.push(`No score on ${code(baseRef)}: the spec isn't there, or couldn't be read.`, "");
  if (typeof minScore === "number") {
    lines.push(head.score >= minScore ? `Meets the minimum of ${minScore}.` : `**Below the minimum of ${minScore}.**`, "");
  }
  const top = topFindings(head);
  if (top.length) {
    lines.push("| Rule | Where | Finding |", "|---|---|---|");
    for (const { rule, finding } of top) lines.push(`| ${cell(rule.title)} | ${cell(code(finding.where))} | ${cell(finding.message)} |`);
    const total = head.rules.reduce((n, rule) => n + rule.findings.length, 0);
    if (total > top.length) lines.push("", `And ${total - top.length} more: run ${code(`npx openapi-agent-check ${spec}`)} to see them all.`);
  } else lines.push("Nothing to fix: every rule passes.");
  lines.push("");
  if (fixed) {
    lines.push(
      `The rules-only fixes are written to ${code(fixed)} in this job's workspace.`,
      `To apply them, run ${code(`npx openapi-agent-check@${version} ${spec} --fix --write`)} and commit the result.`,
      "",
    );
  } else if (top.length) {
    lines.push(`Fix what the rules can with ${code(`npx openapi-agent-check ${spec} --fix`)}.`, "");
  }
  lines.push(`<sub>[openapi-agent-check](https://github.com/jorgeortega/openapi-agent-check) ${version ?? ""}, rules ${head.rulesVersion ?? ""}</sub>`);
  return lines.join("\n");
}

/** The action's own comment among a page of issue comments, or undefined. */
export function findMarked(comments) {
  return comments.find((c) => typeof c?.body === "string" && c.body.startsWith(MARKER));
}

/** "" or a missing value is report-only; otherwise a whole score from 0 to 100, or an error. */
export function parseMinScore(value) {
  if (value === undefined || String(value).trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`min-score takes a whole score from 0 to 100, not "${value}".`);
  return n;
}

async function github(method, path, body) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Updates the marked comment on the pull request, or creates it. */
async function upsertComment(repo, number, body) {
  for (let page = 1; page <= 30; page++) {
    const comments = await github("GET", `/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
    const mine = findMarked(comments);
    if (mine) {
      await github("PATCH", `/repos/${repo}/issues/comments/${mine.id}`, { body });
      return "updated";
    }
    if (comments.length < 100) break;
  }
  await github("POST", `/repos/${repo}/issues/${number}/comments`, { body });
  return "created";
}

const readJson = (path) => (path && existsSync(path) && readFileSync(path, "utf8").trim() ? JSON.parse(readFileSync(path, "utf8")) : undefined);

async function main(env = process.env) {
  const head = readJson(env.OAC_HEAD_JSON);
  if (!head) throw new Error("No report for the spec: the check step didn't produce one.");
  const minScore = parseMinScore(env.OAC_MIN_SCORE);
  const body = formatComment({
    head,
    base: readJson(env.OAC_BASE_JSON),
    baseRef: env.OAC_BASE_REF,
    spec: env.OAC_SPEC,
    minScore,
    fixed: env.OAC_FIXED || undefined,
    version: env.OAC_VERSION,
  });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${body}\n`);

  const event = env.GITHUB_EVENT_PATH && existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")) : {};
  const number = event.pull_request?.number;
  if (env.OAC_COMMENT === "true" && number && env.GITHUB_REPOSITORY) {
    try {
      console.log(`Comment ${await upsertComment(env.GITHUB_REPOSITORY, number, body)} on #${number}.`);
    } catch (error) {
      // A pull request from a fork gets a read-only token: report, don't fail the check over it.
      console.log(`::warning::Couldn't comment on the pull request (it needs permissions: pull-requests: write): ${error.message}`);
    }
  }
  console.log(`Agent readiness: ${head.score}/100`);
  if (minScore !== undefined && head.score < minScore) {
    console.log(`::error::Agent readiness ${head.score}/100 is below the minimum of ${minScore}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
