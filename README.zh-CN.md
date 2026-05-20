# MCP Install Guard

**本地优先的 MCP Server 安装前风险报告工具。**

安装 MCP Server 前，不靠猜，先看一份风险报告。

MCP Install Guard 帮助开发者在安装或交付 MCP Server 前进行检查。它会读取 `tools/list` 元数据，识别危险工具暴露面，检查 schema 和 description，执行安全行为测试，并生成安装决策报告。

这是一个早期本地优先 MVP。它的目标是帮助开发者快速理解一个 MCP Server 暴露了什么能力，以及它是否适合测试、安装或上线。

## 它是什么

MCP Install Guard 是一个 **MCP Server 安装前风险检查器**。

它回答这些实际问题：

- 这个 MCP Server 暴露了哪些 tools？
- 是否存在删除、命令执行、文件读写、数据库、发邮件、token 相关的危险工具？
- tool schema 和 required 参数是否规范？
- description 里是否有明显 prompt injection 风险？
- 低风险 tool 能否通过真实 `tools/call` 行为测试？
- 这个 MCP Server 是建议安装、仅建议测试、修复后安装，还是不建议安装？

它的目标不是证明一个 server 绝对安全，而是在你信任它之前，把安装风险先展示出来。

## 它检查什么

当前版本可以检查：

- 从 `tools/list` 读取 tools 暴露面
- tool 名称质量和重复名称
- 缺失或过短的 `description`
- 缺失 `inputSchema`
- 参数缺少 `type`
- `required` 参数没有在 `properties` 中定义
- 参数说明不足
- 写入类工具，例如 `create`、`update`、`delete`、`send`、`write`、`charge`、`refund`
- 数据库类工具，例如 `sql`、`database`、`db`
- 文件系统类工具，例如 `file`、`filesystem`、`path`、`read_file`、`write_file`
- 命令执行类工具，例如 `shell`、`command`、`exec`、`powershell`、`bash`
- 密钥相关工具或参数，例如 `token`、`api key`、`password`、`credential`
- 明显 prompt injection 关键词，例如 `ignore previous instructions`、`reveal secrets`、`system prompt`、`hidden instruction`、`忽略之前`、`泄露`
- 对低风险 tools 执行安全 `tools/call` 行为测试
- 对没有 `dryRun` 或 `previewOnly` 的高风险 tools 自动跳过真实调用

报告会包含：

- 健康分
- 风险分
- 安装建议
- 置信度
- 分级问题列表
- 修复建议
- 行为测试结果
- 历史扫描对比
- JSON 和 Markdown 导出

## 它不做什么

MCP Install Guard 不是完整安全审计工具。

当前版本不做：

- 保证 MCP Server 绝对安全
- 完整源码级恶意代码分析
- npm、PyPI、Docker 或依赖供应链风险扫描
- 证明 tool 返回结果在业务上正确
- 默认执行危险 tool
- 替代沙箱、权限设计或专业安全审计
- 提供法律或合规认证

高风险 tools 在行为测试中默认会被跳过，除非它们提供 `dryRun` 或 `previewOnly` 这样的安全模式。

## 快速开始

启动本地代理：

```powershell
node .\mcp-install-guard-proxy.mjs
```

如果系统里的 `node` 不可用，可以使用 Codex 内置 Node：

```powershell
C:\Users\26556\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\mcp-install-guard-proxy.mjs
```

打开本地网页：

```text
http://127.0.0.1:8787/mcp-health-checker.html
```

扫描 HTTP MCP Server：

```text
http://127.0.0.1:7331/mcp
```

扫描 stdio MCP Server：在网页中展开 `扫描 stdio MCP 配置`，粘贴包含 `command`、`args`、`env` 和可选 `cwd` 的配置对象。

## CLI 用法

扫描本地 `tools/list` JSON 文件：

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json
```

扫描 HTTP MCP Server：

```powershell
node .\mcp-install-guard-cli.mjs --server http://127.0.0.1:7331/mcp
```

扫描需要认证的 HTTP MCP Server：

```powershell
node .\mcp-install-guard-cli.mjs --server https://example.com/mcp --token YOUR_TOKEN
```

扫描 stdio MCP Server 配置：

```powershell
node .\mcp-install-guard-cli.mjs --stdio-config .\sample-stdio-config.json
```

导出 Markdown 报告：

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --out-md report.md
```

在 CI 中发现高风险时失败：

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --fail-on high
```

在 CI 中风险分达到阈值时失败：

```powershell
node .\mcp-install-guard-cli.mjs --file .\sample-tools-list.json --fail-on risk:60
```

## 示例

启动 mock HTTP MCP Server：

```powershell
C:\Users\26556\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\mock-mcp-http-server.mjs
```

然后扫描：

```powershell
C:\Users\26556\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\mcp-install-guard-cli.mjs --server http://127.0.0.1:7331/mcp
```

示例输出：

```text
MCP Install Risk Report
Health Score: 46
Risk Score: 54
Decision: do-not-install
Confidence: high
Behavior Tests: 1 passed, 0 failed, 2 skipped
```

扫描 mock stdio MCP Server：

```powershell
C:\Users\26556\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe .\mcp-install-guard-cli.mjs --stdio-config .\sample-stdio-config.json
```

示例输出：

```text
MCP Install Risk Report
Health Score: 49
Risk Score: 51
Decision: fix-before-install
Confidence: high
Behavior Tests: 1 passed, 0 failed, 1 skipped
```

## 为什么需要它

MCP 让 AI 客户端可以连接外部工具、文件、数据库、API 和本地系统。

这也带来一个安装前问题：

```text
我准备信任的这个 MCP Server，到底会暴露哪些能力？
```

MCP Install Guard 聚焦的就是这个时刻。它在 MCP Server 被客户端信任之前，提供一份本地生成的安装决策报告。

## 项目结构

- `mcp-health-checker.html`：本地网页界面
- `mcp-install-guard-proxy.mjs`：本地代理，支持 HTTP 和 stdio MCP 扫描
- `mcp-install-guard-cli.mjs`：CLI 扫描器，支持文件、HTTP Server 和 stdio 配置
- `mock-mcp-http-server.mjs`：用于测试的 mock HTTP MCP Server
- `mock-mcp-stdio-server.mjs`：用于测试的 mock stdio MCP Server
- `sample-tools-list.json`：示例 `tools/list` JSON
- `sample-stdio-config.json`：示例 stdio 配置

## 路线图

- GitHub Action
- PDF 报告
- 不同 MCP 类型的规则包
- 包和仓库扫描
- 源码风险检查
- Docker 镜像扫描
- 公开 MCP Server 信任分数据库
- 团队项目和扫描历史
- 定时扫描和风险提醒

## 定位

MCP Install Guard 不试图成为最庞大的 MCP 安全平台。

它只专注一个清晰任务：

```text
在信任一个 MCP Server 之前，生成本地安装决策报告。
```

