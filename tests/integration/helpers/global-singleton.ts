/**
 * Vitest's default `isolate: true` (the `forks` pool default) resets every
 * test file's ES-module top-level bindings to a fresh instance, even under
 * `pool:'forks', poolOptions.forks.singleFork:true` (one OS process, but one
 * module registry per file). `globalThis` is the one thing that per-file
 * isolation does NOT reset — same JS realm/object across files in the same
 * fork. Use this to persist state across integration test files within a
 * single suite run. See OMN-261.
 */
export function getGlobalSlot<T>(key: string, initial: () => T): T {
  const globalKey = Symbol.for(`omnifocus-mcp:${key}`);
  const store = globalThis as unknown as Record<symbol, T>;
  if (store[globalKey] === undefined) {
    store[globalKey] = initial();
  }
  return store[globalKey];
}
