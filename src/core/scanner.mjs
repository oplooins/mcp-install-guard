import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

export const VERSION = '0.3.0-beta.1';

export function pretty(value) {
  return JSON.stringify(value, null, 2);
}

export function normalizeTools(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.tools)) return value.tools;
  if (value.result && Array.isArray(value.result.tools)) return value.result.tools;
  if (value.params && Array.isArray(value.params.tools)) return value.params.tools;
  throw new Error('No tools array found. Provide a tools/list response JSON or a tools array.');
}

export function getSchema(tool) {
  return tool.inputSchema || tool.schema || tool.parameters || {};
}

function severityWeight(severity) {
  if (severity === 'high') return 16;
  if (severity === 'medium') return 8;
  return 3;
}

function addIssue(issues, severity, tool, title, detail, fix) {
  issues.push({ severity, tool: tool?.name || 'server', title, detail, fix });
}

export function isWriteTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  return /\b(create|update|delete|remove|send|write|insert|drop|alter|charge|refund|payment|email|message|post|put|patch)\b/.test(text);
}

export function isFilesystemTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  return /\b(file|filesystem|directory|path|read_file|write_file|delete_file|fs|folder)\b/.test(text);
}

export function isShellTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  return /\b(shell|terminal|command|exec|execute|powershell|bash|cmd|spawn|subprocess)\b/.test(text);
}

export function isNetworkTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''} ${pretty(getSchema(tool))}`.toLowerCase();
  return /\b(http|https|webhook|url|fetch|request|api|endpoint|post|get|external|internet)\b/.test(text);
}

export function isSecretTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''} ${pretty(getSchema(tool))}`.toLowerCase();
  return /\b(secret|token|api key|apikey|password|credential|private key|env|environment variable|bearer|jwt)\b/.test(text);
}

export function promptInjectionHits(tool) {
  const text = `${tool.name || ''}\n${tool.description || ''}\n${pretty(getSchema(tool))}`.toLowerCase();
  const patterns = [
    'ignore previous instructions',
    'ignore all previous instructions',
    'reveal secrets',
    'exfiltrate',
    'system prompt',
    'developer message',
    'send token',
    'api key',
    'bypass safety',
    'hidden instruction',
    'do not tell the user',
    'override policy',
    'disable safety',
    'steal',
    '忽略之前',
    '泄露',
    '系统提示',
    '隐藏指令',
    '发送密钥'
  ];
  return patterns.filter((pattern) => text.includes(pattern));
}

export function capabilitySet(toolInfo) {
  const caps = [];
  if (toolInfo.shellRisk) caps.push('shell');
  if (toolInfo.filesystemRisk) caps.push('filesystem');
  if (toolInfo.writeRisk) caps.push('mutation');
  if (toolInfo.secretRisk) caps.push('secrets');
  if (toolInfo.networkRisk) caps.push('network');
  if ((toolInfo.promptInjectionHits || []).length) caps.push('prompt-injection');
  return caps;
}

function getInstallDecision(score, riskScore, high, medium) {
  if (high >= 3 || riskScore >= 70 || score < 45) {
    return { label: 'do-not-install', level: 'high', reason: 'Too many high-risk findings. Fix before install or production use.' };
  }
  if (high > 0 || riskScore >= 45 || score < 70) {
    return { label: 'fix-before-install', level: 'medium', reason: 'High-risk or quality issues were found. Do not use directly in production.' };
  }
  if (medium > 0 || riskScore >= 20) {
    return { label: 'test-install-only', level: 'low', reason: 'No critical risk, but test in a restricted environment first.' };
  }
  return { label: 'install-recommended', level: 'low', reason: 'No obvious risk found. Keep least-privilege permissions.' };
}

function summarizeBehaviorTests(behaviorTests = []) {
  return {
    total: behaviorTests.length,
    passed: behaviorTests.filter((test) => test.status === 'passed').length,
    failed: behaviorTests.filter((test) => test.status === 'failed').length,
    skipped: behaviorTests.filter((test) => test.status === 'skipped').length
  };
}

function getConfidence(source, behaviorSummary) {
  if (!source || source.type === 'file' || source.type === 'demo') {
    return { label: 'medium', reason: 'Only tools/list metadata was analyzed; no live behavior test was run.' };
  }
  if (!behaviorSummary.total) {
    return { label: 'medium', reason: 'Connected to a live server, but behavior tests did not run.' };
  }
  if (behaviorSummary.failed > 0) {
    return { label: 'medium', reason: 'Behavior tests ran, but at least one tool failed.' };
  }
  if (behaviorSummary.skipped > 0) {
    return { label: 'high', reason: 'Low-risk tools passed behavior tests; risky tools were skipped by safety policy.' };
  }
  return { label: 'high', reason: 'Connected to a live server and completed behavior tests.' };
}

