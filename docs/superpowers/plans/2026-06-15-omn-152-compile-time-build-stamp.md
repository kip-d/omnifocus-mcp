# OMN-152 Compile-Time Build Stamping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the version endpoint's `buildId` reflect the code the running process actually loaded (frozen at process
start), and self-detect a stale process by comparing against the request-time checkout hash.

**Architecture:** A `postbuild` script writes `dist/build-info.json`. A new `src/utils/build-info.ts` reads it **once,
memoized** (warmed at process start), so the loaded build is frozen for the process lifetime. `src/utils/version.ts`
composes that frozen build with a request-time `git rev-parse` (`checkout.hash`); when they differ it emits
`stale: true` + a "restart the server" warning. Adds `process.startedAt`/`uptimeSeconds`.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest, plain Node ESM build script.

**Spec:** `docs/superpowers/specs/2026-06-15-omn-152-compile-time-build-stamp-design.md`

---

## File Structure

- **Create** `src/utils/build-info.ts` — owns reading/parsing `dist/build-info.json` into a frozen `LoadedBuild`
  (memoized read + `buildId` derivation + dev sentinel). One responsibility: "what build is loaded?"
- **Create** `scripts/stamp-build-info.js` — build-time git capture → `dist/build-info.json`. Plain ESM, no compile
  dependency.
- **Modify** `src/utils/version.ts` — import `readLoadedBuild`, warm it at module load, compose `VersionInfo` with
  `checkout`/`stale`/`warning`/`process`. Extend the `VersionInfo` interface.
- **Modify** `package.json` — add `postbuild` script.
- **Create** `tests/unit/utils/build-info.test.ts` — unit tests for the fs read/parse logic (path-aware fs mock).
- **Create** `tests/unit/utils/version.test.ts` — unit tests for composition/staleness (mocks `build-info.js` +
  `child_process`).
- **Modify** `tests/unit/tools/system-v2.test.ts` — extend the mock `VersionInfo` with the new fields (the `toEqual`
  blocker).

---

## Task 1: `build-info.ts` — frozen loaded-build reader

**Files:**

- Create: `src/utils/build-info.ts`
- Test: `tests/unit/utils/build-info.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utils/build-info.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Path-aware fs mock: only intercept build-info.json; defer everything else to real fs.
let buildInfoExists = true;
let buildInfoRaw = '';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => (String(p).endsWith('build-info.json') ? buildInfoExists : actual.existsSync(p))),
    readFileSync: vi.fn((p: string, enc?: unknown) =>
      String(p).endsWith('build-info.json') ? buildInfoRaw : (actual.readFileSync as any)(p, enc),
    ),
  };
});

import { readLoadedBuild, __resetBuildInfoCacheForTests, DEV_SENTINEL } from '../../../src/utils/build-info.js';

beforeEach(() => {
  __resetBuildInfoCacheForTests();
  buildInfoExists = true;
  buildInfoRaw = '';
});

describe('readLoadedBuild', () => {
  it('reads a stamped build-info.json and derives a clean buildId', () => {
    buildInfoRaw = JSON.stringify({
      hash: 'abc1234',
      branch: 'main',
      commitDate: '2026-06-15 10:00:00 -0400',
      commitMessage: 'feat: x',
      dirty: false,
      timestamp: '2026-06-15T14:00:00.000Z',
    });
    const b = readLoadedBuild();
    expect(b.hash).toBe('abc1234');
    expect(b.buildId).toBe('abc1234');
    expect(b.dirty).toBe(false);
    expect(b.timestamp).toBe('2026-06-15T14:00:00.000Z');
  });

  it('appends -dirty to buildId when the stamp is dirty', () => {
    buildInfoRaw = JSON.stringify({ hash: 'abc1234', dirty: true });
    expect(readLoadedBuild().buildId).toBe('abc1234-dirty');
  });

  it('returns the dev sentinel when build-info.json is missing', () => {
    buildInfoExists = false;
    expect(readLoadedBuild()).toEqual(DEV_SENTINEL);
  });

  it('returns the dev sentinel when build-info.json is unparseable', () => {
    buildInfoRaw = '{ not json';
    expect(readLoadedBuild()).toEqual(DEV_SENTINEL);
  });

  it('memoizes: a second call does not re-read the file', () => {
    buildInfoRaw = JSON.stringify({ hash: 'first' });
    expect(readLoadedBuild().hash).toBe('first');
    buildInfoRaw = JSON.stringify({ hash: 'second' }); // changed on disk
    expect(readLoadedBuild().hash).toBe('first'); // still cached
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/utils/build-info.test.ts` Expected: FAIL — cannot resolve
`../../../src/utils/build-info.js` (module not created yet).

