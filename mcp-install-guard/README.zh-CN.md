# MCP Install Guard

**在 MCP 和 AI 工具进入用户环境前，阻止高风险权限变化。**

MCP server 可能暴露本地文件、shell 命令、API、数据库和凭证。MCP Install Guard 是一个本地优先的安全门禁工具，用于扫描 MCP tool 定义、执行策略规则，并在 CI 中检测权限漂移。

## 快速演示

```bash
npx mcp-install-guard@beta --demo
```

使用策略失败构建：

```bash
npx mcp-install-guard@beta --demo --policy ./policy.example.json --fail-on policy
```

## 扫描方式

```bash
npx mcp-install-guard@beta --file ./tools-list.json
npx mcp-install-guard@beta --stdio-config ./mcp-server.json
npx mcp-install-guard@beta --server http://localhost:7331/mcp
```

## 检测内容

- 文件系统访问
- shell/命令执行
- token/credential 暴露
- prompt injection 风险描述
- 缺失或较弱的 schema
- 没有确认机制的写入/删除/发送/更新工具
- 没有只读约束的数据库工具

## 产品方向

它不应该只是一次性扫描器。更实用的方向是：**AI 工具权限安全门禁**。

长期价值来自：

- CI 自动拦截危险 MCP 变更
- policy 规则统一团队安全标准
- baseline diff 检测权限升级
- 未来扩展为 trust/reputation layer

当前版本是 beta，不替代沙箱、代码审查或完整安全审计。
