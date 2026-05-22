#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

const ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"
]);
const SKIP_DIRS = new Set([".git", "node_modules", "coverage", "dist"]);
const SKIP_EXTENSIONS = new Set([".tgz", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf"]);
const REQUIRED_FILES = ["package.json", "cli.mjs", "gate.mjs", "README.md"];

const FIX_RULES = [
  {
    name: "Codex bundled Node path",
    pattern: /C:\\Users\\[^\\\r\n"']+\\.cache\\codex-runtimes\\[^\r\n"']*?node(?:\.exe)?/g,
    replacement: "node"
  },
  {
    name: "Escaped Codex bundled Node path",
    pattern: /C:\\\\Users\\\\[^\\\r\n"']+\\\\\.cache\\\\codex-runtimes\\\\[^\r\n"']*?node(?:\.exe)?/g,
    replacement: "node"
  },
  {
    name: "Codex workspace path",
    pattern: /C:\\Users\\[^\\\r\n"']+\\Documents\\Codex\\[^\r\n"']+/g,
    replacement: "."
  },
  {
    name: "Escaped Codex workspace path",
    pattern: /C:\\\\Users\\\\[^\\\r\n"']+\\\\Documents\\\\Codex\\\\[^\r\n"']+/g,
    replacement: "."
  }
];

const LEAK_PATTERNS = [
  { name: "Windows user path", pattern: /C:\\Users\\/ },
  { name: "Codex runtime path", pattern: /codex-runtimes/ },
  { name: "User cache path", pattern: /\\.cache|\.cache/ },
  { name: "Codex workspace path", pattern: /Documents\\Codex|Documents\/Codex/ }
];

function printHelp() {
  console.log(`
MCP Install Guard Release Doctor

Usage:
  node ./release-doctor.mjs
  node ./release-doctor.mjs --fix
  node ./release-doctor.mjs --fix --pack

Options:
  --fix       Replace known local machine paths with safe generic values
  --pack      Run npm pack and audit the generated .tgz
  --help      Show help
`);
}

function parseArgs(argv) {
  const args = { fix: false, pack: false, help: false };
  for (const arg of argv) {
    if (arg === "--fix") args.fix = true;
    else if (arg === "--pack") args.pack = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function statusIcon(ok) {
  return ok ? "OK" : "FAIL";
}

function extname(file) {
  const index = file.lastIndexOf(".");
  return index === -1 ? "" : file.slice(index).toLowerCase();
}

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(extname(file));
}

function shouldSkipFile(file) {
  if (basename(file) === "release-doctor.mjs") return true;
  if (SKIP_EXTENSIONS.has(extname(file))) return true;
  return false;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith("_audit_")) continue;
      walk(full, files);
    } else if (stat.isFile() && isTextFile(full) && !shouldSkipFile(full)) {
      files.push(rel);
    }
  }
  return files;
}

function readText(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function applyFixes(files) {
  const changes = [];
  for (const rel of files) {
    let text = readText(rel);
    const original = text;
    const applied = [];
    for (const rule of FIX_RULES) {
      if (rule.pattern.test(text)) {
        text = text.replace(rule.pattern, rule.replacement);
        applied.push(rule.name);
      }
      rule.pattern.lastIndex = 0;
    }
    if (text !== original) {
      writeFileSync(join(ROOT, rel), text, "utf8");
      changes.push({ file: rel, rules: applied });
    }
  }
  return changes;
}

function scanLeaks(files, baseDir = ROOT) {
  const leaks = [];
  for (const rel of files) {
    const full = join(baseDir, rel);
    const lines = readFileSync(full, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of LEAK_PATTERNS) {
        if (pattern.pattern.test(line)) {
          leaks.push({
            file: rel,
            line: index + 1,
            type: pattern.name,
            text: line.trim().slice(0, 180)
          });
        }
      }
    });
  }
  return leaks;
}

function runStep(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...options
  });
  const ok = result.status === 0 && !result.error;
  return {
    name,
    ok,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : ""
  };
}

function runNpm(args) {
  if (process.platform === "win32") {
    return runStep(`npm ${args.join(" ")}`, "cmd", ["/c", "npm", ...args]);
  }
  return runStep(`npm ${args.join(" ")}`, "npm", args);
}

function parsePackJson(stdout) {
  const data = JSON.parse(stdout);
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || !first.filename) throw new Error("npm pack did not return a filename.");
  return first;
}

function listPackageTextFiles(packageDir, current = packageDir, files = []) {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listPackageTextFiles(packageDir, full, files);
    } else if (stat.isFile() && isTextFile(full) && basename(full) !== "release-doctor.mjs") {
      files.push(relative(packageDir, full));
    }
  }
  return files;
}