export function scanTools(tools, source = {}, behaviorTests = []) {
  const issues = [];
  const names = new Set();
  const duplicateNames = new Set();

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') {
      addIssue(issues, 'high', null, 'Invalid tool entry', 'The tools array contains a non-object entry.', 'Remove invalid entries.');
      continue;
    }

    if (!tool.name || typeof tool.name !== 'string') {
      addIssue(issues, 'high', tool, 'Missing tool name', 'Clients cannot reliably identify a tool without name.', 'Add a unique, stable tool name.');
    } else {
      if (names.has(tool.name)) duplicateNames.add(tool.name);
      names.add(tool.name);
      if (tool.name.length < 4) addIssue(issues, 'medium', tool, 'Tool name is too short', 'Very short names are hard for AI clients and developers to understand.', 'Use verb + object, such as search_docs or create_ticket.');
      if (!/^[a-zA-Z][a-zA-Z0-9_-]+$/.test(tool.name)) addIssue(issues, 'medium', tool, 'Tool name format is unstable', 'Spaces or special characters may reduce client compatibility.', 'Use letters, numbers, underscore, or dash, starting with a letter.');
    }

    if (!tool.description || String(tool.description).trim().length < 18) addIssue(issues, 'medium', tool, 'Description is unclear', 'A short or missing description makes tool selection unreliable.', 'Explain what the tool does, when to use it, and what it returns.');

    const injectionHits = promptInjectionHits(tool);
    if (injectionHits.length) addIssue(issues, 'high', tool, 'Possible prompt injection in description/schema', `Suspicious phrases found: ${injectionHits.join(', ')}.`, 'Remove instruction-like text from descriptions. Descriptions should only explain tool behavior.');

    const schema = getSchema(tool);
    if (!schema || typeof schema !== 'object' || Object.keys(schema).length === 0) {
      addIssue(issues, 'high', tool, 'Missing inputSchema', 'Without a parameter schema, clients cannot build reliable calls.', 'Add JSON Schema with type, properties, and required.');
      continue;
    }

    if (schema.type && schema.type !== 'object') addIssue(issues, 'medium', tool, 'inputSchema type is not object', 'Most MCP tool arguments should be object-shaped.', 'Set inputSchema.type to object.');

    const properties = schema.properties || {};
    const required = schema.required || [];

    if (!schema.properties || Object.keys(properties).length === 0) addIssue(issues, 'medium', tool, 'Empty schema properties', 'Missing parameter descriptions reduce testability and usability.', 'Add type and description for each parameter.');

    for (const key of required) {
      if (!properties[key]) addIssue(issues, 'high', tool, 'Required parameter is undefined', `${key} is required but not defined in properties.`, 'Define this property or remove it from required.');
    }

    for (const [key, prop] of Object.entries(properties)) {
      if (!prop.type) addIssue(issues, 'medium', tool, 'Parameter missing type', `${key} has no declared type.`, 'Add string, number, boolean, array, or object.');
      if (!prop.description || String(prop.description).trim().length < 8) addIssue(issues, 'low', tool, 'Parameter description is weak', `${key} has an unclear or missing description.`, 'Explain meaning, expected format, and limits.');
    }

    if (isWriteTool(tool) && !(properties.confirm || properties.confirmation || properties.dryRun || properties.previewOnly)) addIssue(issues, 'high', tool, 'Write-like tool lacks confirmation', 'This tool appears to write, delete, send, charge, or mutate state without a confirm/dryRun parameter.', 'Add confirm, dryRun, or previewOnly and enforce it server-side.');
    if (isFilesystemTool(tool) && !(properties.allowedPath || properties.baseDir || properties.rootDir || properties.pathAllowlist)) addIssue(issues, 'medium', tool, 'Filesystem tool lacks path restriction', 'File tools without root directory or allowlist can access unexpected local files.', 'Add baseDir, rootDir, or pathAllowlist and enforce it server-side.');
    if (isShellTool(tool) && !(properties.dryRun || properties.confirm || properties.commandAllowlist || properties.allowedCommands)) addIssue(issues, 'high', tool, 'Command execution tool lacks safeguards', 'Shell/command tools are high-risk without dryRun, confirmation, or command allowlists.', 'Add commandAllowlist, dryRun, and confirm. Run with least privileges.');
    if (isSecretTool(tool)) addIssue(issues, 'medium', tool, 'Tool references secrets or credentials', 'The tool description/schema references tokens, API keys, passwords, credentials, or env.', 'Avoid returning secrets, redact outputs, and use least-privilege tokens.');
    if (/\b(sql|database|db)\b/.test(`${tool.name || ''} ${tool.description || ''}`.toLowerCase()) && !properties.readOnly && !properties.statementType) addIssue(issues, 'high', tool, 'Database tool lacks read-only constraint', 'Database tools without explicit read-only constraints are high-risk.', 'Add readOnly=true, statementType restrictions, or reject write SQL server-side.');
  }

  for (const name of duplicateNames) addIssue(issues, 'high', { name }, 'Duplicate tool name', `Duplicate name: ${name}.`, 'Rename tools so every name is unique within the server.');
  for (const test of behaviorTests) {
    if (test.status === 'failed') addIssue(issues, 'high', { name: test.tool }, 'Tool behavior test failed', `Safe sample tools/call failed: ${test.error || 'unknown error'}`, 'Check tool schema, permissions, authentication, and runtime exceptions.');
  }

  const high = issues.filter((issue) => issue.severity === 'high').length;
  const medium = issues.filter((issue) => issue.severity === 'medium').length;
  const low = issues.filter((issue) => issue.severity === 'low').length;
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
    summary: { tools: tools.length, high, medium, low, issues: issues.length },
    issues,
    tools: tools.map((tool) => ({
      name: tool.name || '(missing)',
      description: tool.description || '',
      writeRisk: isWriteTool(tool),
      filesystemRisk: isFilesystemTool(tool),
      shellRisk: isShellTool(tool),
      secretRisk: isSecretTool(tool),
      networkRisk: isNetworkTool(tool),
      promptInjectionHits: promptInjectionHits(tool),
      params: Object.keys((getSchema(tool).properties || {})).length,
      required: (getSchema(tool).required || []).length
    }))
  };
}

