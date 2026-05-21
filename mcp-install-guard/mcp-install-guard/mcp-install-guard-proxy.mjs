#!/usr/bin/env node

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8787);
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const VERSION = "0.1.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body, null, 2));
}

function classifyError(error) {
  const message = error?.message || String(error);
  if (/serverUrl must start|invalid url/i.test(message)) {
    return { code: "invalid_url", hint: "MCP server 地址必须是 http:// 或 https:// 开头。" };
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|Failed to fetch/i.test(message)) {
    return { code: "connection_failed", hint: "目标地址没有运行 MCP HTTP server，或端口/路径填错。" };
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return { code: "auth_required", hint: "目标 MCP server 需要认证。填写 Bearer token 后重试。" };
  }
  if (/timeout|aborted/i.test(message)) {
    return { code: "timeout", hint: "目标 server 响应超时，确认 server 是否卡住或网络不可达。" };
  }
  if (/parse|JSON|SSE/i.test(message)) {
    return { code: "invalid_mcp_response", hint: "目标地址有响应，但不像 MCP JSON-RPC / SSE 响应。" };
  }
  if (/spawn|stdio|exited/i.test(message)) {
    return { code: "stdio_failed", hint: "stdio MCP server 启动失败。检查 command、args 和 env。" };
  }
  return { code: "mcp_error", hint: "MCP server 返回错误。检查协议版本、路径、认证和 tools/list 支持情况。" };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
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
    throw new Error(`MCP server returned HTTP ${response.status}: ${text.slice(0, 240) || response.statusText}`);
  }

  if (!text.trim()) return { json: null, sessionId };

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = extractSseJson(text);
  }

  if (!json) throw new Error("Could not parse MCP response as JSON or SSE data JSON.");
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

  return { json, sessionId };
}

