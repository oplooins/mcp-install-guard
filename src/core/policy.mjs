import fs from 'node:fs/promises';
import { capabilitySet } from './scanner.mjs';

export const DEFAULT_POLICY = {
  maxRiskScore: 60,
  deny: ['shell', 'mutation', 'secrets', 'prompt-injection'],
  allowTools: [],
  denyTools: []
};

export async function loadPolicy(path) {
  if (!path) return DEFAULT_POLICY;
  const raw = JSON.parse(await fs.readFile(path, 'utf8'));
  return { ...DEFAULT_POLICY, ...raw };
}

export function applyPolicy(report, policy = DEFAULT_POLICY) {
  const violations = [];
  const deny = Array.isArray(policy.deny) ? policy.deny.map(String) : [];
  const allowTools = new Set(Array.isArray(policy.allowTools) ? policy.allowTools : []);
  const denyTools = new Set(Array.isArray(policy.denyTools) ? policy.denyTools : []);

  if (Number.isFinite(policy.maxRiskScore) && report.riskScore > policy.maxRiskScore) {
    violations.push({ severity: 'high', rule: 'maxRiskScore', target: 'report', detail: `Risk score ${report.riskScore} exceeds maxRiskScore ${policy.maxRiskScore}.` });
  }

  for (const tool of report.tools || []) {
    if (allowTools.has(tool.name)) continue;
    if (denyTools.has(tool.name)) violations.push({ severity: 'high', rule: 'denyTools', target: tool.name, detail: `Tool ${tool.name} is explicitly denied.` });
    const caps = capabilitySet(tool);
    for (const rule of deny) {
      if (rule === 'shell' && caps.includes('shell')) violations.push({ severity: 'high', rule, target: tool.name, detail: 'Tool exposes shell or command execution.' });
      if ((rule === 'mutation' || rule === 'write') && caps.includes('mutation')) violations.push({ severity: 'high', rule, target: tool.name, detail: 'Tool can mutate state, send, write, delete, or update.' });
      if ((rule === 'secrets' || rule === 'credential-exposure') && caps.includes('secrets')) violations.push({ severity: 'medium', rule, target: tool.name, detail: 'Tool references secrets, tokens, passwords, credentials, or env.' });
      if ((rule === 'filesystem' || rule === 'filesystem-write') && caps.includes('filesystem')) violations.push({ severity: rule === 'filesystem-write' && !caps.includes('mutation') ? 'medium' : 'high', rule, target: tool.name, detail: 'Tool exposes filesystem capability.' });
      if (rule === 'network' && caps.includes('network')) violations.push({ severity: 'medium', rule, target: tool.name, detail: 'Tool references external network, URLs, APIs, or webhooks.' });
      if (rule === 'prompt-injection' && caps.includes('prompt-injection')) violations.push({ severity: 'high', rule, target: tool.name, detail: 'Tool description or schema contains prompt-injection-like text.' });
    }
  }
  return violations;
}

export function shouldFail(report, rule = 'high') {
  if (!rule) return false;
  if (rule === 'policy') return (report.policyViolations || []).length > 0;
  if (rule === 'diff') return (report.permissionDiff || []).some((item) => item.severity === 'high' || item.severity === 'medium');
  if (rule === 'high') return report.summary.high > 0;
  if (rule === 'medium') return report.summary.high > 0 || report.summary.medium > 0;
  if (rule.startsWith('risk:')) {
    const threshold = Number(rule.slice('risk:'.length));
    if (!Number.isFinite(threshold)) throw new Error(`Invalid fail-on rule: ${rule}`);
    return report.riskScore >= threshold;
  }
  throw new Error(`Unsupported fail-on rule: ${rule}`);
}
