# GitHub Actions Integration

Use MCP Install Guard in CI to block risky MCP or AI tool changes before merge.

## Local composite action

Create `.github/workflows/mcp-security.yml`:

```yaml
name: MCP Security Gate

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  mcp-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/mcp-install-guard
        with:
          file: ./sample-tools-list.json
          policy: ./policy.example.json
          fail-on: policy
```

## Direct npx usage

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 20
  - run: npx mcp-install-guard@beta --file ./sample-tools-list.json --policy ./policy.example.json --fail-on policy
```

## Supported fail rules

```bash
--fail-on high
--fail-on medium
--fail-on risk:60
--fail-on policy
--fail-on diff
```

## Recommended team workflow

1. Commit MCP configs or exported `tools/list` reports.
2. Run MCP Install Guard on every pull request.
3. Fail when new tools violate policy.
4. Store JSON reports as artifacts if you need audit history.
5. Add baseline diff once the team has a known-good report.
