# MCP Install Guard

MCP Server 安装前风险报告工具。

MCP Install Guard 帮你在信任一个 MCP Server 之前先做检查。它会读取 MCP 暴露出来的 tools，识别危险能力，检查 schema 和 description 问题，发现明显 prompt injection 文本，并给出清晰的安装建议。

它不能证明一个 MCP Server 绝对安全。它的价值是：在安装前先给你一份可读的风险报告，让你知道应该测试、修复、阻止，还是可以继续接入。

## 快速体验

运行内置 demo：

```bash
npx mcp-install-guard@beta --demo
```

输出大概是这样：

```text
MCP Install Risk Report
Source: demo
Health Score: 44
Risk Score: 56
Decision: do-not-install
Tools: 3
Issues: 4
```

输出完整 JSON：

```bash
npx mcp-install-guard@beta --demo --json
```

## 扫描真实输入

扫描本地 `tools/list` JSON：

```bash
npx mcp-install-guard@beta --file ./your-tools-list.json
```

扫描 HTTP MCP Server：

```bash
npx mcp-install-guard@beta --server http://localhost:7331/mcp
```

扫描需要 token 的 HTTP MCP Server：

```bash
npx mcp-install-guard@beta --server https://example.com/mcp --token YOUR_TOKEN
```

扫描 stdio MCP 配置：

```bash
npx mcp-install-guard@beta --stdio-config ./your-server.json
```

## 阻止危险变更

发现高风险问题时让命令失败：

```bash
npx mcp-install-guard@beta --file ./your-tools-list.json --fail-on high
```

按风险分阻止：

```bash
npx mcp-install-guard@beta --file ./your-tools-list.json --fail-on risk:60
```

返回码 `2` 代表命中了风险规则，适合放进 CI。

## Gate 命令

如果你想要更直接的允许或阻止结果：

```bash
npx -p mcp-install-guard@beta mcp-install-guard-gate --file ./your-tools-list.json --enforce
```

## 本地网页

启动本地代理和网页：

```bash
npx -p mcp-install-guard@beta mcp-install-guard-web
```

然后打开：

```text
http://127.0.0.1:8787/mcp-health-checker.html
```

## 它会检查什么

- 是否暴露 shell 或命令执行工具
- 是否存在读取、写入、删除、发送、扣费、退款等改变状态的工具
- 是否暴露数据库、文件系统、token、API key、密码或 credential 风险
- `description` 和 `inputSchema` 是否缺失或质量较低
- `required` 参数是否真的定义在 `properties` 里
- 是否包含明显 prompt injection 文本，例如 `ignore previous instructions`、`reveal secrets`、`system prompt`
- 扫描兼容的 HTTP 或 stdio MCP Server 时，会尝试安全行为测试

## 仓库示例

克隆这个仓库后可以运行：

```bash
node ./cli.mjs --file ./examples/tools-list.safe.json
node ./cli.mjs --file ./examples/tools-list.risky.json
```

危险示例是故意设计成不安全的，用来展示阻断效果：

```bash
node ./cli.mjs --file ./examples/tools-list.risky.json --fail-on high
```

## 报告内容

- Health Score
- Risk Score
- Install Decision
- Confidence
- Findings
- Fix Suggestions
- Behavior Test Summary
- JSON 和 Markdown 导出

## GitHub Actions

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
      - name: Scan MCP tools
        run: npx mcp-install-guard@beta --file ./your-tools-list.json --fail-on high
```

更多 CI 示例见 [docs/github-actions.md](docs/github-actions.md)。

## 发布前检查

发布前运行：

```bash
npm run release:pack
```

它会执行语法检查、demo 验证、npm 打包、解包审计、本机路径泄露检查。

发布 beta 包：

```bash
npm publish ./mcp-install-guard-0.2.0-beta.8.tgz --tag beta
```

## 定位

这个项目不是大而全的安全平台，而是一个安装前风险检查器：

```text
Before trusting an MCP server, generate a local install risk report.
```

它适合本地运行、CI 拦截、团队安装前审查，以及给普通开发者快速判断一个 MCP Server 是否值得继续接入。
