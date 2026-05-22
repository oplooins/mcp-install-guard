# MCP Install Guard

**Block dangerous MCP servers before you install them.**

MCP servers may access local files, shell commands, APIs, databases, and credentials. MCP Install Guard gives you a scanner and an enforcement gate for MCP servers and AI tools.

## Try in 10 seconds

```bash
npx mcp-install-guard@beta --demo
```

## Security Gate

Block dangerous tools with a non-zero exit code.

```bash
mcp-install-guard-gate --stdio-config ./server.json --enforce
mcp-install-guard-gate --server http://localhost:7331/mcp --enforce
```

If dangerous capabilities are detected, the gate returns exit code `2`.

## What it detects

- shell or command execution
- filesystem access without path restriction
- token / credential exposure
- prompt-injection-like tool descriptions
- dangerous write / delete / send actions
- weak or missing JSON schemas
- database tools without read-only constraints
- permission drift against a previous baseline

## Scan commands

```bash
# Demo scan
mcp-install-guard --demo

# Scan local tools/list JSON
mcp-install-guard --file ./examples/sample-tools-list.json

# Scan stdio MCP config
mcp-install-guard --stdio-config ./examples/sample-stdio-config.json

# Scan remote HTTP MCP server
mcp-install-guard --server http://localhost:7331/mcp

# JSON report
mcp-install-guard --demo --json

# Markdown report
mcp-install-guard --demo --out-md report.md
```

## Policy enforcement

Create a policy file:

```json
{
  "maxRiskScore": 50,
  "deny": ["shell", "mutation", "secrets", "prompt-injection"],
  "allowTools": [],
  "denyTools": []
}
```

Run:

```bash
mcp-install-guard --file ./examples/sample-tools-list.json --policy ./examples/policy.strict.json --fail-on policy
mcp-install-guard-gate --file ./examples/sample-tools-list.json --policy ./examples/policy.strict.json --enforce
```

## Permission diff

Detect new dangerous capabilities compared with a previous report:

```bash
mcp-install-guard --file ./examples/sample-tools-list.json --json > baseline-report.json
mcp-install-guard --file ./examples/sample-tools-list.json --baseline baseline-report.json --fail-on diff
```

## Discover installed MCP configs

```bash
mcp-install-guard --discover
```

This checks common Claude Desktop and Cursor MCP config locations.

## GitHub Actions

```yaml
name: MCP Security Gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/mcp-install-guard
        with:
          file: ./examples/sample-tools-list.json
          policy: ./examples/policy.strict.json
          fail-on: policy
```

## Local development

```bash
npm run check
npm run demo
npm run gate:demo
npm test
npm pack
```

## Why this is different

Most scanner demos stop at a risk report. This version adds:

- enforcement gate with exit code 2
- policy JSON
- permission diff baseline
- installed config discovery
- GitHub Action template
- mock HTTP and stdio MCP servers for reproducible testing

## License

MIT