function authHeaders(authToken = "") {
  const token = String(authToken || "").trim();
  if (!token) return {};
  return { "Authorization": token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}` };
}

async function callMcp(serverUrl, payload, sessionId = "", authToken = "") {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
      ...authHeaders(authToken),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });

  return parseMcpResponse(response);
}

function getSchema(tool) {
  return tool.inputSchema || tool.schema || tool.parameters || {};
}

function schemaProperties(tool) {
  return getSchema(tool).properties || {};
}

function isRiskyTool(tool) {
  const text = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
  return /\b(create|update|delete|remove|send|write|insert|drop|alter|charge|refund|payment|email|message|shell|terminal|command|exec|execute|powershell|bash|cmd)\b/.test(text);
}

function supportsSafeMode(tool) {
  const properties = schemaProperties(tool);
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

  for (const key of required) {
    args[key] = sampleValueForParam(key, properties[key] || {});
  }

  if (properties.dryRun) args.dryRun = true;
  if (properties.previewOnly) args.previewOnly = true;
  if (properties.confirm) args.confirm = false;
  if (properties.confirmation) args.confirmation = false;

  return args;
}

async function runHttpBehaviorTests(serverUrl, tools, sessionId, authToken = "") {
  const tests = [];

  for (const tool of tools) {
    const risky = isRiskyTool(tool);
    const safeMode = supportsSafeMode(tool);
    if (risky && !safeMode) {
      tests.push({
        tool: tool.name || "(missing)",
        status: "skipped",
        reason: "risk_protection",
        detail: "Skipped because this looks like a mutating or command-execution tool without dryRun/previewOnly."
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
      }, sessionId, authToken);
      tests.push({
        tool: tool.name || "(missing)",
        status: "passed",
        ms: Date.now() - started,
        arguments: args
      });
    } catch (error) {
      tests.push({
        tool: tool.name || "(missing)",
        status: "failed",
        ms: Date.now() - started,
        arguments: args,
        error: error.message
      });
    }
  }

  return tests;
}

async function fetchToolsFromHttpServer(serverUrl, authToken = "", runBehaviorTests = true) {
  if (!/^https?:\/\//i.test(serverUrl)) {
    throw new Error("serverUrl must start with http:// or https://");
  }

  const initializePayload = {
    jsonrpc: "2.0",
    id: `init-${Date.now()}`,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-install-guard-proxy", version: VERSION }
    }
  };

  const toolsPayload = {
    jsonrpc: "2.0",
    id: `tools-${Date.now()}`,
    method: "tools/list",
    params: {}
  };

  try {
    const init = await callMcp(serverUrl, initializePayload, "", authToken);
    const sessionId = init.sessionId || "";
    try {
      await callMcp(serverUrl, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId, authToken);
    } catch {}
    const listed = await callMcp(serverUrl, toolsPayload, sessionId, authToken);
    const tools = listed.json?.result?.tools || listed.json?.tools || [];
    return {
      toolsResult: listed.json,
      behaviorTests: runBehaviorTests ? await runHttpBehaviorTests(serverUrl, tools, sessionId, authToken) : []
    };
  } catch {
    const listed = await callMcp(serverUrl, toolsPayload, "", authToken);
    const tools = listed.json?.result?.tools || listed.json?.tools || [];
    return {
      toolsResult: listed.json,
      behaviorTests: runBehaviorTests ? await runHttpBehaviorTests(serverUrl, tools, "", authToken) : []
    };
  }
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

async function fetchToolsFromStdioConfig(config, runBehaviorTests = true) {
  if (!config || typeof config !== "object") throw new Error("stdio config must be an object.");
  const command = config.command;
  const args = Array.isArray(config.args) ? config.args : [];
  const env = config.env && typeof config.env === "object" ? config.env : {};
  const cwd = config.cwd || ROOT;
  if (!command || typeof command !== "string") throw new Error("stdio config requires command.");

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
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
    const payload = params === undefined
      ? { jsonrpc: "2.0", id, method }
      : { jsonrpc: "2.0", id, method, params };
    const promise = new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    });
    sendStdioMessage(child, payload);
    return promise;
  }

  try {
    await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-install-guard-proxy", version: VERSION }
    });
    sendStdioMessage(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const listed = await request("tools/list", {});
    const toolsResult = listed.result || listed;
    const tools = toolsResult.tools || [];
    const behaviorTests = [];

    if (runBehaviorTests) {
      for (const tool of tools) {
        const risky = isRiskyTool(tool);
        const safeMode = supportsSafeMode(tool);
        if (risky && !safeMode) {
          behaviorTests.push({
            tool: tool.name || "(missing)",
            status: "skipped",
            reason: "risk_protection",
            detail: "Skipped because this looks like a mutating or command-execution tool without dryRun/previewOnly."
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
    }

    return { toolsResult, behaviorTests };
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname === "/" ? "/mcp-health-checker.html" : url.pathname;
  const filePath = resolve(ROOT, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      jsonResponse(res, 200, { ok: true, name: "mcp-install-guard-proxy", version: VERSION });
      return;
    }

    if (req.method === "POST" && req.url === "/api/scan-server") {
      const body = await readJsonBody(req);
      const serverUrl = String(body.serverUrl || "").trim();
      const authToken = String(body.authToken || "").trim();
      const result = await fetchToolsFromHttpServer(serverUrl, authToken, body.behaviorTests !== false);
      jsonResponse(res, 200, {
        ok: true,
        source: { type: "server", url: serverUrl, via: "local-proxy" },
        toolsResult: result.toolsResult,
        behaviorTests: result.behaviorTests
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/scan-stdio") {
      const body = await readJsonBody(req);
      const result = await fetchToolsFromStdioConfig(body.config, body.behaviorTests !== false);
      jsonResponse(res, 200, {
        ok: true,
        source: { type: "stdio", via: "local-proxy", command: body.config?.command || "" },
        toolsResult: result.toolsResult,
        behaviorTests: result.behaviorTests
      });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    jsonResponse(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const diagnostic = classifyError(error);
    jsonResponse(res, 500, { ok: false, error: error.message, ...diagnostic });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`MCP Install Guard local proxy running at http://127.0.0.1:${PORT}`);
  console.log(`Open http://127.0.0.1:${PORT}/mcp-health-checker.html`);
});
