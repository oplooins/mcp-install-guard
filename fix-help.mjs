import fs from "node:fs";

const file = "cli.mjs";
let s = fs.readFileSync(file, "utf8");

const newHelp = `function printHelp() {
  console.log(\`
MCP Install Guard v\${VERSION}
AI Tool Security Gate for MCP servers

Usage:
  mcp-install-guard --file tools-list.json
  mcp-install-guard --server http://localhost:7331/mcp
  mcp-install-guard --server https://example.com/mcp --token sk-xxx
  mcp-install-guard --stdio-config mcp-server.json
  mcp-install-guard --file tools-list.json --json
  mcp-install-guard --server http://localhost:7331/mcp --out report.json
  mcp-install-guard --file tools-list.json --out-md report.md
  mcp-install-guard --file tools-list.json --fail-on high
  mcp-install-guard --file tools-list.json --fail-on risk:60
  mcp-install-guard --demo

Options:
  --server <url>         Scan a Streamable HTTP MCP server
  --file <path>          Scan a local tools/list JSON file
  --stdio-config <path>  Scan a stdio MCP server config
  --token <token>        Bearer token for authenticated MCP servers
  --json                 Print JSON report
  --out <path>           Write JSON report to file
  --out-md <path>        Write Markdown report
  --fail-on <rule>       high | medium | risk:<number>
  --demo                 Run demo scan using bundled sample config
  --help                 Show help

Examples:
  mcp-install-guard --demo
  mcp-install-guard --server http://localhost:7331/mcp --fail-on high
\`);
}
`;

s = s.replace(/function printHelp\(\) \{[\s\S]*?\n\}\n\nfunction parseArgs/, newHelp + "\nfunction parseArgs");

fs.writeFileSync(file, s);
console.log("fixed printHelp");
