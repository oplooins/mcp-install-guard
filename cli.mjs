#!/usr/bin/env node


const VERSION = "0.1.0";

function printHelp() {
  console.log(`
MCP Install Guard CLI v${VERSION}

Usage:
  node mcp-install-guard-cli.mjs --file tools-list.json
  node mcp-install-guard-cli.mjs --server http://localhost:7331/mcp
  node mcp-install-guard-cli.mjs --server https://example.com/mcp --token sk-...
  node mcp-install-guard-cli.mjs --stdio-config mcp-server.json
  node mcp-install-guard-cli.mjs --file tools-list.json --json
  node mcp-install-guard-cli.mjs --server http://localhost:7331/mcp --out report.json
  node mcp-install-guard-cli.mjs --file tools-list.json --out-md report.md
  node mcp-install-guard-cli.mjs --file tools-list.json --fail-on high
  node mcp-install-guard-cli.mjs --file tools-list.json --fail-on risk:60

Options:
  --server <url>       Scan a Streamable HTTP MCP server by calling tools/list.
  --file <path>        Scan a local tools/list JSON file.
  --stdio-config <path> Scan a stdio MCP server config file with command/args/env.
  --token <token>      Bearer token for authenticated HTTP MCP servers.
  --json               Print the full JSON report.
  --out <path>         Write the full JSON report to a file.
  --out-md <path>      Write a Markdown report to a file.
  --fail-on <rule>     Exit with code 2 when a risk threshold is reached.
                       Supported: high, medium, risk:<number>
  --help               Show this help.

Examples:
  node mcp-install-guard-cli.mjs --file sample-tools.json
  node mcp-install-guard-cli.mjs --server http://localhost:7331/mcp --fail-on high
`);
}

function parseArgs(argv) {
  const args = {
    server: "",
    file: "",
    stdioConfig: "",
    token: "",
    json: false,
    out: "",
    outMd: "",
    failOn: "",
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--server") args.server = argv[++i] || "";
    else if (arg === "--file") args.file = argv[++i] || "";
    else if (arg === "--stdio-config") args.stdioConfig = argv[++i] || "";
    else if (arg === "--token") args.token = argv[++i] || "";
    else if (arg === "--out") args.out = argv[++i] || "";
    else if (arg === "--out-md") args.outMd = argv[++i] || "";
    else if (arg === "--fail-on") args.failOn = argv[++i] || "";
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeTools(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.tools)) return value.tools;
  if (value.result && Array.isArray(value.result.tools)) return value.result.tools;
  if (value.params && Array.isArray(value.params.tools)) return value.params.tools;
  throw new Error("No tools array found. Provide a tools/list response JSON or a tools array.");
}

function getSchema(tool) {
  return tool.inputSchema || tool.schema || tool.parameters || {};
}

function severityWeight(severity) {
  if (severity === "high") return 16;
  if (severity === "medium") return 8;
  return 3;
}

function addIssue(issues, severity, tool, title, detail, fix) {
  issues.push({
    severity,
    tool: tool?.name || "server",
    title,
    detail,
    fix
  });
}

function isWriteTool(tool) {
  const text = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
  return /\b(create|update|delete|remove|send|write|insert|drop|alter|charge|refund|payment|email|message)\b/.test(text);
}

function isFilesystemTool(tool) {
  const text = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
  return /\b(file|filesystem|directory|path|read_file|write_file|delete_file|fs)\b/.test(text);
}

function isShellTool(tool) {
  const text = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
  return /\b(shell|terminal|command|exec|execute|powershell|bash|cmd)\b/.test(text);
}

function isSecretTool(tool) {
  const text = `${tool.name || ""} ${tool.description || ""} ${pretty(getSchema(tool))}`.toLowerCase();
  return /\b(secret|token|api key|apikey|password|credential|private key|env)\b/.test(text);
}

function supportsSafeMode(tool) {
  const properties = getSchema(tool).properties || {};
  return Boolean(properties.dryRun || properties.previewOnly);
}

