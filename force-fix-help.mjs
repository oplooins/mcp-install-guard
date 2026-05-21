import fs from "node:fs";

const file = "cli.mjs";
let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("function printHelp()");
const end = s.indexOf("function parseArgs");

if (start === -1 || end === -1 || end <= start) {
  throw new Error("Could not locate printHelp or parseArgs");
}

const fixed = `function printHelp() {
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

Options:
  --server <url>         Scan a Streamable HTTP MCP server
  --file <path>          Scan a local tools/list JSON file
  --stdio-config <path>  Scan a stdio MCP server config
  --token <token>        Bearer token for authenticated MCP servers
  --json                 Print JSON report
  --out <path>           Write JSON report to file
  --out-md <path>        Write Markdown report
  --fail-on <rule>       high | medium | risk:<number>
  --help                 Show help

Examples:
  mcp-install-guard --file sample-tools-list.json
  mcp-install-guard --server http://localhost:7331/mcp --fail-on high
\`);
}

`;

s = s.slice(0, start) + fixed + s.slice(end);
fs.writeFileSync(file, s);
console.log("force fixed printHelp");
