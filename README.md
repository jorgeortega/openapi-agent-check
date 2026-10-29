# openapi-agent-check

How well will AI agents use your API? `openapi-agent-check` reads your
OpenAPI 3.0 or 3.1 spec and scores it from 0 to 100 against 13 rules. Each
rule covers something a model gets wrong when the spec leaves it out, such as
a missing operationId, a vague description or an undocumented error.

```sh
npx openapi-agent-check ./openapi.json
npx openapi-agent-check https://api.example.com/openapi.yaml
```

```
Agent readiness: 54/100 (5 operations)

✖ Every operation has a clear operationId 3/5 · weight 10
    fix: Give each operation an operationId that says what it does (listOrders, refundOrder). It becomes the tool name.
    - POST /v1/orders: no operationId
    - GET /v1/orders/{id}: operationId "get2" is ambiguous
✔ Request bodies are JSON 2/2 · weight 5
…
```

The check is useful whenever agents will call your API: as tools in an MCP
server, through function calling, or from a marketplace such as AWS AgentCore
Gateway. The checker runs locally, needs no account and sends nothing
anywhere. The only network request it makes is to fetch the spec, when you
give it a URL.

## Fix it

`--fix` writes the fixes into a copy of your spec. It's free, runs locally and
calls no model: the fixes come from the same rules as the score.

```sh
npx openapi-agent-check openapi.yaml --fix            # writes openapi.fixed.yaml
npx openapi-agent-check openapi.yaml --fix --write    # overwrites openapi.yaml
npx openapi-agent-check openapi.yaml --fix --patch    # prints a JSON Patch (RFC 6902)
```

```
$ npx openapi-agent-check openapi.json --fix
Agent readiness: 54/100 → 96/100, 4 operations changed.
Wrote openapi.fixed.json
```

For each operation, `--fix` adds what the rules found missing, and leaves
alone what you wrote:

- an operationId made from the method and path (`GET /v1/orders` → `listOrders`);
- a summary and a description (`Lists orders, filtered and paged with status,
  limit, cursor. Use it to find orders before acting on one.`);
- parameter descriptions, with the allowed values when the schema lists them;
- an example made from the schemas, as `x-agentify-examples`;
- an `Idempotency-Key` header on POST and PATCH.

It can't invent what only you know: error responses, pagination, response
schemas or your auth. Those stay as findings, each with its one-line fix.
Read the generated text before you publish it; it's a starting point.

The fixed spec is in the same format as the input. JSON keeps its indent.
YAML keeps its key order, and comments are kept where possible, but some may
be lost; use `--patch` if you'd rather apply the changes yourself. With a URL,
`--fix` writes the fixed copy to the current directory.

## The rules

| Rule | Weight | What passes |
|---|---:|---|
| `operation-ids` | 10 | Every operation has a clear operationId (it becomes the tool name) |
| `summaries` | 8 | Every operation has a summary, under 80 characters |
| `descriptions` | 10 | Each description is at least 40 characters, and no two are the same |
| `parameter-descriptions` | 8 | Every parameter is described |
| `enums` | 4 | Parameters that take a fixed set of values (status, sort, type…) list them |
| `examples` | 6 | Every operation has a parameter, request or response example |
| `json-bodies` | 5 | Request bodies accept `application/json` |
| `response-schemas` | 8 | 2xx responses have a JSON schema |
| `error-responses` | 6 | Error responses (400, 404, 409…) are documented |
| `pagination` | 6 | List operations take a limit and a cursor or page |
| `security` | 8 | Auth is described in `components.securitySchemes` and applied |
| `idempotency` | 5 | POST and PATCH accept an `Idempotency-Key` header |
| `tool-count` | 4 | About 40 tools at most, with distinct names |

**How the score works.** Each rule scores the share of operations (or
parameters) that pass it:

```
score = Σ (weight × passing share) / Σ weight × 100
```

So one bad operation in fifty costs little, and a spec with no descriptions
at all costs a lot.

## Options

| Option | |
|---|---|
| `--json` | Print the full report as JSON: every rule, every finding |
| `--quiet` | Print only the score line, `Agent readiness: 87/100` |
| `--min <score>` | Exit with code 1 if the score is below `<score>` |
| `--max <n>` | Show up to `n` findings per rule (default 5) |
| `--badge` | Print a Markdown badge: live for an https URL, static for a file |
| `--fix` | Write the fixed spec to `<name>.fixed.<ext>` |
| `--fix --write` | Overwrite the input file with the fixed spec |
| `--fix --patch` | Print the fixes as a JSON Patch instead |
| `--version` | Print the package version and the rules version |

Exit codes:

- `0`: the spec was scored and met `--min`, or fixed.
- `1`: the score is below `--min`.
- `2`: the spec couldn't be read or written, or the arguments are wrong.

After the report, the CLI prints one line on what comes next:
`Serve this API to agents: npx openapi-agentify init`. It's left out with
`--json`, `--quiet` and `--badge`, and in CI (when `CI` is set, as GitHub
Actions and most CI services do).

