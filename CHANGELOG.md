# Changelog

## 1.2.0 (2026-10-29)

- **Rules 1.0.4.** A `$ref`'s pointer segments are percent-decoded before
  `~1` and `~0` are unescaped (RFC 6901 §6), so `#/paths/~1orders~1%7Bid%7D`
  resolves; a `$ref` that leads nowhere counts as no example instead of
  failing. Scores move only for specs with percent-encoded or dangling
  `$ref`s. Two new conformance cases (26 in all): `percent-encoded-refs` and
  `dangling-ref`. The hosted check and the Agentify kits already run 1.0.4.
- **A live badge.** `--badge` with an https spec URL prints a shields.io
  endpoint badge that follows the spec, linked to the free check page for that
  URL. A file keeps the static badge. Library: `liveBadge(specUrl)`.
- **A Spectral ruleset**, `openapi-agent-check/spectral`: the 13 rules as
  `agent-ready-<rule>`, with the CLI's findings at their operation or
  parameter; rules weighted 8 or more are errors, the rest warnings.
  `@stoplight/spectral-core` is an optional peer dependency.
- **A GitHub Action** (`uses: jorgeortega/openapi-agent-check@v1`): scores
  the spec, comments the score, its change against the base branch and the
  top three findings on pull requests (one comment, updated), fails under
  `min-score`, and can write the fixed spec (`suggest-fixes`).
- `--quiet` prints only the score line.
- After a report, one line says what comes next (`npx openapi-agentify
  init`). It's left out with `--json`, `--quiet`, `--badge` and in CI.
- CONTRIBUTING.md, issue and pull request templates.

## 1.1.0 (2026-10-29)

- `--fix` writes the rules-only fixes into `<name>.fixed.<ext>`, in the
  input's format: operationIds, summaries, descriptions, parameter
  descriptions, examples and an `Idempotency-Key` header on writes. Free,
  local, no model. `--fix --write` overwrites the input; `--fix --patch`
  prints an RFC 6902 JSON Patch instead. It prints the score before and
  after.
- `--badge` prints a Markdown shields.io badge for the score.
- Library: `fix(doc)` returns `{ scoreBefore, scoreAfter, operations, patch,
  fixed }`; also `fixedText`, `applyPatch`, `jsonPatch`, `badge`.
- Scores are unchanged: the rules version stays 1.0.3.

## 1.0.0 (2026-10-10)

First public release.

- `openapi-agent-check <file|url>`: the 0-100 agent-readiness score over 13
  rules (rules version 1.0.3), with findings and a fix per rule.
- `--json`, `--min` for CI, `--max`.
- Library: `check`, `readiness`, `formatReport`, `loadSpec`, `parseSpecText`.
- 24 conformance fixtures with a SHA-256 manifest.
