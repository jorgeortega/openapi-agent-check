# Good first issues (drafts)

Three issues for the maintainers to open with the `good first issue` label.
Each is scoped so a newcomer can finish it without knowing the rest of the
code base.

---

## A rule for `deprecated` operations

**Labels:** `good first issue`, `rules`

Agents call whatever the spec offers. An operation marked `deprecated: true`
still shows up as a tool, and nothing tells the model to prefer its
replacement, so agents keep calling endpoints you're trying to retire.

**Proposal.** A new rule, `deprecations`: every deprecated operation says in
its description what to use instead (it names another operation's
operationId or path). It applies only to operations with `deprecated: true`,
so specs without deprecations aren't affected.

- Finding: `GET /v1/orders/legacy: deprecated, but doesn't say what replaces it`
- Fix line: `Say in the description which operation replaces it (use listOrders instead).`
- Suggested weight: 4.

**Where to start.** `src/rules.ts` (a rule is one `rule(...)` call), a new
fixture folder `test/fixtures/cases/rule-deprecations/`, and the Spectral
ruleset picks it up on its own. Because this is a new rule, it's a new rules
version: read "The rules version and the conformance fixtures" and "Where
rule changes start" in CONTRIBUTING.md first, and agree the weight in the
issue before writing code.

**Done when** the rule, its fixture, the README's rules table and a CHANGELOG
line are in, and every other fixture's score is unchanged or regenerated on
purpose.

---

## Read AsyncAPI documents

**Labels:** `good first issue`, `enhancement`

Event-driven APIs are described with AsyncAPI, not OpenAPI, and agents use
them too (an MCP tool that publishes a message is a tool call like any
other). Today `openapi-agent-check asyncapi.yaml` says the document isn't
OpenAPI.

**Proposal.** Recognise AsyncAPI 3.0 documents (`asyncapi: "3.0.0"`) and
score the parts the existing rules make sense for: each `operation` with
`action: send` as one operation, its `summary` and `description`, its
message payload's schema and examples, and `components.securitySchemes`.
Rules that don't apply (pagination, JSON request bodies, idempotency) count
as not applicable, the way `json-bodies` does for operations without a body.
Say in the report that it's an AsyncAPI document.

**Where to start.** `src/spec.ts` (`specProblem` is where a non-OpenAPI
document is turned away) and `src/rules.ts` (`operations()` lists what the
rules score). A good first pull request can be the smallest slice: recognise
the document and score summaries and descriptions only, with one fixture.

**Done when** an AsyncAPI fixture scores as expected and OpenAPI scores are
unchanged.

---

## An editor extension

**Labels:** `good first issue`, `help wanted`

Findings are most useful while you're writing the spec. The package already
runs anywhere Node does, and each finding has a location.

**Proposal.** A small VS Code extension (in its own folder or repository)
that runs `readiness()` from this package on the open `openapi.json` or
`openapi.yaml` on save, and shows each finding as a diagnostic on the
operation or parameter it's about, with the score in the status bar.

**Where to start.** `wherePath()` in `src/spectral.ts` already turns a
finding's `where` into a JSON path; the `yaml` package's `parseDocument`
gives the line and column for a path. The VS Code
[diagnostics sample](https://github.com/microsoft/vscode-extension-samples/tree/main/diagnostic-related-information-sample)
is a good skeleton. Users of the Spectral VS Code extension can already get
the findings through `extends: [openapi-agent-check/spectral]`; say so in
the extension's README.

**Done when** the extension shows the findings for the `orders-thin` fixture
on the right lines, with a short README and a screenshot.
