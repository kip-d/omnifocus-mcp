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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
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
const KMM_LIB = join(REPO_ROOT, 'scripts/kmm/lib.sh');

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
  it('lib.sh has valid bash syntax', () => {
    expect(bashSyntaxOk(KMM_LIB)).toBe(true);
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

  it('defaults the verify settle knobs (retries, interval)', () => {
    const { stdout } = sourceAndRun(OF_DB_RESET, 'set_derived_paths; echo "$VERIFY_RETRIES $VERIFY_INTERVAL_S"', {
      OF_GOLDEN_DIR: FAKE_GOLDEN_DIR,
    });
    expect(stdout.trim()).toBe('10 3');
  });

  it('honors verify settle overrides', () => {
    const { stdout } = sourceAndRun(OF_DB_RESET, 'set_derived_paths; echo "$VERIFY_RETRIES $VERIFY_INTERVAL_S"', {
      OF_GOLDEN_DIR: FAKE_GOLDEN_DIR,
      OF_VERIFY_RETRIES: '2',
      OF_VERIFY_INTERVAL_S: '1',
    });
    expect(stdout.trim()).toBe('2 1');
  });
});

describe('of-db-reset.sh — verify_counts retry behavior (stubbed read_live_counts)', () => {
  // verify_counts must treat a FAILED count read the same as an unsettled
  // count — consume retry budget, not die on the first throw — because
  // flattenedTasks() can still throw while OmniFocus indexes the freshly
  // restored document. Stubbing read_live_counts after sourcing exercises
  // the loop without a live OmniFocus.
  function withProvenanceAndStub(stub: string, fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'verify-counts-'));
    try {
      writeFileSync(join(dir, 'PROVENANCE.md'), 'tasks: 10\nprojects: 2\n');
      writeFileSync(join(dir, 'stub.sh'), stub);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('retries when the count read fails, then succeeds once it answers', () => {
    withProvenanceAndStub(
      // Fails on the first call, answers with matching counts on the second.
      `read_live_counts() {
        local n; n="$(cat "$STATE_FILE")"; n=$((n + 1)); echo "$n" > "$STATE_FILE"
        [ "$n" -ge 2 ] || return 1
        echo "10 2"
      }`,
      (dir) => {
        writeFileSync(join(dir, 'state'), '0');
        const { status, stdout } = sourceAndRun(
          OF_DB_RESET,
          `source "${join(dir, 'stub.sh')}"; STATE_FILE="${join(dir, 'state')}"; ` +
            `PROVENANCE="${join(dir, 'PROVENANCE.md')}"; VERIFY_RETRIES=3; VERIFY_INTERVAL_S=0; verify_counts`,
        );
        expect(status).toBe(0);
        expect(stdout).toContain('Count read failed');
        expect(stdout).toContain('Verified: tasks=10 projects=2');
      },
    );
  });

  it('dies only after the retry budget is exhausted when reads keep failing', () => {
    withProvenanceAndStub(`read_live_counts() { return 1; }`, (dir) => {
      const { status, stderr } = sourceAndRun(
        OF_DB_RESET,
        `source "${join(dir, 'stub.sh')}"; PROVENANCE="${join(dir, 'PROVENANCE.md')}"; ` +
          `VERIFY_RETRIES=2; VERIFY_INTERVAL_S=0; verify_counts`,
      );
      expect(status).toBe(1);
      expect(stderr).toContain('after 2 attempts');
    });
  });

  it('dies with MISMATCH details after retries when counts stay wrong', () => {
    withProvenanceAndStub(`read_live_counts() { echo "9 2"; }`, (dir) => {
      const { status, stderr } = sourceAndRun(
        OF_DB_RESET,
        `source "${join(dir, 'stub.sh')}"; PROVENANCE="${join(dir, 'PROVENANCE.md')}"; ` +
          `VERIFY_RETRIES=2; VERIFY_INTERVAL_S=0; verify_counts`,
      );
      expect(status).toBe(1);
      expect(stderr).toContain('MISMATCH: tasks expected=10 actual=9');
      expect(stderr).toContain('does not match PROVENANCE.md after 2 reads');
    });
  });
});