- [ ] **Step 3: Implement `src/utils/build-info.ts`**

```ts
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface LoadedBuild {
  hash: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  dirty: boolean;
  timestamp: string;
  buildId: string;
}

export const DEV_SENTINEL: LoadedBuild = {
  hash: 'dev-unstamped',
  branch: 'unknown',
  commitDate: 'unknown',
  commitMessage: 'unknown',
  dirty: false,
  timestamp: 'unknown',
  buildId: 'dev-unstamped',
};

let cache: LoadedBuild | undefined;

function doRead(): LoadedBuild {
  try {
    // build-info.json sits beside this module's compiled output: dist/build-info.json.
    // This module compiles to dist/utils/build-info.js → one level up is dist/.
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const buildInfoPath = join(scriptDir, '..', 'build-info.json');
    if (!existsSync(buildInfoPath)) return DEV_SENTINEL;
    const raw = JSON.parse(readFileSync(buildInfoPath, 'utf8')) as Partial<LoadedBuild>;
    const hash = raw.hash ?? 'unknown';
    const dirty = Boolean(raw.dirty);
    return {
      hash,
      branch: raw.branch ?? 'unknown',
      commitDate: raw.commitDate ?? 'unknown',
      commitMessage: raw.commitMessage ?? 'unknown',
      dirty,
      timestamp: raw.timestamp ?? 'unknown',
      buildId: `${hash}${dirty ? '-dirty' : ''}`,
    };
  } catch {
    return DEV_SENTINEL;
  }
}

/**
 * Returns the build metadata stamped into dist/ at compile time, read ONCE and
 * memoized. The first call (warmed at process start by version.ts) captures the
 * loaded artifact; later disk rebuilds do not change the returned value — that is
 * what lets the version endpoint detect a stale process.
 */
export function readLoadedBuild(): LoadedBuild {
  if (cache) return cache;
  cache = doRead();
  return cache;
}

/** Test-only: clear the memoized value so each test reads fresh. */
export function __resetBuildInfoCacheForTests(): void {
  cache = undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/utils/build-info.test.ts` Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/build-info.ts tests/unit/utils/build-info.test.ts
git commit -m "feat(OMN-152): build-info.ts — frozen, memoized loaded-build reader"
```

---

## Task 2: `version.ts` — interface + staleness composition

**Files:**

- Modify: `src/utils/version.ts`
- Test: `tests/unit/utils/version.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utils/version.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoadedBuild } from '../../../src/utils/build-info.js';

// Control the loaded build per test.
vi.mock('../../../src/utils/build-info.js', () => ({
  readLoadedBuild: vi.fn(),
  DEV_SENTINEL: {
    hash: 'dev-unstamped',
    branch: 'unknown',
    commitDate: 'unknown',
    commitMessage: 'unknown',
    dirty: false,
    timestamp: 'unknown',
    buildId: 'dev-unstamped',
  },
}));

// Control request-time git (checkout hash + dev fallback git).
vi.mock('child_process', () => ({ execSync: vi.fn() }));

import { readLoadedBuild } from '../../../src/utils/build-info.js';
import { execSync } from 'child_process';
import { getVersionInfo } from '../../../src/utils/version.js';

const STAMPED: LoadedBuild = {
  hash: 'abc1234',
  branch: 'main',
  commitDate: '2026-06-15 10:00:00 -0400',
  commitMessage: 'feat: x',
  dirty: false,
  timestamp: '2026-06-15T14:00:00.000Z',
  buildId: 'abc1234',
};

// Route execSync by the git subcommand so we can simulate checkout hash + dev git.
function gitMock(map: Record<string, string>, fail = false) {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (fail) throw new Error('not a git repo');
    for (const [needle, out] of Object.entries(map)) if (cmd.includes(needle)) return out as never;
    return '' as never;
  });
}

beforeEach(() => vi.clearAllMocks());

