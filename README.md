# MCP Install Guard

Scan MCP servers before you trust them.

MCP Install Guard is a local-first security scanner that helps developers inspect MCP servers before installation.

It detects risky capabilities such as:

- unrestricted filesystem access
- shell execution
- credential or token exposure
- prompt injection in tool descriptions
- weak parameter validation

## Quick Start


Install globally (optional):

npm install -g mcp-install-guard


Scan a local MCP stdio config instantly:

```bash
npx mcp-install-guard --stdio-config ./sample-stdio-config.json
```

Scan a remote MCP server:

```bash
npx mcp-install-guard --server http://localhost:7331/mcp
```

Fail CI on dangerous tools:

```bash
npx mcp-install-guard --stdio-config ./sample-stdio-config.json --fail-on high
```
## Example Output

```text
MCP Install Risk Report
Health Score: 49
Risk Score: 51
Decision: fix-before-install
```
## CI Usage

Use MCP Install Guard in GitHub Actions to fail builds when risky MCP tools are detected.

See: [GitHub Actions Integration](./docs/github-actions.md)

## Why This Exists

MCP servers can access:

- files
- APIs
- databases
- shell commands

Installing one without inspection is a trust decision.

MCP Install Guard helps you inspect first.