function sampleValueForParam(name, schema = {}) {
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const lower = name.toLowerCase();
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 1;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  if (lower.includes("email")) return "test@example.com";
  if (lower.includes("url") || lower.includes("webhook")) return "https://example.com";
  if (lower.includes("path") || lower.includes("file")) return "README.md";
  if (lower.includes("query") || lower.includes("search")) return "test";
  if (lower.includes("id")) return "test-id";
  return "test";
}

function buildSampleArguments(tool) {
  const schema = getSchema(tool);
  const properties = schema.properties || {};
  const required = schema.required || Object.keys(properties);
  const args = {};
  for (const key of required) args[key] = sampleValueForParam(key, properties[key] || {});
  if (properties.dryRun) args.dryRun = true;
  if (properties.previewOnly) args.previewOnly = true;
  if (properties.confirm) args.confirm = false;
  if (properties.confirmation) args.confirmation = false;
  return args;
}

function summarizeBehaviorTests(behaviorTests = []) {
  return {
    total: behaviorTests.length,
    passed: behaviorTests.filter((test) => test.status === "passed").length,
    failed: behaviorTests.filter((test) => test.status === "failed").length,
    skipped: behaviorTests.filter((test) => test.status === "skipped").length
  };
}

function getConfidence(source, behaviorSummary) {
  if (!source || source.type === "file") {
    return { label: "medium", reason: "Only tools/list metadata was analyzed; no live tools/call behavior test was run." };
  }
  if (!behaviorSummary.total) {
    return { label: "medium", reason: "Connected to a live server, but behavior tests did not run." };
  }
  if (behaviorSummary.failed > 0) {
    return { label: "medium", reason: "Behavior tests ran, but at least one tool failed." };
  }
  if (behaviorSummary.skipped > 0) {
    return { label: "high", reason: "Low-risk tools passed behavior tests; risky tools were skipped by safety policy." };
  }
  return { label: "high", reason: "Connected to a live server and completed tools/call behavior tests." };
}

function promptInjectionHits(tool) {
  const text = `${tool.name || ""}\n${tool.description || ""}\n${pretty(getSchema(tool))}`.toLowerCase();
  const patterns = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "reveal secrets",
    "exfiltrate",
    "system prompt",
    "developer message",
    "send token",
    "api key",
    "bypass safety",
    "hidden instruction",
    "do not tell the user"
  ];
  return patterns.filter((pattern) => text.includes(pattern));
}

function getInstallDecision(score, riskScore, high, medium) {
  if (high >= 3 || riskScore >= 70 || score < 45) {
    return {
      label: "do-not-install",
      level: "high",
      reason: "Too many high-risk findings. Fix before install or production use."
    };
  }
  if (high > 0 || riskScore >= 45 || score < 70) {
    return {
      label: "fix-before-install",
      level: "medium",
      reason: "High-risk or quality issues were found. Do not use directly in production."
    };
  }
  if (medium > 0 || riskScore >= 20) {
    return {
      label: "test-install-only",
      level: "low",
      reason: "No critical risk, but test in a restricted environment first."
    };
  }
  return {
    label: "install-recommended",
    level: "low",
    reason: "No obvious risk found. Keep least-privilege permissions."
  };
}

