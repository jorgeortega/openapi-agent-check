# Conformance fixtures

Each folder in `cases/` is one OpenAPI document and the exact report the
rules must produce for it.

- `case.json`: which file is the spec (`spec`), an optional Agentify tool
  list (`tools`, always `null` here), and the options passed to `readiness()`
  (`authMode`, `baseUrl`; the defaults are `passthrough` and none).
- `expected.json`: `JSON.stringify` of the report.

`manifest.json` lists the cases, the rules version they pin, and a SHA-256
of every file under `cases/`. To hash, take each file at any depth, skip
dotfiles, and name it by its path from `cases/` with `/` separators. Sort
the names as plain strings. For each file, hash its name, a NUL byte, its
bytes, and another NUL byte. The manifest stores the lowercase hex digest.
The hash stops anyone from editing an `expected.json` to make a failing port
pass.

A port of the rules to another language conforms when it produces every
`expected.json` exactly.