function extractSseJson(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter((line) => line && line !== '[DONE]');
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

async function parseMcpResponse(response) {
  const sessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id') || '';
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP server returned HTTP ${response.status}: ${text.slice(0, 220) || response.statusText}`);
  if (!text.trim()) return { json: null, sessionId };
  let json = null;
  try { json = JSON.parse(text); } catch { json = extractSseJson(text); }
  if (!json) throw new Error('Could not parse MCP response as JSON or SSE data JSON.');
  if (json.error) throw new Error(json.error.message || pretty(json.error));
  return { json, sessionId };
}

function authHeaders(token = '') {
  const value = String(token || '').trim();
  if (!value) return {};
  return { Authorization: value.toLowerCase().startsWith('bearer ') ? value : `Bearer ${value}` };
}

async function callMcp(serverUrl, payload, sessionId = '', token = '') {
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
      ...authHeaders(token),
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });
  return parseMcpResponse(response);
}

function sampleValueForParam(name, schema = {}) {
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const lower = String(name).toLowerCase();
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  if (lower.includes('email')) return 'test@example.com';
  if (lower.includes('url') || lower.includes('webhook')) return 'https://example.com';
  if (lower.includes('path') || lower.includes('file')) return 'README.md';
  if (lower.includes('query') || lower.includes('search')) return 'test';
  if (lower.includes('id')) return 'test-id';
  return 'test';
}

function supportsSafeMode(tool) {
  const properties = getSchema(tool).properties || {};
  return Boolean(properties.dryRun || properties.previewOnly);
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

async function runHttpBehaviorTests(serverUrl, tools, sessionId, token = '') {
  const tests = [];
  for (const tool of tools) {
    const risky = isWriteTool(tool) || isShellTool(tool);
    if (risky && !supportsSafeMode(tool)) {
      tests.push({ tool: tool.name || '(missing)', status: 'skipped', reason: 'risk_protection', detail: 'Skipped mutating or command-execution tool without dryRun/previewOnly.' });
      continue;
    }
    const args = buildSampleArguments(tool);
    const started = Date.now();
    try {
      await callMcp(serverUrl, { jsonrpc: '2.0', id: `call-${Date.now()}`, method: 'tools/call', params: { name: tool.name, arguments: args } }, sessionId, token);
      tests.push({ tool: tool.name || '(missing)', status: 'passed', ms: Date.now() - started, arguments: args });
    } catch (error) {
      tests.push({ tool: tool.name || '(missing)', status: 'failed', ms: Date.now() - started, arguments: args, error: error.message });
    }
  }
  return tests;
}

export async function fetchToolsFromHttpServer(serverUrl, token = '', behavior = true) {
  if (!/^https?:\/\//i.test(serverUrl)) throw new Error('server URL must start with http:// or https://');
  let sessionId = '';
  try {
    const init = await callMcp(serverUrl, { jsonrpc: '2.0', id: `init-${Date.now()}`, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-install-guard', version: VERSION } } }, '', token);
    sessionId = init.sessionId || '';
    try { await callMcp(serverUrl, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId, token); } catch {}
  } catch {}
  const listed = await callMcp(serverUrl, { jsonrpc: '2.0', id: `tools-${Date.now()}`, method: 'tools/list', params: {} }, sessionId, token);
  const tools = normalizeTools(listed.json);
  const behaviorTests = behavior ? await runHttpBehaviorTests(serverUrl, tools, sessionId, token) : [];
  return { tools, behaviorTests };
}

function sendLine(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitForJsonLine(child, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('stdio MCP server timed out')), timeoutMs);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          clearTimeout(timer);
          resolve(JSON.parse(line));
          return;
        } catch {}
      }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      if (code && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`stdio MCP server exited with code ${code}`));
      }
    });
  });
}

export async function fetchToolsFromStdioConfig(config, behavior = true) {
  if (!config.command) throw new Error('stdio config must include command');
  const child = spawn(config.command, config.args || [], { cwd: config.cwd || process.cwd(), env: { ...process.env, ...(config.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    sendLine(child, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-install-guard', version: VERSION } } });
    await waitForJsonLine(child);
    sendLine(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    sendLine(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const listed = await waitForJsonLine(child);
    const tools = normalizeTools(listed.result || listed);
    const behaviorTests = [];
    if (behavior) {
      for (const tool of tools) {
        const risky = isWriteTool(tool) || isShellTool(tool);
        if (risky && !supportsSafeMode(tool)) {
          behaviorTests.push({ tool: tool.name || '(missing)', status: 'skipped', reason: 'risk_protection', detail: 'Skipped mutating or command-execution tool without dryRun/previewOnly.' });
          continue;
        }
        const args = buildSampleArguments(tool);
        sendLine(child, { jsonrpc: '2.0', id: `call-${Date.now()}`, method: 'tools/call', params: { name: tool.name, arguments: args } });
        const started = Date.now();
        try {
          await waitForJsonLine(child);
          behaviorTests.push({ tool: tool.name || '(missing)', status: 'passed', ms: Date.now() - started, arguments: args });
        } catch (error) {
          behaviorTests.push({ tool: tool.name || '(missing)', status: 'failed', ms: Date.now() - started, arguments: args, error: error.message });
        }
      }
    }
    return { tools, behaviorTests };
  } finally {
    child.kill();
  }
}

export async function loadInput(args) {
  if (args.demo) {
    const demo = JSON.parse(await fs.readFile(new URL('../../examples/sample-tools-list.json', import.meta.url), 'utf8'));
    return { source: { type: 'demo', path: 'examples/sample-tools-list.json' }, tools: normalizeTools(demo), behaviorTests: [] };
  }
  if (args.file) {
    const raw = JSON.parse(await fs.readFile(args.file, 'utf8'));
    return { source: { type: 'file', path: args.file }, tools: normalizeTools(raw), behaviorTests: [] };
  }
  if (args.stdioConfig) {
    const config = JSON.parse(await fs.readFile(args.stdioConfig, 'utf8'));
    const result = await fetchToolsFromStdioConfig(config, !args.noBehavior);
    return { source: { type: 'stdio', path: args.stdioConfig, command: config.command || '' }, ...result };
  }
  if (args.server) {
    const result = await fetchToolsFromHttpServer(args.server, args.token || '', !args.noBehavior);
    return { source: { type: 'server', url: args.server }, ...result };
  }
  throw new Error('Missing input. Use --demo, --file, --server, or --stdio-config.');
}

export function compareBaseline(current, baseline = {}) {
  const previousTools = new Map((baseline.tools || []).map((tool) => [tool.name, tool]));
  const changes = [];
  for (const tool of current.tools || []) {
    const prev = previousTools.get(tool.name);
    if (!prev) {
      changes.push({ type: 'new-tool', severity: 'medium', tool: tool.name, detail: 'Tool is new compared with baseline.' });
      continue;
    }
    const before = new Set(capabilitySet(prev));
    for (const cap of capabilitySet(tool)) {
      if (!before.has(cap)) changes.push({ type: 'new-capability', severity: cap === 'shell' || cap === 'mutation' ? 'high' : 'medium', tool: tool.name, capability: cap, detail: `New capability added: ${cap}.` });
    }
  }
  for (const name of previousTools.keys()) {
    if (!(current.tools || []).some((tool) => tool.name === name)) changes.push({ type: 'removed-tool', severity: 'low', tool: name, detail: 'Tool was removed compared with baseline.' });
  }
  if (Number.isFinite(baseline.riskScore) && current.riskScore > baseline.riskScore) changes.push({ type: 'risk-score-increase', severity: 'medium', tool: 'server', detail: `Risk score increased from ${baseline.riskScore} to ${current.riskScore}.` });
  return changes;
}
