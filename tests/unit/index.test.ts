import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };
const originalPlatform = process.platform;

const serverConnectMock = vi.fn<() => Promise<void>>(() => Promise.resolve());
const serverCloseMock = vi.fn<() => Promise<void>>(() => Promise.resolve());
const ServerMock = vi.fn(() => ({
  connect: serverConnectMock,
  close: serverCloseMock,
}));

const transportInstances: unknown[] = [];
const StdioServerTransportMock = vi.fn(() => {
  const transport = { id: transportInstances.length + 1 };
  transportInstances.push(transport);
  return transport;
});

const cacheManagerInstances: Array<{
  getStats: ReturnType<typeof vi.fn>;
  warm: ReturnType<typeof vi.fn>;
}> = [];
const CacheManagerMock = vi.fn(() => {
  const instance = {
    getStats: vi.fn(() => ({
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      checksumFailures: 0,
      checksumFailureRate: 0,
    })),
    warm: vi.fn(),
  };
  cacheManagerInstances.push(instance);
  return instance;
});

const cacheWarmerInstances: Array<{ warmCache: ReturnType<typeof vi.fn>; options: any }> = [];
const CacheWarmerMock = vi.fn((_cache, options) => {
  const instance = {
    warmCache: vi.fn(() =>
      Promise.resolve({
        enabled: true,
        results: [{ operation: 'demo', success: true, duration: 1 }],
      }),
    ),
    options,
  };
  cacheWarmerInstances.push(instance);
  return instance;
});

const permissionCheckerInstance = {
  checkPermissions: vi.fn(() => Promise.resolve({ hasPermission: true })),
};
const getPermissionCheckerMock = vi.fn(() => permissionCheckerInstance);
class MockPermissionChecker {
  static getInstance() {
    return getPermissionCheckerMock();
  }
}

const loggerInstance = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const createLoggerMock = vi.fn(() => loggerInstance);

const getVersionInfoMock = vi.fn(() => ({
  name: 'omnifocus-mcp-cached',
  version: 'test',
  build: { buildId: 'unit' },
}));

const registerPromptsMock = vi.fn();
let lastRegisteredPendingOps: Set<Promise<unknown>> | undefined;
const registerToolsMock = vi.fn((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
  lastRegisteredPendingOps = pendingOps;
});

const setPendingOperationsTrackerMock = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: ServerMock,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: StdioServerTransportMock,
}));

vi.mock('../../src/tools/index.js', () => ({
  registerTools: registerToolsMock,
}));

vi.mock('../../src/prompts/index.js', () => ({
  registerPrompts: registerPromptsMock,
}));

vi.mock('../../src/cache/CacheManager.js', () => ({
  CacheManager: CacheManagerMock,
}));

vi.mock('../../src/cache/CacheWarmer.js', () => ({
  CacheWarmer: CacheWarmerMock,
}));

