/**
 * Shared bash test harness for scripts/ suites (kmm-scripts.test.ts,
 * seed-golden-database.test.ts). One canonical way to source a script and
 * call a function inside it — if the scripts' sourcing contract changes
 * (sourcing guard, PATH/HOME requirements), there is exactly one call shape
 * to update.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const REPO_ROOT = join(__dirname, '../../..');

export interface BashResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

// The ONE place the controlled environment and result shape are defined —
// both public helpers delegate here, so an env-contract change (adding
// LANG, stripping TZ, ...) cannot silently apply to one and not the other.
function runBash(bashArgs: string[], env: Record<string, string>): BashResult {
  const result = spawnSync('bash', bashArgs, {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs `source <script>; <call>` in a fresh bash subprocess with a
 * controlled environment (default vars stripped unless provided). Sourcing
 * relies on the scripts' sourcing guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]]`)
 * to skip `main` — only the function/variable definitions load. */
export function sourceAndRun(script: string, call: string, env: Record<string, string> = {}): BashResult {
  return runBash(['-c', `source "$1"; ${call}`, 'bash', script], env);
}

/** Executes a script (not sourced — main runs) with a controlled environment. */
export function spawnScript(script: string, args: string[], env: Record<string, string>): BashResult {
  return runBash([script, ...args], env);
}
