/**
 * OMN-279 — argument/env validation, path construction, and error-exit codes
 * for the KMM Phase-1 repo-code deliverables (scripts/kmm/). Full behavioral
 * verification (actually quitting/restoring/relaunching OmniFocus, actually
 * loading a LaunchAgent) is explicitly deferred to OMN-280's live acceptance
 * pass — this suite covers what's testable without a real OmniFocus install
 * or a real KMM machine, per the ticket's own acceptance criteria.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '../../..');
// Placeholder paths used only as fake env-var VALUES in these tests (never
// actually written to) — computed rather than literal so no hardcoded
// world-writable-directory string appears in source (sonarjs/publicly-writable-directories).
const FAKE_CONTAINER_PATH = join(tmpdir(), 'of-db-reset-test-fake-container');
const FAKE_GOLDEN_DIR = join(tmpdir(), 'of-db-reset-test-fake-golden');
const OF_DB_RESET = join(REPO_ROOT, 'scripts/kmm/of-db-reset.sh');
const INSTALL_KMM_SERVER = join(REPO_ROOT, 'scripts/kmm/install-kmm-server.sh');
const OF_KMM_REDEPLOY = join(REPO_ROOT, 'scripts/kmm/of-kmm-redeploy');

function bashSyntaxOk(script: string): boolean {
  try {
    execFileSync('bash', ['-n', script], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Runs `source <script>; <call>` in a fresh bash subprocess with a
 * controlled environment (default vars stripped unless provided). Sourcing
 * relies on the scripts' sourcing guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]]`)
 * to skip `main` — only the function/variable definitions load. */
function sourceAndRun(
  script: string,
  call: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', ['-c', `source "$1"; ${call}`, 'bash', script], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('scripts/kmm — syntax', () => {
  it('of-db-reset.sh has valid bash syntax', () => {
    expect(bashSyntaxOk(OF_DB_RESET)).toBe(true);
  });
  it('install-kmm-server.sh has valid bash syntax', () => {
    expect(bashSyntaxOk(INSTALL_KMM_SERVER)).toBe(true);
  });
  it('of-kmm-redeploy has valid bash syntax', () => {
    expect(bashSyntaxOk(OF_KMM_REDEPLOY)).toBe(true);
  });
});

describe('of-db-reset.sh — validate_inputs', () => {
  it('dies loudly when OF_GOLDEN_DIR is unset', () => {
    const { status, stderr } = sourceAndRun(OF_DB_RESET, 'validate_inputs', { OF_CONTAINER_PATH: FAKE_CONTAINER_PATH });
    expect(status).toBe(1);
    expect(stderr).toContain('OF_GOLDEN_DIR is required');
  });

  it('dies loudly when OF_CONTAINER_PATH is unset', () => {
    const goldenDir = mkdtempSync(join(tmpdir(), 'of-golden-'));
    try {
      const { status, stderr } = sourceAndRun(OF_DB_RESET, 'validate_inputs', { OF_GOLDEN_DIR: goldenDir });
      expect(status).toBe(1);
      expect(stderr).toContain('OF_CONTAINER_PATH is required');
    } finally {
      rmSync(goldenDir, { recursive: true, force: true });
    }
  });

  it('dies loudly when the golden zip is missing', () => {
    const goldenDir = mkdtempSync(join(tmpdir(), 'of-golden-'));
    try {
      const { status, stderr } = sourceAndRun(OF_DB_RESET, 'validate_inputs', {
        OF_GOLDEN_DIR: goldenDir,
        OF_CONTAINER_PATH: FAKE_CONTAINER_PATH,
      });
      expect(status).toBe(1);
      expect(stderr).toContain('golden snapshot not found');
    } finally {
      rmSync(goldenDir, { recursive: true, force: true });
    }
  });

  it('dies loudly when PROVENANCE.md is missing', () => {
    const goldenDir = mkdtempSync(join(tmpdir(), 'of-golden-'));
    try {
      writeFileSync(join(goldenDir, 'golden.ofocus.zip'), 'fake-zip-contents');
      const { status, stderr } = sourceAndRun(OF_DB_RESET, 'validate_inputs', {
        OF_GOLDEN_DIR: goldenDir,
        OF_CONTAINER_PATH: FAKE_CONTAINER_PATH,
      });
      expect(status).toBe(1);
      expect(stderr).toContain('PROVENANCE.md not found');
    } finally {
      rmSync(goldenDir, { recursive: true, force: true });
    }
  });

  it('passes when all required env vars and files are present', () => {
    const goldenDir = mkdtempSync(join(tmpdir(), 'of-golden-'));
    try {
      writeFileSync(join(goldenDir, 'golden.ofocus.zip'), 'fake-zip-contents');
      writeFileSync(join(goldenDir, 'PROVENANCE.md'), 'tasks: 10\nprojects: 2\n');
      const { status, stderr } = sourceAndRun(OF_DB_RESET, 'validate_inputs', {
        OF_GOLDEN_DIR: goldenDir,
        OF_CONTAINER_PATH: FAKE_CONTAINER_PATH,
      });
      expect(status).toBe(0);
      expect(stderr).toBe('');
    } finally {
      rmSync(goldenDir, { recursive: true, force: true });
    }
  });
});

