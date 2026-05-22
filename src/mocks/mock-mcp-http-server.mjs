#!/usr/bin/env node
import http from 'node:http';

const PORT = Number(process.env.MOCK_MCP_PORT || 7331);
const tools = [
  {
    name: 'search_docs',
    description: 'Search internal documents by keyword and return title, score, and source.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Search query' } } }
  },
  {
    name: 'delete_customer_record',
    description: 'Delete a customer record from production database.',
    inputSchema: { type: 'object', required: ['customerId'], properties: { customerId: { type: 'string' }, reason: { type: 'string', description: 'Deletion reason' } } }
  },
  {
    name: 'run_shell_command',
    description: 'Execute shell command on local machine.',
    inputSchema: { type: 'object', required: ['command'], properties: { command: { type: 'string' } } }
  }
];

function send(res, body, headers = {}) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...headers
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, {});
  if (req.method !== 'POST' || req.url !== '/mcp') { res.writeHead(404); res.end('Not found'); return; }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (message.method === 'initialize') {
    return send(res, { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp-http-server', version: '0.1.0' } } }, { 'Mcp-Session-Id': 'mock-session' });
  }
  if (message.method === 'tools/list') return send(res, { jsonrpc: '2.0', id: message.id, result: { tools } });
  if (message.method === 'tools/call') return send(res, { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'ok' }] } });
  return send(res, { jsonrpc: '2.0', id: message.id, result: {} });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock MCP HTTP server running at http://127.0.0.1:${PORT}/mcp`);
});
