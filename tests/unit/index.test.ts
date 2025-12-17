import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };
const originalPlatform = process.platform;

const serverConnectMock = vi.fn<[], Promise<void>>(() => Promise.resolve());
const serverCloseMock = vi.fn<[], Promise<void>>(() => Promise.resolve());
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
const registerToolsMock = vi.fn(async (_server, _cache, pendingOps: Set<Promise<unknown>>) => {
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

function resetEnv(overrides: NodeJS.ProcessEnv = {}) {
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
    registerToolsMock.mockImplementation(async (_server, _cache, pendingOps: Set<Promise<unknown>>) => {
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
    expect(registerToolsMock).toHaveBeenCalledWith(expect.any(Object), cacheManager, lastRegisteredPendingOps);
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
    const deferred = createDeferred<void>();
    registerToolsMock.mockImplementation(async (_server, _cache, pendingOps: Set<Promise<unknown>>) => {
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
});
