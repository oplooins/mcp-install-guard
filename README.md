# MCP Install Guard

**Local-first install risk reports for MCP servers.**

Install MCP servers with a risk report, not a guess.

MCP Install Guard helps developers inspect an MCP server before installing or shipping it. It reads `tools/list` metadata, detects risky tool exposure, checks schema and descriptions, runs safe behavior tests, and generates an install decision report.

This project is an early local-first MVP. It is designed to help developers quickly understand what an MCP server exposes and whether it looks safe enough to test, install, or ship.

## What It Is

MCP Install Guard is an install-time risk checker for MCP servers.

It answers practical questions:

- What tools does this MCP server expose?
- Are there dangerous tools such as delete, shell, file, database, email, or token-related tools?
- Are tool schemas and required parameters well formed?
- Do descriptions contain obvious prompt injection phrases?
- Can low-risk tools pass a real `tools/call` behavior test?
- Should this MCP server be installed, tested only, fixed first, or rejected?

The goal is not to prove that a server is perfectly safe. The goal is to make installation risk visible before trust is granted.

## What It Checks

MCP Install Guard currently checks:

- Tool exposure from `tools/list`
- Tool name quality and duplicate names
- Missing or weak `description`
- Missing `inputSchema`
- Missing parameter `type`
- `required` parameters not defined in `properties`
- Weak parameter descriptions
- Write-like tools such as `create`, `update`, `delete`, `send`, `write`, `charge`, `refund`
- Database tools such as `sql`, `database`, `db`
- Filesystem tools such as `file`, `filesystem`, `path`, `read_file`, `write_file`
- Command execution tools such as `shell`, `command`, `exec`, `powershell`, `bash`
- Secret-related tools or parameters such as `token`, `api key`, `password`, `credential`
- Obvious prompt injection phrases such as `ignore previous instructions`, `reveal secrets`, `system prompt`, `hidden instruction`
- Safe behavior tests for low-risk tools using `tools/call`
- Automatic skipping of risky tools that do not expose `dryRun` or `previewOnly`

The report includes:

- Health score
- Risk score
- Install decision
- Confidence level
- Findings with severity
- Fix suggestions
- Behavior test results
- Scan history comparison
- JSON and Markdown export

## What It Does Not Do

MCP Install Guard is not a complete security audit.

It does not currently:

- Guarantee that an MCP server is safe
- Perform full source-code malware analysis
- Scan npm, PyPI, Docker, or package supply chain risk
- Prove business correctness of tool output
- Execute dangerous tools by default
- Replace sandboxing, permission design, or professional security review
- Certify legal or compliance readiness

High-risk tools are skipped during behavior tests unless they provide a safe mode such as `dryRun` or `previewOnly`.

## Quick Start

Start the local proxy:

```powershell
node .\mcp-install-guard-proxy.mjs
```

If your system `node` is unavailable, use the bundled Node runtime:

```powershell
node .\mcp-install-guard-proxy.mjs
```

Open the local web app:

```text
http://127.0.0.1:8787/mcp-health-checker.html
```

Scan an HTTP MCP server:

```text
http://127.0.0.1:7331/mcp
```

Scan a stdio MCP server by expanding `扫描 stdio MCP 配置` in the web UI and pasting a config object with `command`, `args`, `env`, and optional `cwd`.

## CLI Usage

Scan a local `tools/list` JSON file:

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json
```

Scan an HTTP MCP server:

```powershell
node .\mcp-install-guard-cli.mjs --server http://127.0.0.1:7331/mcp
```

Scan an authenticated HTTP MCP server:

```powershell
node .\mcp-install-guard-cli.mjs --server https://example.com/mcp --token YOUR_TOKEN
```

Scan a stdio MCP server config:

```powershell
node .\mcp-install-guard-cli.mjs --stdio-config .\sample-stdio-config.json
```

Export a Markdown report:

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --out-md report.md
```

Fail CI when high-risk findings are found:

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --fail-on high
```

Fail CI when the risk score reaches a threshold:

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --fail-on risk:60
```

## Examples

Start the mock HTTP MCP server:

```powershell
node .\mock-mcp-http-server.mjs
```

Then scan:

```powershell
node .\mcp-install-guard-cli.mjs --server http://127.0.0.1:7331/mcp
```

Example output:

```text
MCP Install Risk Report
Health Score: 46
Risk Score: 54
Decision: do-not-install
Confidence: high
Behavior Tests: 1 passed, 0 failed, 2 skipped
```

Scan the mock stdio MCP server:

```powershell
node .\mcp-install-guard-cli.mjs --stdio-config .\sample-stdio-config.json
```

Example output:

```text
MCP Install Risk Report
Health Score: 49
Risk Score: 51
Decision: fix-before-install
Confidence: high
Behavior Tests: 1 passed, 0 failed, 1 skipped
```

## Why This Exists

MCP makes it easy for AI clients to connect to external tools, files, databases, APIs, and local systems.

That power creates an install-time question:

```text
What am I giving this MCP server access to, and should I trust it?
```

MCP Install Guard focuses on that moment. It provides a local-first decision report before a server is trusted by a client or shipped to users.

## Project Structure

- `mcp-health-checker.html`: local web UI
- `mcp-install-guard-proxy.mjs`: local proxy for HTTP and stdio MCP scanning
- `mcp-install-guard-cli.mjs`: CLI scanner for files, HTTP servers, and stdio configs
- `mock-mcp-http-server.mjs`: mock HTTP MCP server for testing
- `mock-mcp-stdio-server.mjs`: mock stdio MCP server for testing
- `sample-tools-list.json`: sample `tools/list` JSON
- `sample-stdio-config.json`: sample stdio config

## Roadmap

- GitHub Action
- PDF reports
- Rule packs for different MCP categories
- Package and repository scanning
- Source-code risk checks
- Docker image scanning
- Trust score registry for public MCP servers
- Team projects and scan history
- Scheduled rescans and alerts

## Positioning

MCP Install Guard is not trying to be the broadest MCP security platform.

It is focused on one narrow job:

```text
Generate a local install decision report before an MCP server is trusted.
```