describe('getVersionInfo staleness', () => {
  it('stamped build, checkout matches → not stale, no warning', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'abc1234' });
    const v = getVersionInfo();
    expect(v.build.buildId).toBe('abc1234');
    expect(v.checkout.hash).toBe('abc1234');
    expect(v.stale).toBe(false);
    expect(v.warning).toBeUndefined();
  });

  it('stamped build, checkout differs → stale with warning', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'def5678' });
    const v = getVersionInfo();
    expect(v.stale).toBe(true);
    expect(v.warning).toContain('abc1234');
    expect(v.warning).toContain('def5678');
    expect(v.warning).toContain('restart');
  });

  it('dev sentinel → buildId dev-unstamped, never stale', () => {
    vi.mocked(readLoadedBuild).mockReturnValue({ ...STAMPED, hash: 'dev-unstamped', buildId: 'dev-unstamped' });
    gitMock({ 'rev-parse --short HEAD': 'anything', 'abbrev-ref': 'feature', '%ci': 'date', '%s': 'msg' });
    const v = getVersionInfo();
    expect(v.build.buildId).toBe('dev-unstamped');
    expect(v.stale).toBe(false);
  });

  it('checkout git failure → checkout unknown, not stale', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({}, true);
    const v = getVersionInfo();
    expect(v.checkout.hash).toBe('unknown');
    expect(v.stale).toBe(false);
  });

  it('always reports process uptime + startedAt', () => {
    vi.mocked(readLoadedBuild).mockReturnValue(STAMPED);
    gitMock({ 'rev-parse --short HEAD': 'abc1234' });
    const v = getVersionInfo();
    expect(typeof v.process.uptimeSeconds).toBe('number');
    expect(typeof v.process.startedAt).toBe('string');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/utils/version.test.ts` Expected: FAIL — `v.checkout`/`v.stale`/`v.process` undefined
(fields not added yet).

- [ ] **Step 3: Rewrite `src/utils/version.ts`**

Replace the file contents with:

```ts
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readLoadedBuild } from './build-info.js';

export interface VersionInfo {
  name: string;
  version: string;
  description: string;
  build: {
    hash: string;
    branch: string;
    commitDate: string;
    commitMessage: string;
    dirty: boolean;
    timestamp: string;
    buildId: string;
  };
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  git: {
    repository: string;
    homepage: string;
  };
  checkout: { hash: string };
  stale: boolean;
  warning?: string;
  process: { startedAt: string; uptimeSeconds: number };
}

interface PackageJson {
  name: string;
  version: string;
  description: string;
  repository?: { url?: string };
  homepage?: string;
}

// Captured once, at process start: makes buildId reflect load-time, not first-request time.
const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();
// Warm the memoized loaded-build read at module load (process start).
readLoadedBuild();

function resolveProjectRoot(): string {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  // dist/utils/version.js → project root is two levels up.
  return join(scriptDir, '..', '..');
}

function readCheckoutHash(projectRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();
  } catch {
    return 'unknown';
  }
}

// Request-time git, used ONLY for the dev fallback so dev output stays useful.
function readRequestTimeBuild(projectRoot: string): VersionInfo['build'] {
  const opt = { encoding: 'utf8' as const, cwd: projectRoot };
  let hash = 'unknown';
  let branch = 'unknown';
  let commitDate = 'unknown';
  let commitMessage = 'unknown';
  let dirty = false;
  try {
    hash = execSync('git rev-parse --short HEAD', opt).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', opt).trim();
    commitDate = execSync('git show -s --format=%ci HEAD', opt).trim();
    commitMessage = execSync('git show -s --format=%s HEAD', opt).trim();
    try {
      dirty = execSync('git status --porcelain', opt).trim().length > 0;
    } catch {
      /* assume clean */
    }
  } catch {
    /* defaults */
  }
  return {
    hash,
    branch,
    commitDate,
    commitMessage,
    dirty,
    timestamp: new Date().toISOString(),
    buildId: 'dev-unstamped',
  };
}

