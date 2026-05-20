







[2~# MCP Install Guard

Scan MCP servers before you trust them.

MCP Install Guard is a local-first security scanner that helps developers inspect MCP servers **before installation**.

Detect risky capabilities like:

- shell execution
- filesystem write/delete access
- credential exposure
- database mutation
- suspicious prompt/tool descriptions
- unsafe MCP behavior patterns

Stop installing unknown MCP servers blindly.

---

## Quick Start

Clone the repo:

```bash
git clone https://github.com/oplooins/mcp-install-guard.git
cd mcp-install-guard
```

Scan a stdio MCP server:

```bash
node ./mcp-install-guard-cli.mjs --stdio-config ./sample-stdio-config.json
```

Scan a tools/list JSON file:

```bash
node ./mcp-install-guard-cli.mjs --tools-list ./sample-tools-list.json
```

---

## Example Output

```text
MCP Install Risk Report
Health Score: 46
Risk Score: 54
Decision: do-not-install
Confidence: high
Behavior Tests: 1 passed, 0 failed, 2 skipped
```

---

## Why This Exists

MCP gives AI clients access to:

- tools
- files
- databases
- APIs
- external execution

That creates a basic security question:

> What am I giving this MCP server access to, and should I trust it?

MCP Install Guard helps answer that question before installation.

---

## Features

- Local-first scanning
- No cloud dependency
- Risk scoring
- Health scoring
- Behavior test support
- HTTP MCP inspection
- stdio MCP inspection
- tools/list JSON inspection
- simple browser health checker UI

---

## Project Structure

- `mcp-health-checker.html` → local web UI
- `mcp-install-guard-proxy.mjs` → local proxy
- `mcp-install-guard-cli.mjs` → CLI scanner
- `mock-mcp-http-server.mjs` → HTTP MCP test server
- `mock-mcp-stdio-server.mjs` → stdio MCP test server

---

## Roadmap

Planned improvements:

- GitHub Action integration
- CI security checks
- MCP reputation database
- allowlist / denylist policies
- SARIF export
- enterprise scanning API

---

## License

MIT