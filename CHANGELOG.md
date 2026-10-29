# Changelog

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