vi.mock('../../src/utils/permissions.js', () => ({
  PermissionChecker: MockPermissionChecker,
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('../../src/utils/version.js', () => ({
  getVersionInfo: getVersionInfoMock,
}));

vi.mock('../../src/omnifocus/OmniAutomation.js', () => ({
  setPendingOperationsTracker: setPendingOperationsTrackerMock,
}));

function resetEnv(overrides: Record<string, string | undefined> = {}) {
  process.env = { ...originalEnv, ...overrides };
}

async function importEntry() {
  return import('../../src/index.js');
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('server entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    serverConnectMock.mockClear();
    serverCloseMock.mockClear();
    ServerMock.mockClear();
    StdioServerTransportMock.mockClear();
    transportInstances.length = 0;
    cacheManagerInstances.length = 0;
    CacheManagerMock.mockClear();
    cacheWarmerInstances.length = 0;
    CacheWarmerMock.mockClear();
    registerToolsMock.mockClear();
    registerToolsMock.mockImplementation((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
      lastRegisteredPendingOps = pendingOps;
    });
    registerPromptsMock.mockClear();
    setPendingOperationsTrackerMock.mockClear();
    getPermissionCheckerMock.mockClear();
    permissionCheckerInstance.checkPermissions.mockClear();
    createLoggerMock.mockClear();
    lastRegisteredPendingOps = undefined;
    resetEnv({ MCP_SKIP_AUTO_START: 'true' });
  });

  afterEach(() => {
    resetEnv();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.stdin.removeAllListeners('end');
    process.stdin.removeAllListeners('close');
    process.stdout.removeAllListeners('error');
    process.stderr.removeAllListeners('error');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('connects the transport before cache warming completes (OMN-228)', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development', CI: 'false' });
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const warmDeferred = createDeferred<{ enabled: boolean; results: unknown[] }>();
    CacheWarmerMock.mockImplementationOnce((_cache, options) => {
      const instance = { warmCache: vi.fn(() => warmDeferred.promise), options };
      cacheWarmerInstances.push(instance);
      return instance;
    });
    const { runServer } = await importEntry();

    // runServer must return (transport connected) while the warm is still in flight
    await runServer();

    expect(serverConnectMock).toHaveBeenCalledTimes(1);
    expect(cacheWarmerInstances[0].warmCache).toHaveBeenCalledTimes(1);

    // The warm must be tracked as a pending operation so the stdin-EOF
    // pre-warm path (node dist/index.js < /dev/null) waits for it to finish.
    expect(lastRegisteredPendingOps?.size).toBe(1);

    warmDeferred.resolve({ enabled: true, results: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lastRegisteredPendingOps?.size).toBe(0);
  });

  it('passes a startup gate to registerTools that opens when the warm completes (OMN-228)', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development', CI: 'false' });
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const warmDeferred = createDeferred<{ enabled: boolean; results: unknown[] }>();
    CacheWarmerMock.mockImplementationOnce((_cache, options) => {
      const instance = { warmCache: vi.fn(() => warmDeferred.promise), options };
      cacheWarmerInstances.push(instance);
      return instance;
    });
    let capturedGate: Promise<void> | undefined;
    registerToolsMock.mockImplementation(
      (_server, _cache, pendingOps: Set<Promise<unknown>>, startupGate?: Promise<void>) => {
        lastRegisteredPendingOps = pendingOps;
        capturedGate = startupGate;
      },
    );
    const { runServer } = await importEntry();

    await runServer();

    expect(capturedGate).toBeInstanceOf(Promise);
    let gateOpen = false;
    void capturedGate!.then(() => {
      gateOpen = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateOpen).toBe(false);

    warmDeferred.resolve({ enabled: true, results: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateOpen).toBe(true);
  });

  it('opens the startup gate even when the warm fails (OMN-228)', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development', CI: 'false' });
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    CacheWarmerMock.mockImplementationOnce((_cache, options) => {
      const instance = { warmCache: vi.fn(() => Promise.reject(new Error('warm exploded'))), options };
      cacheWarmerInstances.push(instance);
      return instance;
    });
    let capturedGate: Promise<void> | undefined;
    registerToolsMock.mockImplementation(
      (_server, _cache, pendingOps: Set<Promise<unknown>>, startupGate?: Promise<void>) => {
        lastRegisteredPendingOps = pendingOps;
        capturedGate = startupGate;
      },
    );
    const { runServer } = await importEntry();

    await runServer();

    // Gate must resolve (not reject, not hang) so tools are never blocked forever
    await expect(capturedGate).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lastRegisteredPendingOps?.size).toBe(0);
  });

  it('passes an already-open gate when warming is disabled (OMN-228)', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'test', SANDBOX_GUARD_ENABLED: 'true' });
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    let capturedGate: Promise<void> | undefined;
    registerToolsMock.mockImplementation(
      (_server, _cache, pendingOps: Set<Promise<unknown>>, startupGate?: Promise<void>) => {
        lastRegisteredPendingOps = pendingOps;
        capturedGate = startupGate;
      },
    );
    const { runServer } = await importEntry();

    await runServer();

    await expect(capturedGate).resolves.toBeUndefined();
  });

  it('initializes the server, registers tools, and warms the cache', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development', CI: 'false' });
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const { runServer } = await importEntry();

    await runServer();

    const cacheManager = cacheManagerInstances[0];
    const cacheWarmer = cacheWarmerInstances[0];
    const transport = StdioServerTransportMock.mock.results[0]?.value;

    expect(cacheManager).toBeDefined();
    expect(cacheWarmer).toBeDefined();
    expect(transport).toBeDefined();
    expect(ServerMock).toHaveBeenCalledTimes(1);
    expect(setPendingOperationsTrackerMock).toHaveBeenCalledTimes(1);
    expect(registerPromptsMock).toHaveBeenCalledTimes(1);
    expect(registerToolsMock).toHaveBeenCalledTimes(1);
    expect(lastRegisteredPendingOps).toBeInstanceOf(Set);
    expect(registerToolsMock).toHaveBeenCalledWith(
      expect.any(Object),
      cacheManager,
      lastRegisteredPendingOps,
      expect.any(Promise),
    );
    expect(cacheWarmer.options.enabled).toBe(true);
    expect(cacheWarmer.warmCache).toHaveBeenCalledTimes(1);
    expect(cacheManager.getStats).toHaveBeenCalledTimes(1);
    expect(serverConnectMock).toHaveBeenCalledWith(transport);
    expect(permissionCheckerInstance.checkPermissions).toHaveBeenCalledTimes(1);
  });

  it('disables cache warming in CI environments', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development', CI: 'true' });
    const { runServer } = await importEntry();

    await runServer();

    const cacheWarmer = cacheWarmerInstances[0];
    expect(cacheWarmer).toBeDefined();
    expect(cacheWarmer.options.enabled).toBe(false);
    expect(cacheWarmer.warmCache).not.toHaveBeenCalled();
  });

  it('waits for pending operations on stdin close before exiting', async () => {
    // OMN-46: explicit NODE_ENV='development' (matches the two other tests in this file)
    // so runServer's startup sandbox-guard assertion is satisfied. Without this the
    // vitest-inherited NODE_ENV='test' would trip assertSandboxGuardAtStartup().
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development' });
    const deferred = createDeferred<void>();
    registerToolsMock.mockImplementation((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
      lastRegisteredPendingOps = pendingOps;
    });
    const { runServer } = await importEntry();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      await runServer();

      lastRegisteredPendingOps?.add(deferred.promise);
      (process.stdin as any).emit('end');
      expect(serverCloseMock).not.toHaveBeenCalled();

      deferred.resolve();
      await new Promise((resolve) => setImmediate(resolve));

      expect(serverCloseMock).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('waits for pending operations on SIGTERM before exiting (OMN-261 review)', async () => {
    // Previously stdio mode registered no SIGTERM handler at all, so an
    // external SIGTERM (e.g. a test harness killing this process directly)
    // hit Node's default disposition — immediate termination, no drain of
    // pendingOperations — instead of the same graceful path stdin-close uses.
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development' });
    const deferred = createDeferred<void>();
    registerToolsMock.mockImplementation((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
      lastRegisteredPendingOps = pendingOps;
    });
    const { runServer } = await importEntry();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      await runServer();

      lastRegisteredPendingOps?.add(deferred.promise);
      process.emit('SIGTERM');
      expect(serverCloseMock).not.toHaveBeenCalled();

      deferred.resolve();
      await new Promise((resolve) => setImmediate(resolve));

      expect(serverCloseMock).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('waits for pending operations on SIGINT before exiting (OMN-261 review)', async () => {
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development' });
    const deferred = createDeferred<void>();
    registerToolsMock.mockImplementation((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
      lastRegisteredPendingOps = pendingOps;
    });
    const { runServer } = await importEntry();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      await runServer();

      lastRegisteredPendingOps?.add(deferred.promise);
      process.emit('SIGINT');
      expect(serverCloseMock).not.toHaveBeenCalled();

      deferred.resolve();
      await new Promise((resolve) => setImmediate(resolve));

      expect(serverCloseMock).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('force-exits if pending operations never drain within the SIGTERM/SIGINT timeout (OMN-261 review)', async () => {
    // A hung osascript/JXA call (e.g. blocked on an OmniFocus permission
    // dialog) must not make the process permanently unkillable — the signal
    // handlers bound the drain wait and force-exit if it's exceeded, unlike
    // the unbounded stdin-close/EPIPE paths.
    resetEnv({ MCP_SKIP_AUTO_START: 'true', NODE_ENV: 'development' });
    const neverResolves = new Promise<void>(() => {});
    registerToolsMock.mockImplementation((_server, _cache, pendingOps: Set<Promise<unknown>>) => {
      lastRegisteredPendingOps = pendingOps;
    });
    const { runServer } = await importEntry();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      await runServer();
      lastRegisteredPendingOps?.add(neverResolves);

      vi.useFakeTimers();
      process.emit('SIGTERM');
      await vi.advanceTimersByTimeAsync(5000);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(serverCloseMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      exitSpy.mockRestore();
    }
  });
});
