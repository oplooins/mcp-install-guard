# MCP Install Guard

**Block risky MCP and AI tool changes before they reach users.**

MCP servers can expose local files, shell commands, APIs, databases, and credentials. MCP Install Guard is a local-first security gate that scans MCP tool definitions, enforces policy, and detects permission drift in CI.

This project is no longer positioned as only a one-time scanner. The useful product direction is: **AI tool permission gate for development teams.**

## Quick demo

Run a built-in risky MCP example:

```bash
npx mcp-install-guard@beta --demo
```

Fail if the demo violates policy:

```bash
npx mcp-install-guard@beta --demo --policy ./policy.example.json --fail-on policy
```

## Scan your own MCP server

Scan a local `tools/list` JSON file:

```bash
npx mcp-install-guard@beta --file ./tools-list.json
```

Scan a stdio MCP config:

```bash
npx mcp-install-guard@beta --stdio-config ./mcp-server.json
```

Scan a remote MCP server:

```bash
npx mcp-install-guard@beta --server http://localhost:7331/mcp
```

Authenticated remote server:

```bash
npx mcp-install-guard@beta --server https://example.com/mcp --token $MCP_TOKEN
```

## What it detects

- unrestricted filesystem access
- shell or command execution
- credential/token exposure
- prompt-injection-like tool descriptions
- weak or missing tool schemas
- dangerous write/send/delete/update tools without confirmation
- database tools without read-only constraints

## Policy gate

Use a policy file to fail CI when an MCP tool violates your rules:

```json
{
  "maxRiskScore": 60,
  "deny": ["shell", "filesystem-write", "credential-exposure", "prompt-injection"]
}
```

Run:

```bash
npx mcp-install-guard@beta --file ./tools-list.json --policy ./policy.example.json --fail-on policy
```

## Permission diff

Detect when an MCP server adds new risky capabilities compared with a previous report:

```bash
npx mcp-install-guard@beta --file ./tools-list.json --json > baseline-report.json
npx mcp-install-guard@beta --file ./tools-list.json --baseline ./baseline-report.json --fail-on diff
```

This is the part that can create repeat usage: teams can automatically catch permission escalation over time.

## GitHub Actions

Use the included composite action as a CI gate:

```yaml
- uses: ./.github/actions/mcp-install-guard
  with:
    file: ./sample-tools-list.json
    policy: ./policy.example.json
    fail-on: policy
```

Full example: [docs/github-actions.md](./docs/github-actions.md)

## Example output

```text
MCP Install Risk Report
Source: built-in demo
Health Score: 3
Risk Score: 97
Decision: do-not-install
Issues: 9 (high 5, medium 1, low 3)
Policy Violations: 3
```

## CLI options

```text
--demo               Run a built-in risky MCP example.
--file <path>        Scan a local tools/list JSON file.
--stdio-config <p>   Scan a stdio MCP server config file.
--server <url>       Scan a Streamable HTTP MCP server.
--token <token>      Bearer token for authenticated HTTP MCP servers.
--json               Print full JSON report.
--out <path>         Write JSON report to file.
--out-md <path>      Write Markdown report to file.
--policy <path>      Apply deny/max-risk policy.
--baseline <path>    Compare against previous JSON report.
--fail-on <rule>     Supported: high, medium, risk:<number>, policy, diff.
```

## Why this matters

Installing an MCP server is a trust decision. A tool can look harmless while exposing filesystem access, command execution, token handling, or database mutation. MCP Install Guard helps move that review into a repeatable workflow.

## Who should use this

- developers testing third-party MCP servers
- teams reviewing MCP config changes in pull requests
- security engineers defining AI tool permission policy
- platform teams standardizing AI agent tooling

## Current status

Beta. Useful for early MCP security review and CI experiments. Not a replacement for sandboxing, code review, or a full security audit.

## License

MIT