export function getVersionInfo(): VersionInfo {
  const projectRoot = resolveProjectRoot();
  const packagePath = join(projectRoot, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error(`Cannot find package.json at ${packagePath}.`);
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;

  const loaded = readLoadedBuild();
  const isDev = loaded.buildId === 'dev-unstamped';

  const build: VersionInfo['build'] = isDev
    ? readRequestTimeBuild(projectRoot)
    : {
        hash: loaded.hash,
        branch: loaded.branch,
        commitDate: loaded.commitDate,
        commitMessage: loaded.commitMessage,
        dirty: loaded.dirty,
        timestamp: loaded.timestamp,
        buildId: loaded.buildId,
      };

  const checkoutHash = readCheckoutHash(projectRoot);
  const stale = !isDev && checkoutHash !== 'unknown' && loaded.hash !== checkoutHash;
  const warning = stale
    ? `stale process: loaded build ${loaded.hash} but checkout is ${checkoutHash} — restart the server`
    : undefined;

  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    build,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    git: {
      repository: packageJson.repository?.url || 'unknown',
      homepage: packageJson.homepage || 'unknown',
    },
    checkout: { hash: checkoutHash },
    stale,
    ...(warning ? { warning } : {}),
    process: { startedAt: PROCESS_STARTED_AT, uptimeSeconds: process.uptime() },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/utils/version.test.ts` Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/version.ts tests/unit/utils/version.test.ts
git commit -m "feat(OMN-152): version.ts composes frozen build + request-time checkout → stale detection"
```

---

## Task 3: `stamp-build-info.js` + postbuild wiring

**Files:**

- Create: `scripts/stamp-build-info.js`
- Modify: `package.json`

- [ ] **Step 1: Implement `scripts/stamp-build-info.js`**

```js
#!/usr/bin/env node
// Build-time stamp: capture git metadata into dist/build-info.json so the version
// endpoint reports the LOADED artifact, not the request-time checkout. Never fails
// the build — git errors degrade to "unknown".
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = { encoding: 'utf8', cwd: projectRoot };
const git = (cmd) => execSync(cmd, opt).trim();

let info;
try {
  let dirty = false;
  try {
    dirty = git('git status --porcelain').length > 0;
  } catch {
    /* assume clean */
  }
  info = {
    hash: git('git rev-parse --short HEAD'),
    branch: git('git rev-parse --abbrev-ref HEAD'),
    commitDate: git('git show -s --format=%ci HEAD'),
    commitMessage: git('git show -s --format=%s HEAD'),
    dirty,
    timestamp: new Date().toISOString(),
  };
} catch {
  info = {
    hash: 'unknown',
    branch: 'unknown',
    commitDate: 'unknown',
    commitMessage: 'unknown',
    dirty: false,
    timestamp: new Date().toISOString(),
  };
}

const distDir = join(projectRoot, 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Stamped dist/build-info.json: ${info.hash}${info.dirty ? '-dirty' : ''}`);
```

- [ ] **Step 2: Add the `postbuild` script to `package.json`**

Change line 16 from:

```json
    "build": "tsc",
```

to:

```json
    "build": "tsc",
    "postbuild": "node scripts/stamp-build-info.js",
```

- [ ] **Step 3: Run the build and verify the stamp is written**

Run: `npm run build && cat dist/build-info.json` Expected: build completes, `dist/build-info.json` prints valid JSON
with a real `hash`, `branch`, `timestamp`, and `dirty` boolean.

- [ ] **Step 4: Verify the loaded buildId now flows end-to-end**

Run:
`node -e "import('./dist/utils/version.js').then(m => { const v = m.getVersionInfo(); console.log(JSON.stringify({ buildId: v.build.buildId, checkout: v.checkout.hash, stale: v.stale, uptime: v.process.uptimeSeconds }, null, 2)); })"`
Expected: `buildId` equals the stamped short hash, `checkout` equals the same hash, `stale: false`, `uptime` a small
number.

- [ ] **Step 5: Commit**

```bash
git add scripts/stamp-build-info.js package.json
git commit -m "feat(OMN-152): postbuild stamps dist/build-info.json"
```

---

## Task 4: Fix the existing `system-v2.test.ts` mock (the toEqual blocker)

**Files:**

- Modify: `tests/unit/tools/system-v2.test.ts`

- [ ] **Step 1: Confirm the type error that forces this change**

The runtime test still passes on its own — `version.js` is fully mocked (`vi.mock('../../../src/utils/version.js')`) and
`getVersionInfo` returns `mockVersionInfo` verbatim, so `expect(result.data).toEqual(mockVersionInfo)` is reflexive. The
real forcing function is **TypeScript**: `vi.mocked(versionUtils.getVersionInfo).mockReturnValue(mockVersionInfo)`
requires `mockVersionInfo` to satisfy the `VersionInfo` type, which now has new **required** fields (`checkout`,
`stale`, `process`).

Run: `npm run typecheck:test` Expected: FAIL — `mockVersionInfo` is missing properties `checkout`, `stale`, `process`
(not assignable to `VersionInfo`).

- [ ] **Step 2: Extend the mock `VersionInfo` object**

In `tests/unit/tools/system-v2.test.ts`, replace the `git` block's closing of the `mockVersionInfo` object (lines
~75-79):

```ts
        git: {
          repository: 'https://github.com/example/omnifocus-mcp',
          homepage: 'https://example.com',
        },
      };
```

with:

```ts
        git: {
          repository: 'https://github.com/example/omnifocus-mcp',
          homepage: 'https://example.com',
        },
        checkout: { hash: 'abc123' },
        stale: false,
        process: { startedAt: '2024-01-01T11:00:00Z', uptimeSeconds: 42 },
      };
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run tests/unit/tools/system-v2.test.ts` Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/tools/system-v2.test.ts
git commit -m "test(OMN-152): extend system-v2 version mock with checkout/stale/process fields"
```

