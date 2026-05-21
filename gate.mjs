#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function printHelp() {
  console.log(`
MCP Install Guard Gate

Usage:
  mcp-install-guard-gate --stdio-config ./server.json --enforce
  mcp-install-guard-gate --file ./tools-list.json --enforce
  mcp-install-guard-gate --server http://localhost:7331/mcp --enforce

Options:
  --stdio-config <path>
  --file <path>
  --server <url>
  --token <token>
  --enforce
  --help
`);
}

function parseArgs(argv) {
  const args = {
    stdioConfig: "",
    file: "",
    server: "",
    token: "",
    enforce: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--enforce") args.enforce = true;
    else if (arg === "--stdio-config") args.stdioConfig = argv[++i] || "";
    else if (arg === "--file") args.file = argv[++i] || "";
    else if (arg === "--server") args.server = argv[++i] || "";
    else if (arg === "--token") args.token = argv[++i] || "";
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function runScanner(args) {
  const cmd = [join(__dirname, "cli.mjs"), "--json"];
  if (args.stdioConfig) cmd.push("--stdio-config", args.stdioConfig);
  if (args.file) cmd.push("--file", args.file);
  if (args.server) cmd.push("--server", args.server);
  if (args.token) cmd.push("--token", args.token);


  const result = spawnSync("node", cmd, {
    encoding: "utf8"
  });

  if (result.error) throw result.error;
  if (!result.stdout) throw new Error(result.stderr || "Scanner failed");

  return JSON.parse(result.stdout);
}

function blocked(tool) {
  return Boolean(
    tool.shellRisk ||
    tool.writeRisk ||
    tool.secretRisk ||
    (tool.promptInjectionHits && tool.promptInjectionHits.length)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.stdioConfig && !args.file && !args.server) {
    printHelp();
    process.exit(1);
  }

  const report = runScanner(args);
  const badTools = (report.tools || []).filter(blocked);

  console.log("");
  console.log("MCP INSTALL GUARD GATE");
  console.log("======================");
  console.log("");
  console.log(`Decision: ${badTools.length ? "BLOCK" : "ALLOW"}`);
  console.log(`Health Score: ${report.score}`);
  console.log(`Risk Score: ${report.riskScore}`);
  console.log("");

  if (badTools.length) {
    console.log("Blocked tools:");

    for (const tool of badTools) {
      console.log(`- ${tool.name}`);
    }

    console.log("");
    console.log("Recommendation: do not install.");
  } else {
    console.log("Recommendation: safe to install.");
  }

  if (args.enforce && badTools.length) {
    process.exit(2);
  }
}

try {
  main();
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}