function auditTgz(tgzPath) {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-install-guard-pack-"));
  try {
    const extracted = runStep("extract package", "tar", ["-xzf", tgzPath, "-C", tempRoot]);
    if (!extracted.ok) {
      return {
        ok: false,
        leaks: [],
        error: extracted.stderr || extracted.error || "Could not extract package."
      };
    }
    const packageDir = join(tempRoot, "package");
    const files = listPackageTextFiles(packageDir);
    const leaks = scanLeaks(files, packageDir);
    return { ok: leaks.length === 0, leaks, error: "" };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function printLeaks(leaks) {
  for (const leak of leaks.slice(0, 30)) {
    console.log(`  - ${leak.file}:${leak.line} [${leak.type}] ${leak.text}`);
  }
  if (leaks.length > 30) console.log(`  - ... ${leaks.length - 30} more`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const files = walk(ROOT);
  console.log(`Release Doctor: scanning ${files.length} text files`);

  const missing = REQUIRED_FILES.filter((file) => !files.includes(file) && !statSync(join(ROOT, file), { throwIfNoEntry: false }));
  if (missing.length) {
    console.log(`${statusIcon(false)} Required files missing: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${statusIcon(true)} Required files exist`);

  if (args.fix) {
    const changes = applyFixes(files);
    if (changes.length) {
      console.log(`${statusIcon(true)} Applied safe fixes:`);
      for (const change of changes) console.log(`  - ${change.file}: ${change.rules.join(", ")}`);
    } else {
      console.log(`${statusIcon(true)} No known local path fixes needed`);
    }
  }

  const postFixFiles = walk(ROOT);
  const workspaceLeaks = scanLeaks(postFixFiles);
  if (workspaceLeaks.length) {
    console.log(`${statusIcon(false)} Local path leaks found in workspace:`);
    printLeaks(workspaceLeaks);
    console.log("Run: node ./release-doctor.mjs --fix");
    process.exitCode = 1;
    return;
  }
  console.log(`${statusIcon(true)} No local path leaks found in workspace text files`);

  const checks = [
    runStep("node --check cli.mjs", process.execPath, ["--check", "cli.mjs"]),
    runStep("node --check gate.mjs", process.execPath, ["--check", "gate.mjs"]),
    runStep("node --check mcp-install-guard-proxy.mjs", process.execPath, ["--check", "mcp-install-guard-proxy.mjs"]),
    runStep("node cli.mjs --demo --json", process.execPath, ["cli.mjs", "--demo", "--json"])
  ];

  for (const check of checks) {
    console.log(`${statusIcon(check.ok)} ${check.name}`);
    if (!check.ok) {
      if (check.stderr.trim()) console.log(check.stderr.trim());
      if (check.error) console.log(check.error);
      process.exitCode = 1;
      return;
    }
  }

  const demo = checks[3];
  try {
    const report = JSON.parse(demo.stdout);
    if (!report.installDecision || typeof report.riskScore !== "number") {
      throw new Error("Demo report is missing installDecision or riskScore.");
    }
    console.log(`${statusIcon(true)} Demo report parsed: ${report.installDecision.label}, risk ${report.riskScore}`);
  } catch (error) {
    console.log(`${statusIcon(false)} Demo JSON parse failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const dryRun = runNpm(["pack", "--dry-run", "--json"]);
  console.log(`${statusIcon(dryRun.ok)} npm pack --dry-run`);
  if (!dryRun.ok) {
    console.log((dryRun.stderr || dryRun.error || dryRun.stdout).trim());
    process.exitCode = 1;
    return;
  }
  const dryRunInfo = parsePackJson(dryRun.stdout);
  console.log(`  package: ${dryRunInfo.filename}, files: ${dryRunInfo.entryCount}, size: ${dryRunInfo.size} bytes`);

  if (!args.pack) {
    console.log("Package generation skipped. Use --pack to create and audit the .tgz file.");
    return;
  }

  const pack = runNpm(["pack", "--json"]);
  console.log(`${statusIcon(pack.ok)} npm pack`);
  if (!pack.ok) {
    console.log((pack.stderr || pack.error || pack.stdout).trim());
    process.exitCode = 1;
    return;
  }

  const packInfo = parsePackJson(pack.stdout);
  const tgzPath = join(ROOT, packInfo.filename);
  console.log(`  generated: ${packInfo.filename}`);

  const tgzAudit = auditTgz(tgzPath);
  if (!tgzAudit.ok) {
    console.log(`${statusIcon(false)} Package leak audit failed`);
    if (tgzAudit.error) console.log(tgzAudit.error);
    if (tgzAudit.leaks.length) printLeaks(tgzAudit.leaks);
    process.exitCode = 1;
    return;
  }

  console.log(`${statusIcon(true)} Package leak audit passed`);
  console.log(`${statusIcon(true)} Ready to publish: npm publish ./${packInfo.filename} --tag beta`);
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
