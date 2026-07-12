/**
 * Vitest's default `isolate: true` (the `forks` pool default) resets every
 * test file's ES-module top-level bindings to a fresh instance, even under
 * `pool:'forks', poolOptions.forks.singleFork:true` (one OS process, but one
 * module registry per file). `globalThis` is the one thing that per-file
 * isolation does NOT reset — same JS realm/object across files in the same
 * fork. Use this to persist state across integration test files within a
 * single suite run. See OMN-261.
 */
/**
 * Builds the same globalThis-registry key getGlobalSlot() uses internally.
 * Exported so callers that need to CLEAR a slot (test beforeEach hooks,
 * mainly) never hand-reconstruct the `omnifocus-mcp:${key}` string — a
 * hand-built copy silently stops matching if this prefix or scheme changes.
 */
export function globalSlotKey(key: string): symbol {
  return Symbol.for(`omnifocus-mcp:${key}`);
}

export function getGlobalSlot<T>(key: string, initial: () => T): T {
  const globalKey = globalSlotKey(key);
  const store = globalThis as unknown as Record<symbol, T>;
  if (store[globalKey] === undefined) {
    store[globalKey] = initial();
  }
  return store[globalKey];
}

/** Deletes a slot's globalThis-registry entry, e.g. to reset state between tests. */
export function clearGlobalSlot(key: string): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[globalSlotKey(key)];
}