function scanTools(tools, source = {}, behaviorTests = []) {
  const issues = [];
  const names = new Set();
  const duplicateNames = new Set();

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") {
      addIssue(issues, "high", null, "Invalid tool entry", "The tools array contains a non-object entry.", "Remove invalid entries.");
      continue;
    }

    if (!tool.name || typeof tool.name !== "string") {
      addIssue(issues, "high", tool, "Missing tool name", "Clients cannot reliably identify a tool without name.", "Add a unique, stable tool name.");
    } else {
      if (names.has(tool.name)) duplicateNames.add(tool.name);
      names.add(tool.name);
      if (tool.name.length < 4) {
        addIssue(issues, "medium", tool, "Tool name is too short", "Very short names are hard for AI clients and developers to understand.", "Use verb + object, such as search_docs or create_ticket.");
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_-]+$/.test(tool.name)) {
        addIssue(issues, "medium", tool, "Tool name format is unstable", "Spaces or special characters may reduce client compatibility.", "Use letters, numbers, underscore, or dash, starting with a letter.");
      }
    }

    if (!tool.description || String(tool.description).trim().length < 18) {
      addIssue(issues, "medium", tool, "Description is unclear", "A short or missing description makes tool selection unreliable.", "Explain what the tool does, when to use it, and what it returns.");
    }

    const injectionHits = promptInjectionHits(tool);
    if (injectionHits.length) {
      addIssue(
        issues,
        "high",
        tool,
        "Possible prompt injection in description/schema",
        `Suspicious phrases found: ${injectionHits.join(", ")}.`,
        "Remove instruction-like text from descriptions. Descriptions should only explain tool behavior."
      );
    }

    const schema = getSchema(tool);
    if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) {
      addIssue(issues, "high", tool, "Missing inputSchema", "Without a parameter schema, clients cannot build reliable calls.", "Add JSON Schema with type, properties, and required.");
      continue;
    }

    if (schema.type && schema.type !== "object") {
      addIssue(issues, "medium", tool, "inputSchema type is not object", "Most MCP tool arguments should be object-shaped.", "Set inputSchema.type to object.");
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    if (!schema.properties || Object.keys(properties).length === 0) {
      addIssue(issues, "medium", tool, "Empty schema properties", "Missing parameter descriptions reduce testability and usability.", "Add type and description for each parameter.");
    }

    for (const key of required) {
      if (!properties[key]) {
        addIssue(issues, "high", tool, "Required parameter is undefined", `${key} is required but not defined in properties.`, "Define this property or remove it from required.");
      }
    }

    for (const [key, prop] of Object.entries(properties)) {
      if (!prop.type) {
        addIssue(issues, "medium", tool, "Parameter missing type", `${key} has no declared type.`, "Add string, number, boolean, array, or object.");
      }
      if (!prop.description || String(prop.description).trim().length < 8) {
        addIssue(issues, "low", tool, "Parameter description is weak", `${key} has an unclear or missing description.`, "Explain meaning, expected format, and limits.");
      }
    }

    if (isWriteTool(tool)) {
      const hasConfirm = properties.confirm || properties.confirmation || properties.dryRun || properties.previewOnly;
      if (!hasConfirm) {
        addIssue(issues, "high", tool, "Write-like tool lacks confirmation", "This tool appears to write, delete, send, charge, or mutate state without a confirm/dryRun parameter.", "Add confirm, dryRun, or previewOnly and enforce it server-side.");
      }
    }

    if (isFilesystemTool(tool)) {
      const hasPathLimit = properties.allowedPath || properties.baseDir || properties.rootDir || properties.pathAllowlist;
      if (!hasPathLimit) {
        addIssue(issues, "medium", tool, "Filesystem tool lacks path restriction", "File tools without root directory or allowlist can access unexpected local files.", "Add baseDir, rootDir, or pathAllowlist and enforce it server-side.");
      }
    }

    if (isShellTool(tool)) {
      const hasDryRun = properties.dryRun || properties.confirm || properties.commandAllowlist || properties.allowedCommands;
      if (!hasDryRun) {
        addIssue(issues, "high", tool, "Command execution tool lacks safeguards", "Shell/command tools are high-risk without dryRun, confirmation, or command allowlists.", "Add commandAllowlist, dryRun, and confirm. Run with least privileges.");
      }
    }

    if (isSecretTool(tool)) {
      addIssue(issues, "medium", tool, "Tool references secrets or credentials", "The tool description/schema references tokens, API keys, passwords, credentials, or env.", "Avoid returning secrets, redact outputs, and use least-privilege tokens.");
    }

    const text = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
    if (/\b(sql|database|db)\b/.test(text) && !properties.readOnly && !properties.statementType) {
      addIssue(issues, "high", tool, "Database tool lacks read-only constraint", "Database tools without explicit read-only constraints are high-risk.", "Add readOnly=true, statementType restrictions, or reject write SQL server-side.");
    }
  }

  for (const name of duplicateNames) {
    addIssue(issues, "high", { name }, "Duplicate tool name", `Duplicate name: ${name}.`, "Rename tools so every name is unique within the server.");
  }

  for (const test of behaviorTests) {
    if (test.status === "failed") {
      addIssue(issues, "high", { name: test.tool }, "Tool behavior test failed", `Safe sample tools/call failed: ${test.error || "unknown error"}`, "Check tool schema, permissions, authentication, and runtime exceptions.");
    }
  }

  const high = issues.filter((issue) => issue.severity === "high").length;
  const medium = issues.filter((issue) => issue.severity === "medium").length;
  const low = issues.filter((issue) => issue.severity === "low").length;
  const penalty = issues.reduce((sum, issue) => sum + severityWeight(issue.severity), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const riskScore = Math.max(0, Math.min(100, penalty));
  const behaviorSummary = summarizeBehaviorTests(behaviorTests);

  return {
    generatedAt: new Date().toISOString(),
    source,
    score,
    riskScore,
    installDecision: getInstallDecision(score, riskScore, high, medium),
    confidence: getConfidence(source, behaviorSummary),
    behaviorTests,
    behaviorSummary,
    summary: {
      tools: tools.length,
      high,
      medium,
      low,
      issues: issues.length
    },
    issues,
    tools: tools.map((tool) => ({
      name: tool.name || "(missing)",
      description: tool.description || "",
      writeRisk: isWriteTool(tool),
      filesystemRisk: isFilesystemTool(tool),
      shellRisk: isShellTool(tool),
      secretRisk: isSecretTool(tool),
      promptInjectionHits: promptInjectionHits(tool),
      params: Object.keys((getSchema(tool).properties || {})).length,
      required: (getSchema(tool).required || []).length
    }))
  };
}

