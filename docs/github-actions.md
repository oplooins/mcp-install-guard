# GitHub Actions Integration

Use MCP Install Guard in CI to block risky MCP server configurations before they are merged.

## Example Workflow

Create `.github/workflows/mcp-install-guard.yml`:

```yaml
name: MCP Install Guard

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  scan-mcp:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Scan MCP stdio config
        run: |
          npx mcp-install-guard --stdio-config ./sample-stdio-config.json --fail-on high

