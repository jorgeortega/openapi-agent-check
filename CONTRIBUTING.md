# Contributing

Thanks for helping. Bug reports, rule proposals and pull requests are all
welcome. If you're looking for somewhere to start, the issues labelled
`good first issue` are scoped to be done in an afternoon.

## Setup

You need Node.js 20 or newer.

```sh
git clone https://github.com/jorgeortega/openapi-agent-check.git
cd openapi-agent-check
npm install
npm test            # vitest: the rules, the conformance fixtures, the CLI, Spectral, the Action's comment
npm run typecheck
npm run build       # writes dist/
node dist/bin.js test/fixtures/cases/orders-thin/openapi.json
```

A pull request needs `npm test`, `npm run typecheck` and `npm run build` to
pass; CI runs them on Node 20, 22 and 24, and runs the Action on a fixture.

## Where things are

| Path | What |
|---|---|
| `src/rules.ts` | the 13 rules and the score |
| `src/improve.ts`, `src/fix.ts` | the rules-only fixes behind `--fix` |
| `src/convert.ts` | reading an OpenAPI document into operations |
| `src/cli.ts` | the command line |
| `src/badge.ts` | the static and the live badge |
| `src/spectral.ts` | the Spectral ruleset (`openapi-agent-check/spectral`) |
| `action.yml`, `scripts/action-comment.mjs` | the GitHub Action |
| `test/fixtures/` | the conformance fixtures |

## The rules version and the conformance fixtures

`RULES_VERSION` in `src/index.ts` names the rules. A spec's score changes
only when the rules version does, so a CI gate never moves under you on a
patch release.

`test/fixtures/cases/` holds one folder per case: an OpenAPI document, a
`case.json` with the options, and `expected.json`, the exact report the rules
must produce. `test/fixtures/manifest.json` lists the cases, the rules version
they pin and a SHA-256 over every file (how it's computed is in
[test/fixtures/README.md](test/fixtures/README.md)). The conformance test
fails when any report differs or any file changed without the hash.

- **A fix that doesn't change any score** (a crash, a message, the CLI): no
  fixture changes. Add a test next to the code.
- **A change to what a rule scores:** it's a new rules version. Bump
  `RULES_VERSION`, add or regenerate the cases it affects, update the
  manifest's version and hash, and say in `CHANGELOG.md` what scores move.
  Never edit an `expected.json` by hand to make a test pass.

## Where rule changes start

The same rules run in four other places: the Agentify API kit's
`agentify check`, the hosted check at
[latitude10.tech/agent-readiness](https://latitude10.tech/agent-readiness),
its MCP server and the live badge. They must all give one spec one score.

So a change to the rules starts in the Agentify API kit, which Latitude 10
maintains, and is copied here, to the site and to the other copies with the
same rules version and the same fixtures. In practice:

1. Open an issue with the **Rule proposal** template: what the rule should
   catch, a small spec that shows it, and why an agent gets it wrong.
2. A maintainer agrees on the change and the new rules version there.
3. You (or a maintainer) open the pull request here with the code and the
   fixtures; the maintainers carry it into the other copies before the
   release, so every copy ships the same version on the same day.

Pull requests to the CLI, the Spectral ruleset, the Action, the badge, the
docs and the tests don't need any of that: open them directly.

## Style

TypeScript, ESM, two-space indentation, semicolons, double quotes. No new
runtime dependencies: the package depends on `yaml` alone, and that's on
purpose (ask in an issue first if you think one is needed). The CLI never
calls a model and never sends a spec anywhere it wasn't asked to fetch it
from.

## Commits and releases

Short imperative commit subjects (`fix: …`, `feat: …`, `docs: …`). Add a
line to `CHANGELOG.md` under the next version for anything a user would
notice. The maintainers publish to npm and tag the Action's releases.

By contributing you agree your work is released under the [MIT license](LICENSE).
