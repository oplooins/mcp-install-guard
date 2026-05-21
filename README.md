# MCP Install Guard

Block dangerous MCP servers before you install them.

## Security Gate

Scan stdio config:

```bash
mcp-install-guard-gate --stdio-config ./server.json --enforce
```

Scan remote MCP server:

```bash
mcp-install-guard-gate --server http://localhost:7331/mcp --enforce
```

If dangerous tools are detected:

- shell execution
- destructive write actions
- secret/token exposure
- prompt injection patterns

installation is blocked with exit code 2.
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


## Block risky tools in CI

```bash
npx mcp-install-guard@beta --fail-on high
```

## Why this exists

Most people install MCP servers without understanding what permissions they expose.

MCP Install Guard helps you inspect first.

