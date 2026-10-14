import { createLogger } from './logger.js';

const logger = createLogger('shutdown');

/**
 * Resolve once every pending operation settles, or after `timeoutMs`,
 * whichever comes first. Returns true when the set drained in time.
 * Never rejects: a failed operation still counts as settled.
 */
export async function drainPendingOperations(
  pendingOperations: Set<Promise<unknown>>,
  timeoutMs: number,
): Promise<boolean> {
  if (pendingOperations.size === 0) return true;
  logger.info(`Waiting up to ${timeoutMs}ms for ${pendingOperations.size} pending operations...`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const drained = Promise.allSettled([...pendingOperations]).then(() => true as const);
  try {
    const ok = await Promise.race([drained, timedOut]);
    if (!ok) logger.warn(`Pending operations did not drain within ${timeoutMs}ms; exiting anyway`);
    return ok;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve when `promise` settles or after `timeoutMs`; never rejects. */
async function settleWithin(promise: Promise<unknown>, timeoutMs: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(`${label} did not finish within ${timeoutMs}ms; continuing shutdown`);
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([
      promise.catch((error: unknown) => {
        logger.error(`${label} failed during shutdown (continuing):`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface HttpShutdownDeps {
  sessionManager: { closeAllSessions(): Promise<void> };
  httpServerManager: { stop(): Promise<void> };
  pendingOperations: Set<Promise<unknown>>;
  exit: (code: number) => void;
  /** Bound on waiting for in-flight tool/osascript/cache-warm promises. */
  drainTimeoutMs?: number;
  /** Bound on each close step (sessions, listener). */
  closeTimeoutMs?: number;
}

/**
 * OMN-347: HTTP-mode signal handler. Differences from the old handler:
 * - one exit only: repeated signals are no-ops once shutdown has started;
 * - the listener stops accepting connections FIRST, but its close is awaited
 *   only after sessions close, because `httpServer.close` waits for open
 *   connections and an open SSE GET stream held it forever;
 * - pending operations (tool calls, osascript, cache warm) are drained, bounded;
 * - every step is bounded, so a hung step can't keep the process alive.
 */
export function createHttpShutdown(deps: HttpShutdownDeps): (signal: string) => Promise<void> {
  const drainTimeoutMs = deps.drainTimeoutMs ?? 5000;
  const closeTimeoutMs = deps.closeTimeoutMs ?? 5000;
  let started = false;

  return async (signal: string) => {
    if (started) return;
    started = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Stop accepting first: httpServer.close refuses new connections at once,
    // so no session or tool call can start after the drain snapshot. Only its
    // completion waits for open connections (the SSE hang), so it is awaited
    // last, after sessions close. The catch is attached now so an early
    // rejection is never unhandled.
    logger.info('Stopping HTTP server (no new connections)...');
    const stopping = deps.httpServerManager.stop().catch((error: unknown) => {
      logger.error('Stopping HTTP server failed during shutdown (continuing):', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const drained = await drainPendingOperations(deps.pendingOperations, drainTimeoutMs);

    logger.info('Closing all active sessions...');
    await settleWithin(deps.sessionManager.closeAllSessions(), closeTimeoutMs, 'Closing sessions');

    await settleWithin(stopping, closeTimeoutMs, 'Stopping HTTP server');

    logger.info('HTTP server shutdown complete');
    deps.exit(drained ? 0 : 1);
  };
}
