#!/usr/bin/env node
import fs from 'node:fs/promises';
import { loadInput, scanTools, compareBaseline, pretty, VERSION } from '../core/scanner.mjs';
import { loadPolicy, applyPolicy, shouldFail } from '../core/policy.mjs';
import { discoverConfigs, extractStdioConfigsFromClaude } from '../core/discover.mjs';

function printHelp() {
  console.log(`
MCP Install Guard v${VERSION}
AI Tool Security Gate for MCP servers

Usage:
  mcp-install-guard --demo
  mcp-install-guard --file tools-list.json
  mcp-install-guard --stdio-config server.json
  mcp-install-guard --server http://localhost:7331/mcp
  mcp-install-guard --discover
  mcp-install-guard --stdio-config server.json --policy examples/policy.strict.json --fail-on policy
  mcp-install-guard --file tools-list.json --baseline baseline-report.json --fail-on diff

Options:
  --demo                 Run bundled demo scan
  --file <path>          Scan a local tools/list JSON file
  --stdio-config <path>  Scan a stdio MCP server config
  --server <url>         Scan a Streamable HTTP MCP server
  --token <token>        Bearer token for authenticated HTTP MCP servers
  --policy <path>        Apply policy rules
  --baseline <path>      Compare against a previous JSON report
  --json                 Print full JSON report
  --out <path>           Write JSON report to file
  --out-md <path>        Write Markdown report to file
  --fail-on <rule>       high | medium | risk:<number> | policy | diff
  --discover             Find Claude/Cursor MCP config files
  --no-behavior          Skip safe tools/call behavior tests
  --help                 Show help
`);
}

function parseArgs(argv) {
  const args = { demo: false, file: '', stdioConfig: '', server: '', token: '', policy: '', baseline: '', json: false, out: '', outMd: '', failOn: '', discover: false, noBehavior: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--demo') args.demo = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--discover') args.discover = true;
    else if (arg === '--no-behavior') args.noBehavior = true;
    else if (arg === '--file') args.file = argv[++i] || '';
    else if (arg === '--stdio-config') args.stdioConfig = argv[++i] || '';
    else if (arg === '--server') args.server = argv[++i] || '';
    else if (arg === '--token') args.token = argv[++i] || '';
    else if (arg === '--policy') args.policy = argv[++i] || '';
    else if (arg === '--baseline') args.baseline = argv[++i] || '';
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--out-md') args.outMd = argv[++i] || '';
    else if (arg === '--fail-on') args.failOn = argv[++i] || '';
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function buildMarkdownReport(report) {
  const findings = report.issues.length
    ? report.issues.map((issue) => `- **[${issue.severity}] ${issue.tool}**: ${issue.title}\n  - Detail: ${issue.detail}\n  - Fix: ${issue.fix}`).join('\n')
    : '- No obvious issues found.';
  const policy = report.policyViolations?.length
    ? report.policyViolations.map((v) => `- **[${v.severity}] ${v.target}**: ${v.rule} — ${v.detail}`).join('\n')
    : '- No policy violations.';
  const diff = report.permissionDiff?.length
    ? report.permissionDiff.map((v) => `- **[${v.severity}] ${v.tool}**: ${v.type} — ${v.detail}`).join('\n')
    : '- No permission drift.';
  return `# MCP Install Risk Report

Generated: ${report.generatedAt}
Source: ${report.source?.url || report.source?.path || report.source?.type || 'unknown'}

## Decision

- Health Score: ${report.score}
- Risk Score: ${report.riskScore}
- Install Decision: ${report.installDecision.label}
- Reason: ${report.installDecision.reason}
- Confidence: ${report.confidence.label} — ${report.confidence.reason}

## Summary

- Tools: ${report.summary.tools}
- Issues: ${report.summary.issues}
- High: ${report.summary.high}
- Medium: ${report.summary.medium}
- Low: ${report.summary.low}

## Findings

${findings}

## Policy Violations

${policy}

## Permission Diff

${diff}
`;
}

function printSummary(report) {
  console.log('MCP Install Risk Report');
  console.log(`Source: ${report.source?.url || report.source?.path || report.source?.type || 'unknown'}`);
  console.log(`Health Score: ${report.score}`);
  console.log(`Risk Score: ${report.riskScore}`);
  console.log(`Decision: ${report.installDecision.label}`);
  console.log(`Reason: ${report.installDecision.reason}`);
  console.log(`Confidence: ${report.confidence.label} - ${report.confidence.reason}`);
  console.log(`Tools: ${report.summary.tools}`);
  console.log(`Issues: ${report.summary.issues} (high ${report.summary.high}, medium ${report.summary.medium}, low ${report.summary.low})`);
  if (report.policyViolations?.length) console.log(`Policy Violations: ${report.policyViolations.length}`);
  if (report.permissionDiff?.length) console.log(`Permission Diff: ${report.permissionDiff.length} change(s)`);
  if (report.issues.length) {
    console.log('\nFindings:');
    for (const issue of report.issues.slice(0, 20)) {
      console.log(`- [${issue.severity}] ${issue.tool}: ${issue.title}`);
      console.log(`  Fix: ${issue.fix}`);
    }
    if (report.issues.length > 20) console.log(`- ... ${report.issues.length - 20} more findings`);
  }
}

async function runDiscover() {
  const files = await discoverConfigs();
  if (!files.length) {
    console.log('No Claude/Cursor MCP config files found.');
    return;
  }
  console.log('Discovered MCP config files:');
  for (const file of files) {
    console.log(`- ${file}`);
    try {
      const servers = await extractStdioConfigsFromClaude(file);
      for (const server of servers) console.log(`  - ${server.name}: ${server.config.command || 'unknown command'}`);
    } catch {}
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (args.discover) { await runDiscover(); return; }
  if (!args.demo && !args.file && !args.stdioConfig && !args.server) { printHelp(); process.exitCode = 1; return; }

  const input = await loadInput(args);
  const report = scanTools(input.tools, input.source, input.behaviorTests || []);

  if (args.policy) report.policyViolations = applyPolicy(report, await loadPolicy(args.policy));
  else report.policyViolations = [];

  if (args.baseline) report.permissionDiff = compareBaseline(report, JSON.parse(await fs.readFile(args.baseline, 'utf8')));
  else report.permissionDiff = [];

  if (args.out) await fs.writeFile(args.out, `${pretty(report)}\n`, 'utf8');
  if (args.outMd) await fs.writeFile(args.outMd, buildMarkdownReport(report), 'utf8');

  if (args.json) console.log(pretty(report));
  else printSummary(report);

  if (args.failOn && shouldFail(report, args.failOn)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
