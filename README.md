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
| `--min <score>` | Exit with code 1 if the score is below `<score>` |
| `--max <n>` | Show up to `n` findings per rule (default 5) |
| `--version` | Print the package version and the rules version |

Exit codes:

- `0`: the spec was scored and met `--min`.
- `1`: the score is below `--min`.
- `2`: the spec couldn't be read, or the arguments are wrong.

### In CI

```yaml
- run: npx openapi-agent-check openapi.yaml --min 80
```

## As a library

```ts
import { check, readiness, parseSpecText } from "openapi-agent-check";

const { report, error } = await check("https://api.example.com/openapi.json");
if (report) console.log(report.score, report.rules.filter((r) => r.share < 1));

// Or with a document you already have:
const { doc } = parseSpecText(yamlOrJsonText);
const result = readiness(doc!);
```

`report` contains `score`, `operations`, `rules` and `warnings`. Each rule has
an `id`, `title`, `weight`, `applicable`, `passing`, `share`, `fix` and its
`findings`. Each finding has a `where` (`"METHOD /path"` or a parameter) and a
`message`.

## Conformance fixtures

The rules version is `1.0.3`. Scores only change when the rules version
changes. `test/fixtures/` holds 24 OpenAPI documents with the exact report
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

## Fixing what it finds

Every failing rule prints a one-line fix. To get a suggested summary,
description and example for each operation, written for you, use:

- the [Agentify API](https://latitude10.tech/products/agentify-api) kit
  (`agentify improve`),
- or the paid [readiness report](https://latitude10.tech/agent-readiness).

Both are from [Latitude 10](https://latitude10.tech), which maintains this
package.

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
