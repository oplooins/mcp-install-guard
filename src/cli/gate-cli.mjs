#!/usr/bin/env node
import fs from 'node:fs/promises';
import { loadInput, scanTools, VERSION } from '../core/scanner.mjs';
import { loadPolicy, applyPolicy } from '../core/policy.mjs';

function printHelp() {
  console.log(`
MCP Install Guard Gate v${VERSION}

Usage:
  mcp-install-guard-gate --demo --enforce
  mcp-install-guard-gate --stdio-config ./server.json --enforce
  mcp-install-guard-gate --file ./tools-list.json --enforce
  mcp-install-guard-gate --server http://localhost:7331/mcp --enforce

Options:
  --demo                 Run bundled demo
  --stdio-config <path>  Scan stdio MCP config
  --file <path>          Scan tools/list JSON file
  --server <url>         Scan remote HTTP MCP server
  --token <token>        Bearer token
  --policy <path>        Policy JSON file
  --enforce              Exit with code 2 if blocked
  --json                 Print JSON gate result
  --help                 Show help
`);
}

function parseArgs(argv) {
  const args = { demo: false, stdioConfig: '', file: '', server: '', token: '', policy: '', enforce: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--demo') args.demo = true;
    else if (arg === '--enforce') args.enforce = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--stdio-config') args.stdioConfig = argv[++i] || '';
    else if (arg === '--file') args.file = argv[++i] || '';
    else if (arg === '--server') args.server = argv[++i] || '';
    else if (arg === '--token') args.token = argv[++i] || '';
    else if (arg === '--policy') args.policy = argv[++i] || '';
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function blockReasons(tool) {
  const reasons = [];
  if (tool.shellRisk) reasons.push('shell execution');
  if (tool.writeRisk) reasons.push('write/delete/send/mutation');
  if (tool.secretRisk) reasons.push('secret or token exposure');
  if (tool.promptInjectionHits?.length) reasons.push('prompt injection pattern');
  return reasons;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.demo && !args.stdioConfig && !args.file && !args.server) { printHelp(); process.exitCode = 1; return; }

  const input = await loadInput(args);
  const report = scanTools(input.tools, input.source, input.behaviorTests || []);
  const policy = await loadPolicy(args.policy);
  const policyViolations = applyPolicy(report, policy);
  const blockedTools = (report.tools || [])
    .map((tool) => ({ tool: tool.name, reasons: blockReasons(tool) }))
    .filter((item) => item.reasons.length);
  const decision = blockedTools.length || policyViolations.length ? 'BLOCK' : 'ALLOW';
  const result = { decision, score: report.score, riskScore: report.riskScore, blockedTools, policyViolations };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\nMCP INSTALL GUARD GATE');
    console.log('======================');
    console.log(`\nDecision: ${decision}`);
    console.log(`Health Score: ${report.score}`);
    console.log(`Risk Score: ${report.riskScore}`);
    if (blockedTools.length) {
      console.log('\nBlocked tools:');
      for (const item of blockedTools) console.log(`- ${item.tool}: ${item.reasons.join(', ')}`);
    }
    if (policyViolations.length) {
      console.log('\nPolicy violations:');
      for (const item of policyViolations) console.log(`- ${item.target}: ${item.rule} - ${item.detail}`);
    }
    console.log(`\nRecommendation: ${decision === 'BLOCK' ? 'do not install unless reviewed.' : 'no blocked capability detected.'}`);
  }

  if (args.enforce && decision === 'BLOCK') process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