---

## Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck (src AND tests)**

Run: `npm run typecheck && npm run typecheck:test` Expected: no errors. `typecheck` confirms the additive `VersionInfo`
fields and `build-info.ts` compile and `SystemTool`'s `StandardResponseV2<VersionInfo>` still satisfies;
`typecheck:test` confirms the updated `system-v2.test.ts` mock now satisfies `VersionInfo` (the Task 4 fix).

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit` Expected: all green, including the two new files and the updated `system-v2.test.ts`.

- [ ] **Step 3: Lint**

Run:
`npx eslint src/utils/build-info.ts src/utils/version.ts scripts/stamp-build-info.js tests/unit/utils/build-info.test.ts tests/unit/utils/version.test.ts`
Expected: clean (exit 0).

- [ ] **Step 4: Commit (only if lint/format auto-fixed anything)**

```bash
git add -A && git commit -m "chore(OMN-152): lint/format pass" || echo "nothing to commit"
```

---

## Task 6: Live acceptance — prove staleness is self-detected (`/verify`)

**Files:** none (manual acceptance; the ticket's core acceptance criterion)

- [ ] **Step 1: Build and capture the current buildId**

Run:
`npm run build && node -e "import('./dist/utils/version.js').then(m=>console.log(m.getVersionInfo().build.buildId))"`
Record the buildId (call it `OLD`).

- [ ] **Step 2: Start a long-lived process that loaded this build**

Run (background): `node dist/index.js` via the MCP test harness, or simply hold an open
`node --input-type=module -e "import('./dist/utils/version.js').then(m => { globalThis.v = m; setInterval(()=>{}, 1e9); })"`
REPL that imported version.js (warming the cache).

- [ ] **Step 3: Make a new commit and rebuild dist WITHOUT restarting that process**

Run: make any trivial commit (or `git commit --allow-empty -m "stale test"`), then `npm run build`.
`dist/build-info.json` now holds the NEW hash.

- [ ] **Step 4: Query the still-running process**

In the same long-lived process, call `getVersionInfo()` again. Expected: `build.buildId === OLD` (frozen — memoized at
load), `checkout.hash === NEW`, `stale === true`, `warning` contains "restart the server". **This is the 2026-06-11
incident, now caught by the probe alone.**

- [ ] **Step 5: Restart the process and confirm it clears**

Restart, call `getVersionInfo()`. Expected: `build.buildId === NEW`, `stale === false`, no warning.

- [ ] **Step 6: Clean up** the empty test commit if made (`git reset --soft HEAD~1` before the real work, or drop it
      during the final rebase) so it does not ship.

---

## Task 7: Update the deploy-check runbook memory (post-merge)

**Files:** none in repo — memory file outside the worktree.

- [ ] **Step 1:** After merge + prod redeploy, update
      `~/.claude/projects/-Users-kip-src-omnifocus-mcp/memory/reference_version_endpoint_deploy_check.md` to record that
      `buildId` now reflects the LOADED process and the endpoint self-reports `stale`, so the separate behavioral-probe
      requirement is dropped (replaced by "check `stale === false` on the first post-deploy version probe"). Update the
      `MEMORY.md` hook line accordingly.

---

## Self-Review

**Spec coverage:**

- Component 1 (stamp script) → Task 3. ✓
- Component 2 (postbuild) → Task 3 Step 2. ✓
- Component 3 (module-load capture, dev fallback, checkout, stale, warning, process) → Tasks 1 + 2. ✓ (capture is
  memoized + warmed at module load, functionally equivalent to a top-level const and unit-testable.)
- Component 4 (VersionInfo additive fields) → Task 2 Step 3. ✓
- Error handling (never throws) → readCheckoutHash/readRequestTimeBuild/doRead all try-catch to `unknown`/sentinel. ✓
- Testing scenarios 1-5 → Task 2 tests + Task 1 tests. ✓
- Testing scenario 6 (system-v2 mock) → Task 4. ✓
- Live acceptance → Task 6. ✓
- Runbook update → Task 7. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"; every code step shows full code. ✓

**Type consistency:** `LoadedBuild` (build-info.ts) used by `readLoadedBuild` and mocked identically in version.test.ts;
`VersionInfo` fields (`checkout`/`stale`/`warning?`/`process`) consistent across interface, getVersionInfo return, and
the system-v2 mock. `buildId` derived in build-info.ts and consumed (never re-derived) in version.ts. ✓

**Note on the request-time git in dev fallback:** `readRequestTimeBuild` sets `buildId: 'dev-unstamped'` directly, so
dev never reports a misleading stamped-looking id. ✓