describe('of-db-reset.sh — select_extracted_bundle', () => {
  function withExtractionDir(bundleNames: string[], fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'of-extract-'));
    try {
      for (const name of bundleNames) mkdirSync(join(dir, name));
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('returns the bundle path when exactly one .ofocus bundle exists', () => {
    withExtractionDir(['golden.ofocus'], (dir) => {
      const { status, stdout } = sourceAndRun(OF_DB_RESET, `select_extracted_bundle "${dir}"`);
      expect(status).toBe(0);
      expect(stdout.trim()).toBe(join(dir, 'golden.ofocus'));
    });
  });

  it('dies loudly when no .ofocus bundle exists', () => {
    withExtractionDir(['not-a-bundle'], (dir) => {
      const { status, stderr } = sourceAndRun(OF_DB_RESET, `select_extracted_bundle "${dir}"`);
      expect(status).toBe(1);
      expect(stderr).toContain('expected exactly one .ofocus bundle');
      expect(stderr).toContain('found 0');
    });
  });

  it('dies loudly (instead of silently picking one) when multiple .ofocus bundles exist', () => {
    withExtractionDir(['a.ofocus', 'b.ofocus'], (dir) => {
      const { status, stderr } = sourceAndRun(OF_DB_RESET, `select_extracted_bundle "${dir}"`);
      expect(status).toBe(1);
      expect(stderr).toContain('expected exactly one .ofocus bundle');
      expect(stderr).toContain('found 2');
    });
  });
});

describe('scripts/kmm — PATH-symlink invocation (SCRIPT_DIR symlink resolution)', () => {
  // The scripts' documented invocation is bare (`ssh kmm of-db-reset`,
  // `of-kmm-redeploy`), i.e. via a PATH symlink. Reaching each script's own
  // env-validation die() proves lib.sh was found through the symlink — an
  // unresolved SCRIPT_DIR would fail earlier, sourcing lib.sh from the
  // symlink's directory.
  function viaSymlink(script: string, env: Record<string, string>): { status: number | null; stderr: string } {
    const dir = mkdtempSync(join(tmpdir(), 'kmm-bin-'));
    try {
      const link = join(dir, 'linked-script');
      symlinkSync(script, link);
      const result = spawnSync('bash', [link], {
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
        encoding: 'utf8',
      });
      return { status: result.status, stderr: result.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('of-db-reset.sh finds lib.sh when run via a symlink', () => {
    const { status, stderr } = viaSymlink(OF_DB_RESET, {});
    expect(status).toBe(1);
    expect(stderr).toContain('OF_GOLDEN_DIR is required');
  });

  it('of-kmm-redeploy finds lib.sh when run via a symlink', () => {
    const { status, stderr } = viaSymlink(OF_KMM_REDEPLOY, { MCP_AUTH_TOKEN: 'x' });
    expect(status).toBe(1);
    expect(stderr).toContain('TAILSCALE_IP is required');
  });

  it('install-kmm-server.sh finds lib.sh when run via a symlink', () => {
    const { status, stderr } = viaSymlink(INSTALL_KMM_SERVER, {});
    expect(status).toBe(1);
    expect(stderr).toContain('TAILSCALE_IP is required');
  });
});

describe('scripts/kmm — regression pins for review findings', () => {
  it('install-kmm-server.sh --verify curls carry explicit timeouts', () => {
    // Without --connect-timeout/--max-time, a hung LaunchAgent blocks the
    // whole redeploy pipeline forever instead of failing loud.
    const src = readFileSync(INSTALL_KMM_SERVER, 'utf8');
    expect(src).toContain('--connect-timeout');
    expect(src).toContain('--max-time');
    const curls = src.split('\n').filter((l) => l.includes('curl -s'));
    expect(curls.length).toBeGreaterThanOrEqual(2);
    for (const line of curls) expect(line).toContain('CURL_TIMEOUT_ARGS');
  });

  it('of-kmm-redeploy forwards OF_MCP_KMM_PORT to install-kmm-server.sh', () => {
    // Otherwise a redeploy after a custom-port install silently reverts the
    // LaunchAgent to the default port 3111.
    const src = readFileSync(OF_KMM_REDEPLOY, 'utf8');
    expect(src).toMatch(/OF_MCP_KMM_PORT="\$\{OF_MCP_KMM_PORT:-3111\}"/);
  });

  it('of-db-reset.sh restore never rm -rfs the live container before the replacement lands', () => {
    // Move-aside pattern: the only rm -rf of the container path targets the
    // .pre-reset move-aside copy, after the golden mv has succeeded.
    const src = readFileSync(OF_DB_RESET, 'utf8');
    expect(src).not.toMatch(/rm -rf "\$\{?OF_CONTAINER_PATH/);
    expect(src).toContain('.pre-reset.');
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

  it('tolerates trailing whitespace after the value', () => {
    withProvenance('tasks: 1523   \nprojects: 87\n', (dir) => {
      const { status, stdout } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count tasks`,
      );
      expect(status).toBe(0);
      expect(stdout.trim()).toBe('1523');
    });
  });

  it('tolerates CRLF line endings', () => {
    withProvenance('tasks: 1523\r\nprojects: 87\r\n', (dir) => {
      const { status, stdout } = sourceAndRun(
        OF_DB_RESET,
        `PROVENANCE="${dir}/PROVENANCE.md"; parse_provenance_count projects`,
      );
      expect(status).toBe(0);
      expect(stdout.trim()).toBe('87');
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
