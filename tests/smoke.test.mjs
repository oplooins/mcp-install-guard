import { spawnSync } from 'node:child_process';

function run(args) {
  return spawnSync('node', args, { encoding: 'utf8' });
}

let result = run(['src/cli/cli.mjs', '--demo', '--json']);
if (result.status !== 0) throw new Error(`demo failed: ${result.stderr}`);
const report = JSON.parse(result.stdout);
if (!report.summary || !Array.isArray(report.issues)) throw new Error('invalid report shape');

result = run(['src/cli/gate-cli.mjs', '--demo', '--enforce']);
if (result.status !== 2) throw new Error(`gate should block with exit 2, got ${result.status}\n${result.stdout}\n${result.stderr}`);
if (!result.stdout.includes('Decision: BLOCK')) throw new Error('gate output missing BLOCK decision');

console.log('smoke tests passed');