### In CI

```yaml
- run: npx openapi-agent-check openapi.yaml --min 80
```

## Badge

`--badge` prints a Markdown badge for your README. Which one depends on
where the spec is.

**A spec at a public https URL gets the live badge.** It follows the spec:
shields.io asks latitude10.tech for the score, which scores the spec with
these same rules and keeps the result for a day. It links to a free page
with the score and each rule's findings for that URL.

```sh
npx openapi-agent-check https://api.example.com/openapi.json --badge
```

```md
[![agent-ready](https://img.shields.io/endpoint?url=https%3A%2F%2Flatitude10.tech%2Fapi%2Freadiness%2Fbadge%3Furl%3Dhttps%253A%252F%252Fapi.example.com%252Fopenapi.json)](https://latitude10.tech/agent-readiness/check?url=https%3A%2F%2Fapi.example.com%2Fopenapi.json)
```

**A file gets a static badge** with today's score. Nothing is fetched to
show it, and nothing about your spec leaves your machine; rerun the command
(in CI, say) when the score changes.

```sh
npx openapi-agent-check openapi.yaml --badge
```

```md
[![agent-ready](https://img.shields.io/badge/agent--ready-87%2F100-green)](https://latitude10.tech/agent-readiness)
```

Both are green at 80 or more, yellow from 50 to 79 and red below 50.

## With Spectral

If you already lint your spec with [Spectral](https://github.com/stoplightio/spectral),
add the rules to your `.spectral.yaml`:

```sh
npm install --save-dev openapi-agent-check
```

```yaml
extends:
  - spectral:oas
  - openapi-agent-check/spectral
```

```
$ npx spectral lint openapi.json
 61:14    error  agent-ready-operation-ids    POST /v1/orders: no operationId        paths./v1/orders.post
 61:14  warning  agent-ready-idempotency      POST /v1/orders: no Idempotency-Key    paths./v1/orders.post
```

Each of the 13 rules is a Spectral rule named `agent-ready-<rule>`, running
the same code as the CLI, so Spectral finds exactly what the CLI finds, each
at the operation or parameter it's about. The rules weighted 8 or more
(`operation-ids`, `descriptions`, `summaries`, `parameter-descriptions`,
`response-schemas`, `security`) are errors; the rest are warnings. Change a
rule's severity in your `.spectral.yaml` as with any other ruleset:

```yaml
rules:
  agent-ready-idempotency: off
```

Spectral reports findings, not the 0-100 score; run the CLI for that.
`@stoplight/spectral-core` is an optional peer dependency: the CLI doesn't
need it.

## As a library

```ts
import { check, fix, readiness, parseSpecText } from "openapi-agent-check";

const { report, error } = await check("https://api.example.com/openapi.json");
if (report) console.log(report.score, report.rules.filter((r) => r.share < 1));

// Or with a document you already have:
const { doc } = parseSpecText(yamlOrJsonText);
const result = readiness(doc!);

// The rules-only fixes, as the fixed document and as a JSON Patch:
const { scoreBefore, scoreAfter, patch, fixed } = fix(doc!);
```

`report` contains `score`, `operations`, `rules` and `warnings`. Each rule has
an `id`, `title`, `weight`, `applicable`, `passing`, `share`, `fix` and its
`findings`. Each finding has a `where` (`"METHOD /path"` or a parameter) and a
`message`. `fix` also returns `operations`, the number of operations it
changed; `badge(score)` returns the static badge's Markdown and
`liveBadge(specUrl)` the live one.

## Conformance fixtures

The rules version is `1.0.4`. Scores only change when the rules version
changes. `test/fixtures/` holds 26 OpenAPI documents with the exact report
each one must produce, plus a SHA-256 manifest so nobody can quietly edit
them. If you port the rules to another language, your port conforms when it
reproduces every `expected.json`. See [test/fixtures/README.md](test/fixtures/README.md).

The same rules power:

- the free hosted check at
  [latitude10.tech/agent-readiness](https://latitude10.tech/agent-readiness),
- its MCP server at `https://latitude10.tech/mcp/readiness`,
- the `agentify check` command in the Agentify API kits.

### `x-agentify` extensions

The check honours the optional `x-agentify` and `x-agentify-examples`
extensions on operations, and an Agentify tool list (`agentify.tools.json`,
the `manifest` option). This keeps its score identical to the Agentify kits'.
Plain OpenAPI specs need neither.

## Who maintains it

[Latitude 10](https://latitude10.tech) maintains this package. The same
rules and fixes run in the hosted check at
[latitude10.tech/agent-readiness](https://latitude10.tech/agent-readiness)
and in the [Agentify API](https://latitude10.tech/products/agentify-api) kit.

## Contributing

Issues and pull requests are welcome. To change what a rule scores, update
its fixtures and bump the rules version in the same pull request.

```sh
npm install
npm test
npm run build
```

## License

[MIT](LICENSE) © 2026 October Moon LLC (Latitude 10)
