import fs from "node:fs";

const file = "cli.mjs";
let s = fs.readFileSync(file, "utf8");

const helpFn = `function printHelp() {
  console.log(\`
MCP Install Guard

Scan MCP servers before installing them.

Usage:
  mcp-install-guard --stdio-config <path>
  mcp-install-guard --tools-list <path>
  mcp-install-guard --server <url>

Examples:
  npx mcp-install-guard --stdio-config ./sample-stdio-config.json
  npx mcp-install-guard --tools-list ./sample-tools-list.json
\`);
}

`;

if (!s.includes("function printHelp()")) {
  s = s.replace("function printSummary(report) {", helpFn + "function printSummary(report) {");
}

s = s.replace(
  `throw new Error("Missing input. Use --file <path>, --server <url>, or --stdio-config <path>.");`,
  `printHelp();
  process.exit(1);`
);

fs.writeFileSync(file, s);
console.log("patched cli.mjs");