describe('of-db-reset.sh — set_derived_paths', () => {
  it('defaults the golden zip name to golden.ofocus.zip', () => {
    const { status, stdout } = sourceAndRun(OF_DB_RESET, 'set_derived_paths; echo "$GOLDEN_ZIP"', {
      OF_GOLDEN_DIR: FAKE_GOLDEN_DIR,
    });
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(join(FAKE_GOLDEN_DIR, 'golden.ofocus.zip'));
  });

  it('honors OF_GOLDEN_ZIP_NAME override', () => {
    const { stdout } = sourceAndRun(OF_DB_RESET, 'set_derived_paths; echo "$GOLDEN_ZIP"', {
      OF_GOLDEN_DIR: FAKE_GOLDEN_DIR,
      OF_GOLDEN_ZIP_NAME: 'custom.zip',
    });
    expect(stdout.trim()).toBe(join(FAKE_GOLDEN_DIR, 'custom.zip'));
  });

  it('defaults timing knobs', () => {
    const { stdout } = sourceAndRun(
      OF_DB_RESET,
      'set_derived_paths; echo "$QUIT_TIMEOUT_S $RELAUNCH_RETRIES $RELAUNCH_INTERVAL_S"',
      { OF_GOLDEN_DIR: FAKE_GOLDEN_DIR },
    );
    expect(stdout.trim()).toBe('15 30 2');
  });

  it('honors timing overrides', () => {
    const { stdout } = sourceAndRun(OF_DB_RESET, 'set_derived_paths; echo "$QUIT_TIMEOUT_S"', {
      OF_GOLDEN_DIR: FAKE_GOLDEN_DIR,
      OF_QUIT_TIMEOUT_S: '5',
    });
    expect(stdout.trim()).toBe('5');
  });
});

describe('of-db-reset.sh — parse_provenance_count', () => {
  function withProvenance(contents: string, fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'provenance-'));
    try {
      writeFileSync(join(dir, 'PROVENANCE.md'), contents);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('parses a plain integer count', () => {
    withProvenance('tasks: 1523\nprojects: 87\n', (dir) => {
      const { stdout, status } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count tasks`,
      );
      expect(status).toBe(0);
      expect(stdout.trim()).toBe('1523');
    });
  });

  it('tolerates extra whitespace after the colon', () => {
    withProvenance('projects:    42\n', (dir) => {
      const { stdout } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count projects`,
      );
      expect(stdout.trim()).toBe('42');
    });
  });

  it('ignores unrelated lines', () => {
    withProvenance('# Golden DB provenance\nexport date: 2026-07-19\ntasks: 5\n', (dir) => {
      const { stdout } = sourceAndRun(OF_DB_RESET, `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count tasks`);
      expect(stdout.trim()).toBe('5');
    });
  });

  it('dies loudly when the key is missing', () => {
    withProvenance('tasks: 5\n', (dir) => {
      const { status, stderr } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count projects`,
      );
      expect(status).toBe(1);
      expect(stderr).toContain("no 'projects:' line");
    });
  });

  it('dies loudly when the value is not a plain integer', () => {
    withProvenance('tasks: many\n', (dir) => {
      const { status, stderr } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count tasks`,
      );
      expect(status).toBe(1);
      expect(stderr).toContain('not a plain integer');
    });
  });
});

describe('install-kmm-server.sh — env validation + arg dispatch', () => {
  it('dies loudly when TAILSCALE_IP is unset', () => {
    const { status, stderr } = spawnScript(INSTALL_KMM_SERVER, [], { MCP_AUTH_TOKEN: 'x' });
    expect(status).toBe(1);
    expect(stderr).toContain('TAILSCALE_IP is required');
  });

  it('dies loudly when MCP_AUTH_TOKEN is unset', () => {
    const { status, stderr } = spawnScript(INSTALL_KMM_SERVER, [], { TAILSCALE_IP: 'kmm-test-host.example' });
    expect(status).toBe(1);
    expect(stderr).toContain('MCP_AUTH_TOKEN is required');
  });

  it('rejects an unknown argument with a usage error (exit 2)', () => {
    const { status, stderr } = spawnScript(INSTALL_KMM_SERVER, ['--bogus'], {
      TAILSCALE_IP: 'kmm-test-host.example',
      MCP_AUTH_TOKEN: 'x',
    });
    expect(status).toBe(2);
    expect(stderr).toContain('Unknown argument');
  });

  it('dies loudly when the repo checkout is missing dist/index.js', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'kmm-repo-'));
    try {
      const { status, stderr } = spawnScript(INSTALL_KMM_SERVER, [], {
        TAILSCALE_IP: 'kmm-test-host.example',
        MCP_AUTH_TOKEN: 'x',
        OF_MCP_REPO_DIR: repoDir,
      });
      expect(status).toBe(1);
      expect(stderr).toContain('dist/index.js not found');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('of-kmm-redeploy — env validation', () => {
  it('dies loudly when TAILSCALE_IP is unset', () => {
    const { status, stderr } = spawnScript(OF_KMM_REDEPLOY, [], { MCP_AUTH_TOKEN: 'x' });
    expect(status).toBe(1);
    expect(stderr).toContain('TAILSCALE_IP is required');
  });

  it('dies loudly when MCP_AUTH_TOKEN is unset', () => {
    const { status, stderr } = spawnScript(OF_KMM_REDEPLOY, [], { TAILSCALE_IP: 'kmm-test-host.example' });
    expect(status).toBe(1);
    expect(stderr).toContain('MCP_AUTH_TOKEN is required');
  });

  it('dies loudly when OF_MCP_REPO_DIR is not a git checkout', () => {
    const notAGitDir = mkdtempSync(join(tmpdir(), 'not-git-'));
    try {
      const { status, stderr } = spawnScript(OF_KMM_REDEPLOY, [], {
        TAILSCALE_IP: 'kmm-test-host.example',
        MCP_AUTH_TOKEN: 'x',
        OF_MCP_REPO_DIR: notAGitDir,
      });
      expect(status).toBe(1);
      expect(stderr).toContain('not a git checkout');
    } finally {
      rmSync(notAGitDir, { recursive: true, force: true });
    }
  });
});

function spawnScript(
  script: string,
  args: string[],
  env: Record<string, string>,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', [script, ...args], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