function extractSseJson(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");

  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {}
  }

  return null;
}

async function parseMcpResponse(response) {
  const sessionId = response.headers.get("mcp-session-id") || response.headers.get("Mcp-Session-Id") || "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`MCP server returned HTTP ${response.status}: ${text.slice(0, 220) || response.statusText}`);
  }

  if (!text.trim()) return { json: null, sessionId };

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = extractSseJson(text);
  }

  if (!json) throw new Error("Could not parse MCP response as JSON or SSE data JSON.");
  if (json.error) throw new Error(json.error.message || pretty(json.error));

  return { json, sessionId };
}

function authHeaders(token = "") {
  const value = String(token || "").trim();
  if (!value) return {};
  return { "Authorization": value.toLowerCase().startsWith("bearer ") ? value : `Bearer ${value}` };
}

async function callMcp(serverUrl, payload, sessionId = "", token = "") {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
      ...authHeaders(token),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify(payload)
  });

  return parseMcpResponse(response);
}

async function fetchToolsFromServer(serverUrl, token = "") {
  if (!/^https?:\/\//i.test(serverUrl)) {
    throw new Error("Server URL must start with http:// or https://");
  }

  const initializePayload = {
    jsonrpc: "2.0",
    id: `init-${Date.now()}`,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-install-guard-cli", version: VERSION }
    }
  };

  const toolsPayload = {
    jsonrpc: "2.0",
    id: `tools-${Date.now()}`,
    method: "tools/list",
    params: {}
  };

  try {
    const init = await callMcp(serverUrl, initializePayload, "", token);
    const sessionId = init.sessionId || "";
    try {
      await callMcp(serverUrl, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId, token);
    } catch {}
    const listed = await callMcp(serverUrl, toolsPayload, sessionId, token);
    const tools = normalizeTools(listed.json);
    return { value: listed.json, behaviorTests: await runHttpBehaviorTests(serverUrl, tools, sessionId, token) };
  } catch {
    const listed = await callMcp(serverUrl, toolsPayload, "", token);
    const tools = normalizeTools(listed.json);
    return { value: listed.json, behaviorTests: await runHttpBehaviorTests(serverUrl, tools, "", token) };
  }
}

