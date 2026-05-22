import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export function candidateConfigPaths() {
  const home = os.homedir();
  const paths = [];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    paths.push(path.join(appData, 'Claude', 'claude_desktop_config.json'));
    paths.push(path.join(appData, 'Cursor', 'User', 'mcp.json'));
  } else if (process.platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json'));
  } else {
    paths.push(path.join(home, '.config', 'Claude', 'claude_desktop_config.json'));
    paths.push(path.join(home, '.config', 'Cursor', 'User', 'mcp.json'));
  }
  paths.push(path.join(process.cwd(), 'mcp.json'));
  paths.push(path.join(process.cwd(), 'claude_desktop_config.json'));
  return paths;
}

export async function discoverConfigs(extraPaths = []) {
  const found = [];
  for (const file of [...candidateConfigPaths(), ...extraPaths]) {
    if (await exists(file)) found.push(file);
  }
  return found;
}

export async function extractStdioConfigsFromClaude(file) {
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const servers = raw.mcpServers || raw.servers || {};
  return Object.entries(servers).map(([name, config]) => ({ name, config }));
}
