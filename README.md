# MCP Install Guard

AI Tool Security Gate for MCP servers.

Inspect MCP servers before you trust them.

MCP servers may access:

- local files
- shell commands
- APIs
- credentials

## Try in 10 seconds

```bash
npx mcp-install-guard@beta --demo
```


## What it detects

- unrestricted filesystem access
- shell execution
- token / credential exposure
- prompt injection patterns
- weak tool schemas
- dangerous write actions

## Scan your own MCP config

```bash
npx mcp-install-guard@beta --stdio-config ./server.json
```

## Scan a remote MCP server

```bash
npx mcp-install-guard@beta --server http://localhost:7331/mcp
```

## Block risky tools in CI

```bash
npx mcp-install-guard@beta --fail-on high
```

## Why this exists

Most people install MCP servers without understanding what permissions they expose.

MCP Install Guard helps you inspect first.