async function runHttpBehaviorTests(serverUrl, tools, sessionId, token = "") {
  const tests = [];
  for (const tool of tools) {
    const risky = isWriteTool(tool) || isShellTool(tool);
    const safeMode = supportsSafeMode(tool);
    if (risky && !safeMode) {
      tests.push({
        tool: tool.name || "(missing)",
        status: "skipped",
        reason: "risk_protection",
        detail: "Skipped mutating or command-execution tool without dryRun/previewOnly."
      });
      continue;
    }
    const started = Date.now();
    const args = buildSampleArguments(tool);
    try {
      await callMcp(serverUrl, {
        jsonrpc: "2.0",
        id: `call-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        method: "tools/call",
        params: { name: tool.name, arguments: args }
      }, sessionId, token);
      tests.push({ tool: tool.name || "(missing)", status: "passed", ms: Date.now() - started, arguments: args });
    } catch (error) {
      tests.push({ tool: tool.name || "(missing)", status: "failed", ms: Date.now() - started, arguments: args, error: error.message });
    }
  }
  return tests;
}

function sendStdioMessage(child, payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function parseStdioLine(line) {
  try {
    const message = JSON.parse(line);
    if (message && typeof message === "object") return message;
  } catch {}
  return null;
}

async function fetchToolsFromStdioConfig(config) {
  if (!config || typeof config !== "object") throw new Error("stdio config must be an object.");
  if (!config.command || typeof config.command !== "string") throw new Error("stdio config requires command.");

  const { spawn } = await import("node:child_process");
  const child = spawn(config.command, Array.isArray(config.args) ? config.args : [], {
    cwd: config.cwd || process.cwd(),
    env: { ...process.env, ...(config.env || {}) },
    stdio: ["pipe", "pipe", "pipe"],
    shell: config.shell === true
  });

  let buffer = "";
  let stderr = "";
  const pending = new Map();
  const timer = setTimeout(() => {
    for (const { reject } of pending.values()) reject(new Error("stdio request timeout"));
    pending.clear();
    child.kill();
  }, 15000);

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const message = parseStdioLine(line.trim());
      if (!message || !message.id || !pending.has(message.id)) continue;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message);
    }
  });

  child.on("exit", (code) => {
    for (const { reject } of pending.values()) reject(new Error(`stdio MCP server exited with code ${code}. ${stderr}`));
    pending.clear();
  });

  function request(method, params) {
    const id = `${method}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params };
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    sendStdioMessage(child, payload);
    return promise;
  }

  try {
    await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-install-guard-cli", version: VERSION }
    });
    sendStdioMessage(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const listed = await request("tools/list", {});
    const value = listed.result || listed;
    const tools = normalizeTools(value);
    const behaviorTests = [];
    for (const tool of tools) {
      const risky = isWriteTool(tool) || isShellTool(tool);
      const safeMode = supportsSafeMode(tool);
      if (risky && !safeMode) {
        behaviorTests.push({
          tool: tool.name || "(missing)",
          status: "skipped",
          reason: "risk_protection",
          detail: "Skipped mutating or command-execution tool without dryRun/previewOnly."
        });
        continue;
      }
      const started = Date.now();
      const args = buildSampleArguments(tool);
      try {
        await request("tools/call", { name: tool.name, arguments: args });
        behaviorTests.push({ tool: tool.name || "(missing)", status: "passed", ms: Date.now() - started, arguments: args });
      } catch (error) {
        behaviorTests.push({ tool: tool.name || "(missing)", status: "failed", ms: Date.now() - started, arguments: args, error: error.message });
      }
    }
    return { value, behaviorTests };
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

async function loadInput(args) {
  const inputCount = [args.file, args.server, args.stdioConfig].filter(Boolean).length;
  if (inputCount > 1) {
    throw new Error("Use only one input: --file, --server, or --stdio-config.");
  }

  if (args.file) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(args.file, "utf8");
    return {
      source: { type: "file", path: args.file },
      value: JSON.parse(text),
      behaviorTests: []
    };
  }

  if (args.server) {
    const result = await fetchToolsFromServer(args.server, args.token);
    return {
      source: { type: "server", url: args.server },
      value: result.value,
      behaviorTests: result.behaviorTests
    };
  }

  if (args.stdioConfig) {
    const fs = await import("node:fs/promises");
    const config = JSON.parse(await fs.readFile(args.stdioConfig, "utf8"));
    const result = await fetchToolsFromStdioConfig(config);
    return {
      source: { type: "stdio", path: args.stdioConfig, command: config.command || "" },
      value: result.value,
      behaviorTests: result.behaviorTests
    };
  }

  printHelp();
  process.exit(1);
}

function printSummary(report) {
  const decision = report.installDecision;
  console.log(`MCP Install Risk Report`);
  console.log(`Source: ${report.source.url || report.source.path || report.source.type || "unknown"}`);
  console.log(`Health Score: ${report.score}`);
  console.log(`Risk Score: ${report.riskScore}`);
  console.log(`Decision: ${decision.label}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`Confidence: ${report.confidence.label} - ${report.confidence.reason}`);
  console.log(`Tools: ${report.summary.tools}`);
  console.log(`Issues: ${report.summary.issues} (high ${report.summary.high}, medium ${report.summary.medium}, low ${report.summary.low})`);
  if (report.behaviorSummary.total) {
    console.log(`Behavior Tests: ${report.behaviorSummary.passed} passed, ${report.behaviorSummary.failed} failed, ${report.behaviorSummary.skipped} skipped`);
  }

  if (report.issues.length) {
    console.log(`\nFindings:`);
    for (const issue of report.issues.slice(0, 20)) {
      console.log(`- [${issue.severity}] ${issue.tool}: ${issue.title}`);
      console.log(`  Fix: ${issue.fix}`);
    }
    if (report.issues.length > 20) {
      console.log(`- ... ${report.issues.length - 20} more findings`);
    }
  }
}

function buildMarkdownReport(report) {
  const source = report.source.url || report.source.path || report.source.command || report.source.type || "unknown";
  const findings = report.issues.length
    ? report.issues.map((issue) => `- **[${issue.severity}] ${issue.tool}**: ${issue.title}\n  - Detail: ${issue.detail}\n  - Fix: ${issue.fix}`).join("\n")
    : "- No obvious issues found.";
  return `# MCP Install Risk Report

Generated: ${report.generatedAt}
Source: ${source}

## Decision

- Health Score: ${report.score}
- Risk Score: ${report.riskScore}
- Install Decision: ${report.installDecision.label}
- Reason: ${report.installDecision.reason}
- Confidence: ${report.confidence.label} - ${report.confidence.reason}

## Summary

- Tools: ${report.summary.tools}
- Issues: ${report.summary.issues}
- High: ${report.summary.high}
- Medium: ${report.summary.medium}
- Low: ${report.summary.low}
- Behavior Tests: ${report.behaviorSummary.passed} passed, ${report.behaviorSummary.failed} failed, ${report.behaviorSummary.skipped} skipped

## Findings

${findings}
`;
}

function shouldFail(report, rule) {
  if (!rule) return false;
  if (rule === "high") return report.summary.high > 0;
  if (rule === "medium") return report.summary.high > 0 || report.summary.medium > 0;
  if (rule.startsWith("risk:")) {
    const threshold = Number(rule.slice("risk:".length));
    if (!Number.isFinite(threshold)) throw new Error(`Invalid fail-on rule: ${rule}`);
    return report.riskScore >= threshold;
  }
  throw new Error(`Unsupported fail-on rule: ${rule}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const input = await loadInput(args);
  const tools = normalizeTools(input.value);
  const report = scanTools(tools, input.source, input.behaviorTests || []);

  if (args.out) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(args.out, `${pretty(report)}\n`, "utf8");
  }

  if (args.outMd) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(args.outMd, buildMarkdownReport(report), "utf8");
  }

  if (args.json) {
    console.log(pretty(report));
  } else {
    printSummary(report);
    if (args.out) console.log(`\nJSON report written to ${args.out}`);
    if (args.outMd) console.log(`Markdown report written to ${args.outMd}`);
  }

  if (shouldFail(report, args.failOn)) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
